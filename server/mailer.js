import nodemailer from 'nodemailer'
import logger from './logger.js'

const GMAIL_USER = process.env.GMAIL_USER?.trim()
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.trim()
const GMAIL_FROM = process.env.GMAIL_FROM?.trim() || GMAIL_USER

let _transporter = null

// Ob überhaupt versendet werden kann. Wird von auth/index.js gebraucht, um
// Passwort-Reset und Verifikationsmail gar nicht erst anzubieten, wenn kein
// Transport konfiguriert ist – sonst klickt der Nutzer ins Leere.
export function isMailConfigured() {
  return !!(GMAIL_USER && GMAIL_APP_PASSWORD)
}

function getTransporter() {
  if (_transporter) return _transporter
  // Trockenlauf für scripts/mail-preview.mjs: nodemailer baut die Nachricht
  // vollständig, verschickt sie aber nicht, sondern gibt sie als JSON zurück.
  // Nur so lassen sich die Mails ansehen, ohne echte Zustellung zu riskieren.
  if (process.env.MAIL_TRANSPORT === 'json') {
    _transporter = nodemailer.createTransport({ jsonTransport: true })
    return _transporter
  }
  if (!isMailConfigured()) {
    throw new Error('GMAIL_USER oder GMAIL_APP_PASSWORD nicht konfiguriert')
  }
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
  return _transporter
}

