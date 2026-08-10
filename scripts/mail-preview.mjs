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
// Auf dem Server ist --send der Funktionstest fuer die Gmail-Zugangsdaten:
// laeuft er durch und die Mail kommt an, stimmen GMAIL_USER/GMAIL_APP_PASSWORD.
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
  process.env.GMAIL_USER ||= 'vorschau@signifikation.de'
  process.env.GMAIL_APP_PASSWORD ||= 'vorschau'
}

const { isMailConfigured, sendPasswordResetMail, sendPurchaseConfirmation, sendWelcomeMail } =
  await import('../server/mailer.js')

if (recipient && !isMailConfigured()) {
  console.error('GMAIL_USER/GMAIL_APP_PASSWORD fehlen – ohne die kann nichts verschickt werden.')
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
  for (const name of selected) {
    await mails[name]()
    console.log(`✓ ${name} an ${recipient} verschickt`)
  }
  console.log('\nKommt nichts an: Spam-Ordner pruefen, dann das Log auf "konnte nicht gesendet werden".')
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
