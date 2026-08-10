// Systemmails: Bestellbestaetigung, Willkommensmail, Passwort-Reset.
// Nodemailer wird gemockt — getestet wird, WAS rausgeht (Betreff, Link in HTML
// und Text-Teil) und wie Fehlschlaege behandelt werden. Der Unterschied ist
// beabsichtigt: der Passwort-Reset muss werfen (better-auth soll den Fehler
// sehen und dem Nutzer nicht "Link versendet" melden), Kauf- und
// Willkommensmail duerfen den jeweiligen Flow nicht kippen.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMailMock = vi.hoisted(() => vi.fn(async () => ({ messageId: 'test' })))

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}))

// mailer.js liest die Gmail-Credentials auf Modulebene → vor dem Import setzen.
process.env.GMAIL_USER = 'test@signifikation.de'
process.env.GMAIL_APP_PASSWORD = 'xxxx xxxx xxxx xxxx'

const {
  isMailConfigured,
  sendPasswordResetMail,
  sendPurchaseConfirmation,
  sendWelcomeMail,
} = await import('../mailer.js')

const lastMail = () => sendMailMock.mock.calls.at(-1)[0]

describe('mailer', () => {
  beforeEach(() => {
    sendMailMock.mockClear()
    sendMailMock.mockImplementation(async () => ({ messageId: 'test' }))
  })

  it('isMailConfigured meldet den konfigurierten Transport', () => {
    expect(isMailConfigured()).toBe(true)
  })

  describe('Passwort-Reset', () => {
    const URL = 'https://signifikation.de/api/v1/auth/reset-password/tok123?callbackURL=%2F'

    it('setzt den Reset-Link in HTML- und Text-Teil', async () => {
      await sendPasswordResetMail({ to: 'nutzer@test.local', url: URL })

      const mail = lastMail()
      expect(mail.to).toBe('nutzer@test.local')
      expect(mail.subject).toMatch(/passwort/i)
      expect(mail.html).toContain(URL)
      expect(mail.text).toContain(URL)
      // Kein Multipart ohne Text-Alternative: reine HTML-Mails landen eher im Spam
      expect(mail.text.length).toBeGreaterThan(0)
    })

    it('wirft, wenn der Versand scheitert', async () => {
      sendMailMock.mockRejectedValueOnce(new Error('SMTP down'))

      await expect(sendPasswordResetMail({ to: 'nutzer@test.local', url: URL }))
        .rejects.toThrow(/nicht gesendet/i)
    })
  })

  describe('Willkommensmail', () => {
    it('enthaelt den Bestaetigungslink und den Namen', async () => {
      const url = 'https://signifikation.de/api/v1/auth/verify-email?token=abc&callbackURL=%2F'
      await sendWelcomeMail({ to: 'neu@test.local', name: 'Anna', verificationUrl: url })

      const mail = lastMail()
      expect(mail.subject).toMatch(/willkommen/i)
      expect(mail.html).toContain(url)
      expect(mail.text).toContain(url)
      expect(mail.html).toContain('Hallo Anna,')
    })

    it('kommt ohne Namen und ohne Link aus', async () => {
      await sendWelcomeMail({ to: 'neu@test.local' })

      const mail = lastMail()
      expect(mail.html).toContain('Hallo,')
      expect(mail.html).not.toContain('verify-email')
      expect(mail.html).not.toContain('E-Mail-Adresse bestätigen')
    })

    it('schluckt Versandfehler, damit die Registrierung nicht kippt', async () => {
      sendMailMock.mockRejectedValueOnce(new Error('SMTP down'))

      // null statt Wurf: der Aufrufer (better-auth sign-up) laeuft weiter
      await expect(sendWelcomeMail({ to: 'neu@test.local' })).resolves.toBeNull()
    })
  })

  describe('Bestellbestaetigung', () => {
    it('formatiert Betrag und Datum deutsch und weist § 19 UStG aus', async () => {
      await sendPurchaseConfirmation({
        to: 'kunde@test.local',
        purchaseDate: Date.UTC(2026, 7, 10, 12, 0, 0),
        amount: '19.00',
      })

      const mail = lastMail()
      expect(mail.html).toContain('19,00 €')
      expect(mail.text).toContain('10.08.2026')
      expect(mail.html).toContain('§&nbsp;19 UStG')
    })

    it('schluckt Versandfehler, damit der Webhook nicht kippt', async () => {
      sendMailMock.mockRejectedValueOnce(new Error('SMTP down'))

      await expect(sendPurchaseConfirmation({
        to: 'kunde@test.local',
        purchaseDate: Date.now(),
        amount: '19.00',
      })).resolves.toBeNull()
    })
  })
})