// Rahmen aller Systemmails (Wörterbuch-Ästhetik wie die App: Pergament,
// Serifen, roter Akzent). Inline-Styles sind in E-Mails Pflicht – Gmail und
// Outlook strippen <style>-Blöcke.
function renderLayout({ kicker, title, lead, bodyHtml, footerHtml }) {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Georgia,serif;background:#faf9f7;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;padding:32px 40px;background:#faf9f7;border:1px solid #e2ddd6">
  <p style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#9b7c4d;margin:0 0 24px">Signifikation &middot; ${kicker}</p>
  <h1 style="font-size:1.4rem;color:#1a1310;margin:0 0 6px;font-weight:normal">${title}</h1>
  <p style="color:#5a4e45;margin:0 0 32px;font-size:0.9rem">${lead}</p>

${bodyHtml}

  <hr style="border:none;border-top:1px solid #e2ddd6;margin-bottom:20px">
  <p style="font-size:0.7rem;color:#9a8e85;text-align:center;margin:0;line-height:1.6">
${footerHtml}
  </p>
</div>
</body>
</html>`
}

// Fußzeile für Willkommens- und Reset-Mail: nur Verweise, keine Anschrift.
// Beides sind reine Transaktionsmails ohne Werbung; die Anbieterkennzeichnung
// liegt einen Klick entfernt auf der verlinkten Impressumsseite.
const LINK_STYLE = 'color:#9a8e85;text-decoration:underline'
const LINKS_FOOTER_HTML = `    <a href="https://signifikation.de/impressum.html" style="${LINK_STYLE}">Impressum</a>
    &middot; <a href="https://signifikation.de/datenschutz.html" style="${LINK_STYLE}">Datenschutz</a>
    &middot; <a href="https://signifikation.de/nutzungsbedingungen.html" style="${LINK_STYLE}">Nutzungsbedingungen</a>`
const LINKS_FOOTER_TEXT = `Impressum:            https://signifikation.de/impressum.html
Datenschutz:          https://signifikation.de/datenschutz.html
Nutzungsbedingungen:  https://signifikation.de/nutzungsbedingungen.html`

// Die Bestellbestätigung ist die Rechnung zum Kauf und behält deshalb die
// vollständige Anschrift: § 14 Abs. 4 UStG bzw. § 33 UStDV (Kleinbetrags-
// rechnung) verlangen Name UND Anschrift des leistenden Unternehmers im
// Beleg selbst – ein Link darauf genügt dafür nicht. Lehrkräfte reichen den
// Beleg außerdem zur Steuer ein.
const RECHNUNG_ANSCHRIFT_HTML = `    Joscha Moritz Fresmann &middot; Im Romberg 10 &middot; 45657 Recklinghausen`
const RECHNUNG_ANSCHRIFT_TEXT = 'Joscha Moritz Fresmann · Im Romberg 10 · 45657 Recklinghausen'

// Ein grosser, klickbarer Button. Kein <button>, kein Flex – in E-Mail-Clients
// trägt nur ein <a> mit Inline-Padding zuverlässig.
function renderButton(url, label) {
  return `  <p style="margin:0 0 28px">
    <a href="${url}" style="display:inline-block;padding:13px 26px;background:#9b1c1c;color:#faf9f7;text-decoration:none;font-size:0.92rem;letter-spacing:0.02em">${label}</a>
  </p>`
}

// Liefert das nodemailer-Info-Objekt (truthy) oder null bei Fehlschlag.
async function deliver({ to, subject, text, html, context }) {
  try {
    const transporter = getTransporter()
    const info = await transporter.sendMail({
      from: `"Signifikation" <${GMAIL_FROM}>`,
      to,
      subject,
      text,
      html,
    })
    logger.info({ to }, `${context} gesendet`)
    return info ?? null
  } catch (err) {
    logger.error({ err, to }, `${context} konnte nicht gesendet werden`)
    return null
  }
}

export async function sendPurchaseConfirmation({ to, purchaseDate, amount }) {
  const amountFormatted = amount
    ? `${parseFloat(amount).toFixed(2).replace('.', ',')} €`
    : '–'
  const dateFormatted = new Date(purchaseDate).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin',
  })

  const html = renderLayout({
    kicker: 'Bestellbestätigung',
    title: 'Gesamtausgabe freigeschaltet',
    lead: 'Vielen Dank für deinen Kauf.',
    bodyHtml: `  <table style="width:100%;border-collapse:collapse;margin-bottom:32px;font-size:0.88rem">
    <tr style="border-bottom:1px solid #e2ddd6">
      <td style="padding:10px 0;color:#7a6e65">Produkt</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">Gesamtausgabe – Signifikation</td>
    </tr>
    <tr style="border-bottom:1px solid #e2ddd6">
      <td style="padding:10px 0;color:#7a6e65">Betrag</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">${amountFormatted}</td>
    </tr>
    <tr style="border-bottom:1px solid #e2ddd6">
      <td style="padding:10px 0;color:#7a6e65">Datum</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">${dateFormatted}&nbsp;Uhr</td>
    </tr>
    <tr>
      <td style="padding:10px 0;color:#7a6e65">Umsatzsteuer</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">Keine (§&nbsp;19 UStG)</td>
    </tr>
  </table>

  <p style="font-size:0.78rem;color:#7a6e65;line-height:1.65;margin-bottom:14px">
    <strong style="color:#5a4e45">Widerrufsrecht:</strong> Da du vor dem Kauf der sofortigen Bereitstellung
    der digitalen Inhalte ausdrücklich zugestimmt und dein Wissen vom Erlöschen des Widerrufsrechts bestätigt
    hast, ist das Widerrufsrecht gemäß §&nbsp;356 Abs.&nbsp;5 BGB mit Freischaltung der Gesamtausgabe erloschen.
  </p>
  <p style="font-size:0.78rem;color:#7a6e65;line-height:1.65;margin-bottom:32px">
    Vollständige <a href="https://signifikation.de/nutzungsbedingungen.html" style="color:#9b1c1c;text-decoration:none">Nutzungsbedingungen</a>
    &middot; Fragen: <a href="mailto:info@signifikation.de" style="color:#9b1c1c;text-decoration:none">info@signifikation.de</a>
  </p>`,
    footerHtml: `${RECHNUNG_ANSCHRIFT_HTML}<br>
    Gemäß §&nbsp;19 UStG wird keine Umsatzsteuer ausgewiesen.`,
  })

  const text = `Signifikation – Bestellbestätigung

Gesamtausgabe freigeschaltet
Vielen Dank für deinen Kauf.

Produkt:       Gesamtausgabe – Signifikation
Betrag:        ${amountFormatted}
Datum:         ${dateFormatted} Uhr
Umsatzsteuer:  Keine (§ 19 UStG)

Widerrufsrecht: Da du vor dem Kauf der sofortigen Bereitstellung der digitalen
Inhalte ausdrücklich zugestimmt und dein Wissen vom Erlöschen des Widerrufsrechts
bestätigt hast, ist das Widerrufsrecht gemäß § 356 Abs. 5 BGB mit Freischaltung
der Gesamtausgabe erloschen.

Nutzungsbedingungen: https://signifikation.de/nutzungsbedingungen.html
Fragen: info@signifikation.de

---
${RECHNUNG_ANSCHRIFT_TEXT}
Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.`

  // Fehlgeschlagene Mail darf die Webhook-Verarbeitung nicht blockieren
  return deliver({ to, subject: 'Bestellbestätigung – Gesamtausgabe freigeschaltet', text, html, context: 'Bestellbestätigung' })
}

