import nodemailer from 'nodemailer'
import logger from './logger.js'

const GMAIL_USER = process.env.GMAIL_USER?.trim()
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD?.trim()
const GMAIL_FROM = process.env.GMAIL_FROM?.trim() || GMAIL_USER

let _transporter = null

function getTransporter() {
  if (_transporter) return _transporter
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER oder GMAIL_APP_PASSWORD nicht konfiguriert')
  }
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  })
  return _transporter
}

export async function sendPurchaseConfirmation({ to, purchaseDate }) {
  const dateFormatted = new Date(purchaseDate).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin',
  })

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Georgia,serif;background:#faf9f7;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;padding:32px 40px;background:#faf9f7;border:1px solid #e2ddd6">
  <p style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:#9b7c4d;margin:0 0 24px">Signifikation &middot; Bestellbestätigung</p>
  <h1 style="font-size:1.4rem;color:#1a1310;margin:0 0 6px;font-weight:normal">Gesamtausgabe freigeschaltet</h1>
  <p style="color:#5a4e45;margin:0 0 32px;font-size:0.9rem">Vielen Dank für deinen Kauf.</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:32px;font-size:0.88rem">
    <tr style="border-bottom:1px solid #e2ddd6">
      <td style="padding:10px 0;color:#7a6e65">Produkt</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">Gesamtausgabe – Signifikation</td>
    </tr>
    <tr style="border-bottom:1px solid #e2ddd6">
      <td style="padding:10px 0;color:#7a6e65">Betrag</td>
      <td style="padding:10px 0;text-align:right;color:#1a1310">4,99&nbsp;€</td>
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
  </p>

  <hr style="border:none;border-top:1px solid #e2ddd6;margin-bottom:20px">
  <p style="font-size:0.7rem;color:#9a8e85;text-align:center;margin:0;line-height:1.6">
    Joscha Moritz Fresmann &middot; Im Romberg 10 &middot; 45657 Recklinghausen<br>
    Gemäß §&nbsp;19 UStG wird keine Umsatzsteuer ausgewiesen.
  </p>
</div>
</body>
</html>`

  const text = `Signifikation – Bestellbestätigung

Gesamtausgabe freigeschaltet
Vielen Dank für deinen Kauf.

Produkt:       Gesamtausgabe – Signifikation
Betrag:        4,99 €
Datum:         ${dateFormatted} Uhr
Umsatzsteuer:  Keine (§ 19 UStG)

Widerrufsrecht: Da du vor dem Kauf der sofortigen Bereitstellung der digitalen
Inhalte ausdrücklich zugestimmt und dein Wissen vom Erlöschen des Widerrufsrechts
bestätigt hast, ist das Widerrufsrecht gemäß § 356 Abs. 5 BGB mit Freischaltung
der Gesamtausgabe erloschen.

Nutzungsbedingungen: https://signifikation.de/nutzungsbedingungen.html
Fragen: info@signifikation.de

---
Joscha Moritz Fresmann · Im Romberg 10 · 45657 Recklinghausen
Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.`

  try {
    const transporter = getTransporter()
    await transporter.sendMail({
      from: `"Signifikation" <${GMAIL_FROM}>`,
      to,
      subject: 'Bestellbestätigung – Gesamtausgabe freigeschaltet',
      text,
      html,
    })
    logger.info({ to }, 'Bestellbestätigung gesendet')
  } catch (err) {
    // Fehlgeschlagene Mail darf die Webhook-Verarbeitung nicht blockieren
    logger.error({ err, to }, 'Bestellbestätigung konnte nicht gesendet werden')
  }
}
