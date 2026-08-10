// Systemmails ansehen oder testweise verschicken.
//
//   node scripts/mail-preview.mjs                    -> Trockenlauf, schreibt HTML/TXT nach .mail-preview/
//   node scripts/mail-preview.mjs --send du@mail.de  -> verschickt alle drei echt (braucht GMAIL_*)
//   node scripts/mail-preview.mjs --send du@mail.de --only reset
//
// Der Trockenlauf haengt an nodemailers jsonTransport (MAIL_TRANSPORT=json):
// die Nachricht wird ueber denselben Codepfad vollstaendig gebaut, aber nicht
// zugestellt. So laesst sich das Layout pruefen, ohne jemandem eine Mail zu
// schicken.
//
// Auf dem Server ist --send der Funktionstest fuer die Zugangsdaten: laeuft er
// durch und die Mail kommt an, stimmen SMTP_USER/SMTP_PASSWORD samt Host/Port.
import '../server/env.js'

import { mkdir, writeFile } from 'fs/promises'
import { resolve } from 'path'

const args = process.argv.slice(2)
const sendIndex = args.indexOf('--send')
const recipient = sendIndex >= 0 ? args[sendIndex + 1] : null
const onlyIndex = args.indexOf('--only')
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : null

if (sendIndex >= 0 && (!recipient || recipient.startsWith('--') || !recipient.includes('@'))) {
  console.error('--send braucht eine Empfaengeradresse, z. B. --send du@example.com')
  process.exit(1)
}

// Transport umbiegen, BEVOR mailer.js geladen wird — er wird beim ersten
// Versand gebaut und danach gecacht.
if (!recipient) {
  process.env.MAIL_TRANSPORT = 'json'
  // jsonTransport authentifiziert sich nicht; die Werte muessen nur gesetzt
  // sein, damit isMailConfigured() nicht vorher abbricht.
  process.env.SMTP_USER ||= 'vorschau@signifikation.de'
  process.env.SMTP_PASSWORD ||= 'vorschau'
}

const { isMailConfigured, sendPasswordResetMail, sendPurchaseConfirmation, sendWelcomeMail } =
  await import('../server/mailer.js')

if (recipient && !isMailConfigured()) {
  console.error('SMTP_USER/SMTP_PASSWORD (bzw. GMAIL_USER/GMAIL_APP_PASSWORD) fehlen – ohne die geht nichts.')
  console.error('Erwartete Env-Datei: ' + (process.env.DOTENV_CONFIG_PATH || '<Projektwurzel>/.env'))
  process.exit(1)
}

const to = recipient || 'vorschau@example.invalid'
const BASE = process.env.BETTER_AUTH_URL || 'https://signifikation.de'

const mails = {
  willkommen: () => sendWelcomeMail({
    to,
    name: 'Beispielname',
    verificationUrl: `${BASE}/api/v1/auth/verify-email?token=BEISPIEL-TOKEN&callbackURL=%2F%3Ftab%3Dkonto%26verified%3D1`,
  }),
  reset: () => sendPasswordResetMail({
    to,
    url: `${BASE}/api/v1/auth/reset-password/BEISPIEL-TOKEN?callbackURL=https%3A%2F%2Fsignifikation.de%2F%3Ftab%3Dkonto`,
  }),
  kauf: () => sendPurchaseConfirmation({ to, purchaseDate: Date.now(), amount: '9.99' }),
}

const selected = only ? [only] : Object.keys(mails)
for (const name of selected) {
  if (!mails[name]) {
    console.error(`Unbekannte Mail "${name}" – moeglich: ${Object.keys(mails).join(', ')}`)
    process.exit(1)
  }
}

if (recipient) {
  // Wichtig: Willkommens- und Kaufmail schlucken Versandfehler absichtlich
  // (der Registrierungs- bzw. Webhook-Flow darf nicht kippen) und geben dann
  // null zurueck. Als Testwerkzeug muss dieses Skript den Fehlschlag trotzdem
  // hart melden – sonst meldet es "verschickt", obwohl nichts rausging.
  let failed = 0

  for (const name of selected) {
    try {
      const info = await mails[name]()
      if (!info) {
        console.error(`✗ ${name}: Versand fehlgeschlagen (Grund steht in der Logzeile darueber)`)
        failed++
        continue
      }
      console.log(`✓ ${name} an ${recipient} verschickt${info.messageId ? `  ${info.messageId}` : ''}`)
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`)
      failed++
    }
  }

  if (failed) {
    console.error(`\n${failed} von ${selected.length} Mails NICHT verschickt.`)
    console.error('Bei "Connection timeout" / ETIMEDOUT kommt die SMTP-Verbindung gar nicht erst')
    console.error('zustande – dann liegt es nicht an den Zugangsdaten, sondern am gesperrten Port.')
    console.error('Hetzner sperrt bei Cloud-Servern ausgehend 25/465/587, bis die Freigabe')
    console.error('beantragt ist. Port pruefen:')
    console.error('  timeout 5 bash -c "cat < /dev/null > /dev/tcp/smtp.gmail.com/465" && echo offen || echo blockiert')
    process.exit(1)
  }

  console.log('\nKommt trotz "verschickt" nichts an: Spam-Ordner pruefen.')
  process.exit(0)
}

// Trockenlauf: jsonTransport gibt die fertige Nachricht als JSON-String in
// info.message zurueck — inklusive Betreff, HTML- und Textteil.
const outDir = resolve(process.cwd(), '.mail-preview')
await mkdir(outDir, { recursive: true })

for (const name of selected) {
  const info = await mails[name]()
  if (!info?.message) {
    console.error(`✗ ${name}: keine Nachricht erhalten`)
    continue
  }

  const message = JSON.parse(info.message)
  const htmlPath = resolve(outDir, `${name}.html`)
  const textPath = resolve(outDir, `${name}.txt`)

  await writeFile(htmlPath, message.html, 'utf8')
  await writeFile(textPath, `Betreff: ${message.subject}\nVon:     ${message.from?.address ?? ''}\n\n${message.text}`, 'utf8')

  console.log(`✓ ${name}  „${message.subject}"`)
  console.log(`  ${htmlPath}`)
  console.log(`  ${textPath}`)
}

console.log(`\nVorschauen liegen in ${outDir} – HTML im Browser oeffnen.`)