// Passwort-Reset. Wirft bei Fehlschlag, damit better-auth den Aufruf als
// fehlgeschlagen behandelt – anders als bei der Kaufbestätigung ist eine still
// verschluckte Mail hier das Ende des Flows und der Nutzer bliebe ausgesperrt.
export async function sendPasswordResetMail({ to, url, expiresInMinutes = 60 }) {
  const html = renderLayout({
    kicker: 'Passwort zurücksetzen',
    title: 'Neues Passwort setzen',
    lead: 'Du hast angefragt, dein Passwort zurückzusetzen.',
    bodyHtml: `${renderButton(url, 'Passwort zurücksetzen')}

  <p style="font-size:0.82rem;color:#5a4e45;line-height:1.65;margin:0 0 14px">
    Der Link ist ${expiresInMinutes}&nbsp;Minuten gültig und kann nur einmal verwendet werden.
    Falls der Button nicht funktioniert, kopiere diese Adresse in die Adresszeile deines Browsers:
  </p>
  <p style="font-size:0.72rem;color:#7a6e65;line-height:1.5;word-break:break-all;margin:0 0 32px">
    <a href="${url}" style="color:#9b1c1c;text-decoration:none">${url}</a>
  </p>

  <p style="font-size:0.78rem;color:#7a6e65;line-height:1.65;margin-bottom:32px">
    <strong style="color:#5a4e45">Du warst das nicht?</strong> Dann ignoriere diese E-Mail einfach –
    ohne den Link bleibt dein Passwort unverändert. Fragen:
    <a href="mailto:info@signifikation.de" style="color:#9b1c1c;text-decoration:none">info@signifikation.de</a>
  </p>`,
    footerHtml: LINKS_FOOTER_HTML,
  })

  const text = `Signifikation – Passwort zurücksetzen

Neues Passwort setzen
Du hast angefragt, dein Passwort zurückzusetzen.

Link (${expiresInMinutes} Minuten gültig, nur einmal verwendbar):
${url}

Du warst das nicht? Dann ignoriere diese E-Mail einfach – ohne den Link bleibt
dein Passwort unverändert.

Fragen: info@signifikation.de

---
${LINKS_FOOTER_TEXT}`

  const info = await deliver({ to, subject: 'Passwort zurücksetzen – Signifikation', text, html, context: 'Passwort-Reset-Mail' })
  if (!info) throw new Error('Passwort-Reset-Mail konnte nicht gesendet werden')
  return info
}

// Willkommensmail nach der Registrierung. Der Bestätigungslink ist optional –
// das Konto ist sofort nutzbar (requireEmailVerification bleibt aus). Fehler
// werden geschluckt: eine gescheiterte Willkommensmail darf die Registrierung
// nicht kippen.
export async function sendWelcomeMail({ to, name, verificationUrl }) {
  const anrede = name?.trim() ? `Hallo ${name.trim()},` : 'Hallo,'

  const verifyHtml = verificationUrl
    ? `${renderButton(verificationUrl, 'E-Mail-Adresse bestätigen')}

  <p style="font-size:0.78rem;color:#7a6e65;line-height:1.65;margin:0 0 32px">
    Die Bestätigung ist freiwillig – dein Konto funktioniert auch ohne. Sie stellt nur sicher,
    dass wir dich erreichen, falls du einmal dein Passwort zurücksetzen musst.
  </p>`
    : ''

  const html = renderLayout({
    kicker: 'Willkommen',
    title: 'Dein Konto ist angelegt',
    lead: `${anrede} schön, dass du dabei bist.`,
    bodyHtml: `  <p style="font-size:0.88rem;color:#5a4e45;line-height:1.7;margin:0 0 24px">
    Ab sofort merkt sich Signifikation deine Ergebnisse, deine Serie und deinen Fortschritt im Kurs –
    auf allen Geräten, auf denen du angemeldet bist.
  </p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:32px;font-size:0.88rem">
    <tr style="border-bottom:1px solid #e2ddd6">
      <td style="padding:10px 0;color:#7a6e65">Täglich</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">Vier Wortspiele, jeden Tag neu</td>
    </tr>
    <tr style="border-bottom:1px solid #e2ddd6">
      <td style="padding:10px 0;color:#7a6e65">Eigenes Lemma</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">Ein selbst gewähltes Wort pro Tag</td>
    </tr>
    <tr>
      <td style="padding:10px 0;color:#7a6e65">Kurs</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">Stationen zu Kollokationen</td>
    </tr>
  </table>

${verifyHtml}
  <p style="font-size:0.78rem;color:#7a6e65;line-height:1.65;margin-bottom:32px">
    Fragen? Antworte einfach auf diese E-Mail oder schreib an
    <a href="mailto:info@signifikation.de" style="color:#9b1c1c;text-decoration:none">info@signifikation.de</a>.
  </p>`,
    footerHtml: LINKS_FOOTER_HTML,
  })

  const text = `Signifikation – Willkommen

Dein Konto ist angelegt
${anrede} schön, dass du dabei bist.

Ab sofort merkt sich Signifikation deine Ergebnisse, deine Serie und deinen
Fortschritt im Kurs – auf allen Geräten, auf denen du angemeldet bist.

Täglich:        Vier Wortspiele, jeden Tag neu
Eigenes Lemma:  Ein selbst gewähltes Wort pro Tag
Kurs:           Stationen zu Kollokationen
${verificationUrl ? `
E-Mail-Adresse bestätigen (freiwillig – dein Konto funktioniert auch ohne):
${verificationUrl}
` : ''}
Fragen? Antworte einfach auf diese E-Mail oder schreib an info@signifikation.de.

---
${LINKS_FOOTER_TEXT}`

  return deliver({ to, subject: 'Willkommen bei Signifikation', text, html, context: 'Willkommensmail' })
}
