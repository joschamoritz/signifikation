// Google Play Billing (routes/iapPlay.js): Kaufprüfung, Kontobindung, Acknowledge, Restore und
// Real-Time Developer Notifications. Die Play Developer API ist durch eine Attrappe ersetzt.
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'

vi.mock('../mailer.js', () => ({
  isMailConfigured: vi.fn(() => false),
  sendPurchaseConfirmation: vi.fn(),
  sendPasswordResetMail: vi.fn(),
  sendWelcomeMail: vi.fn(),
}))

const { sendPurchaseConfirmation } = await import('../mailer.js')
const {
  createPlayRouter, ablehnungsgrundPlay, zahlungsIdFuer, verarbeitePlayBenachrichtigung, PLAY_NOTIFICATIONS_PFAD,
} = await import('../routes/iapPlay.js')
const { deriveAppAccountToken, isEntitlementActive, unlockForUser } = await import('../routes/iap.js')
const { PlayKaufUnbekannt } = await import('../playKauf.js')
const { default: db } = await import('../db.js')

const PRODUKT = 'de.signifikation.gesamtausgabe.korpus'
const lauf = Date.now()
const AUDIENCE = 'https://signifikation.de/api/v1/iap/play/notifications'
const PUSH_SA = 'pubsub-push@signifikation.iam.gserviceaccount.com'

const kaufFuer = (userId, felder = {}) => ({
  purchaseState: 0,
  consumptionState: 0,
  acknowledgementState: 0,
  orderId: `GPA.${lauf}-${Math.random().toString(36).slice(2, 8)}`,
  obfuscatedExternalAccountId: deriveAppAccountToken(userId),
  ...felder,
})

function legeNutzerAn(id) {
  db.prepare(`INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)`)
    .run(id, `${id}@test.local`, id, Date.now(), Date.now())
}

function raeumeAuf(ids) {
  for (const id of ids) {
    db.prepare('DELETE FROM payments WHERE user_id = ?').run(id)
    db.prepare('DELETE FROM user_entitlements WHERE user_id = ?').run(id)
    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
    db.prepare('DELETE FROM user WHERE id = ?').run(id)
  }
}

const zahlungVon = (id) => db.prepare('SELECT user_id AS userId, status, amount FROM payments WHERE id = ?').get(id)
const quelleVon = (userId) => db.prepare('SELECT source FROM user_entitlements WHERE user_id = ?').get(userId)?.source

describe('ablehnungsgrundPlay', () => {
  const user = 'play-grund'
  afterEach(() => { delete process.env.PLAY_ALLOW_TEST })

  it('nimmt einen abgeschlossenen Kauf des eigenen Kontos an', () => {
    expect(ablehnungsgrundPlay(kaufFuer(user), user)).toBeNull()
    // Großschreibung des Tokens spielt keine Rolle
    expect(ablehnungsgrundPlay(kaufFuer(user, { obfuscatedExternalAccountId: deriveAppAccountToken(user).toUpperCase() }), user)).toBeNull()
  })

  it('lehnt ausstehende, stornierte und verbrauchte Käufe ab', () => {
    expect(ablehnungsgrundPlay(kaufFuer(user, { purchaseState: 2 }), user)).toMatch(/ausstehend/)
    expect(ablehnungsgrundPlay(kaufFuer(user, { purchaseState: 1 }), user)).toMatch(/storniert/)
    expect(ablehnungsgrundPlay(kaufFuer(user, { consumptionState: 1 }), user)).toMatch(/verbraucht/)
  })

  it('Testkäufe nur mit PLAY_ALLOW_TEST=1, Promo-Codes immer, Prämienkäufe nie', () => {
    expect(ablehnungsgrundPlay(kaufFuer(user, { purchaseType: 0 }), user)).toMatch(/purchaseType 0/)
    process.env.PLAY_ALLOW_TEST = '1'
    expect(ablehnungsgrundPlay(kaufFuer(user, { purchaseType: 0 }), user)).toBeNull()
    expect(ablehnungsgrundPlay(kaufFuer(user, { purchaseType: 1 }), user)).toBeNull()
    expect(ablehnungsgrundPlay(kaufFuer(user, { purchaseType: 2 }), user)).toMatch(/purchaseType 2/)
  })

  it('verlangt die Kontobindung; ein fremdes Token geht nur im Restore-Pfad weiter', () => {
    expect(ablehnungsgrundPlay(kaufFuer(user, { obfuscatedExternalAccountId: undefined }), user)).toMatch(/fehlt/)
    const fremd = kaufFuer('anderes-konto')
    expect(ablehnungsgrundPlay(fremd, user)).toMatch(/anderen Account/)
    expect(ablehnungsgrundPlay(fremd, user, { allowUnclaimedForeignToken: true })).toBeNull()
  })
})

describe('zahlungsIdFuer', () => {
  it('nimmt die orderId, sonst einen stabilen Token-Hash', () => {
    expect(zahlungsIdFuer({ orderId: 'GPA.1' }, 'tok')).toBe('GPA.1')
    const ohne = zahlungsIdFuer({}, 'tok-abc')
    expect(ohne).toMatch(/^play:[0-9a-f]{40}$/)
    expect(zahlungsIdFuer({ orderId: '' }, 'tok-abc')).toBe(ohne)
  })
})

describe('Play-Routen', () => {
  const api = { enabled: true, holeKauf: vi.fn(), bestaetige: vi.fn() }
  let server, baseUrl, privateKey
  const a = `play-a-${lauf}`
  const b = `play-b-${lauf}`
  const token = (n) => `token-${lauf}-${n}.abcDEF_-`

  const post = (pfad, body, userId) => fetch(`${baseUrl}${pfad}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(userId ? { 'x-dev-user-id': userId, 'x-dev-user-role': 'user' } : {}) },
    body: JSON.stringify(body),
  })

  beforeAll(async () => {
    const paar = await generateKeyPair('RS256')
    privateKey = paar.privateKey
    const jwk = { ...(await exportJWK(paar.publicKey)), kid: 'k1', alg: 'RS256' }
    const app = express()
    app.use(express.json())
    app.use('/', createPlayRouter({
      api,
      pubsub: { jwks: createLocalJWKSet({ keys: [jwk] }), audience: AUDIENCE, email: PUSH_SA },
    }))
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
    legeNutzerAn(a)
    legeNutzerAn(b)
  })

  afterAll(async () => {
    raeumeAuf([a, b])
    await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    api.enabled = true
    api.holeKauf.mockReset()
    api.bestaetige.mockReset().mockResolvedValue()
    sendPurchaseConfirmation.mockClear()
  })

  it('verify: ohne Anmeldung 401, kaputtes Token 400', async () => {
    expect((await post('/api/v1/iap/play/verify', { purchaseToken: token(0), productId: PRODUKT })).status).toBe(401)
    expect((await post('/api/v1/iap/play/verify', { purchaseToken: 'a b', productId: PRODUKT }, a)).status).toBe(400)
    expect((await post('/api/v1/iap/play/verify', { purchaseToken: token(0), productId: 'x' }, a)).status).toBe(400)
    expect(api.holeKauf).not.toHaveBeenCalled()
  })

  it('verify: schaltet frei, bucht die orderId, bestätigt und schickt die Bestellmail', async () => {
    const kauf = kaufFuer(a)
    api.holeKauf.mockResolvedValue(kauf)
    const res = await post('/api/v1/iap/play/verify', { purchaseToken: token(1), productId: PRODUKT }, a)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, unlocked: true })
    expect(api.holeKauf).toHaveBeenCalledWith(PRODUKT, token(1))
    expect(api.bestaetige).toHaveBeenCalledWith(PRODUKT, token(1))
    expect(zahlungVon(kauf.orderId)).toEqual({ userId: a, status: 'paid', amount: '9.99' })
    expect(quelleVon(a)).toBe('google-play')
    expect(sendPurchaseConfirmation).toHaveBeenCalledWith(expect.objectContaining({ to: `${a}@test.local`, amount: '9.99' }))

    // Zweiter Aufruf (z. B. Listener nach dem Kauf): weiter freigeschaltet, keine zweite Mail
    api.holeKauf.mockResolvedValue({ ...kauf, acknowledgementState: 1 })
    const nochmal = await post('/api/v1/iap/play/verify', { purchaseToken: token(1), productId: PRODUKT }, a)
    expect(await nochmal.json()).toEqual({ success: true, unlocked: true })
    expect(api.bestaetige).toHaveBeenCalledTimes(1)
    expect(sendPurchaseConfirmation).toHaveBeenCalledTimes(1)
  })

  it('verify: Kauf eines anderen Kontos wird abgelehnt und nicht bestätigt', async () => {
    api.holeKauf.mockResolvedValue(kaufFuer(a))
    const res = await post('/api/v1/iap/play/verify', { purchaseToken: token(2), productId: PRODUKT }, b)
    expect(res.status).toBe(400)
    expect(api.bestaetige).not.toHaveBeenCalled()
    expect(isEntitlementActive(b)).toBe(false)
  })

  it('verify: Kauf eines anderen Produkts wird abgelehnt', async () => {
    api.holeKauf.mockResolvedValue(kaufFuer(a, { productId: 'de.signifikation.gesamtausgabe.petit' }))
    expect((await post('/api/v1/iap/play/verify', { purchaseToken: token(8), productId: PRODUKT }, a)).status).toBe(400)
    expect(api.bestaetige).not.toHaveBeenCalled()
  })

  it('verify: unbekanntes Token 400, Google nicht erreichbar 502, ohne Dienstkonto 503', async () => {
    api.holeKauf.mockRejectedValue(new PlayKaufUnbekannt('Play: HTTP 404'))
    expect((await post('/api/v1/iap/play/verify', { purchaseToken: token(3), productId: PRODUKT }, a)).status).toBe(400)
    api.holeKauf.mockRejectedValue(new Error('HTTP 500'))
    expect((await post('/api/v1/iap/play/verify', { purchaseToken: token(3), productId: PRODUKT }, a)).status).toBe(502)
    api.enabled = false
    expect((await post('/api/v1/iap/play/verify', { purchaseToken: token(3), productId: PRODUKT }, a)).status).toBe(503)
  })

  it('verify: ein gescheitertes Acknowledge kostet die Freischaltung nicht', async () => {
    const c = `play-c-${lauf}`
    legeNutzerAn(c)
    try {
      api.holeKauf.mockResolvedValue(kaufFuer(c))
      api.bestaetige.mockRejectedValue(new Error('HTTP 503'))
      const res = await post('/api/v1/iap/play/verify', { purchaseToken: token(4), productId: PRODUKT }, c)
      expect(await res.json()).toEqual({ success: true, unlocked: true })
    } finally {
      raeumeAuf([c])
    }
  })

  it('restore: ein bereits beanspruchter Kauf schaltet kein zweites Konto frei', async () => {
    const kauf = kaufFuer(a, { acknowledgementState: 1 })
    api.holeKauf.mockResolvedValue(kauf)
    await post('/api/v1/iap/play/verify', { purchaseToken: token(5), productId: PRODUKT }, a)

    api.bestaetige.mockClear()
    const res = await post('/api/v1/iap/play/restore', { transactions: [{ purchaseToken: token(5), productId: PRODUKT }] }, b)
    expect(await res.json()).toEqual({ success: true, unlocked: false })
    expect(zahlungVon(kauf.orderId).userId).toBe(a)
    expect(api.bestaetige).not.toHaveBeenCalled()
  })

  it('restore: ein unbeanspruchter Kauf mit fremdem Token (Konto gelöscht) geht auf das neue Konto', async () => {
    const neu = `play-neu-${lauf}`
    legeNutzerAn(neu)
    try {
      const kauf = kaufFuer('geloeschtes-konto')
      api.holeKauf.mockResolvedValue(kauf)
      const res = await post('/api/v1/iap/play/restore', { transactions: [{ purchaseToken: token(6), productId: PRODUKT }] }, neu)
      expect(await res.json()).toEqual({ success: true, unlocked: true })
      expect(zahlungVon(kauf.orderId).userId).toBe(neu)
      expect(api.bestaetige).toHaveBeenCalledWith(PRODUKT, token(6))
    } finally {
      raeumeAuf([neu])
    }
  })

  describe('RTDN', () => {
    const oidc = (felder = {}, aud = AUDIENCE) => new SignJWT({ email: PUSH_SA, email_verified: true, ...felder })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey)

    const push = async (note, jwt) => fetch(`${baseUrl}${PLAY_NOTIFICATIONS_PFAD}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify({
        message: { data: Buffer.from(typeof note === 'string' ? note : JSON.stringify(note)).toString('base64'), messageId: '1' },
        subscription: 'projects/signifikation/subscriptions/play-rtdn-push',
      }),
    })

    it('lehnt Pushes ohne gültiges OIDC-Token ab', async () => {
      const note = { packageName: 'de.signifikation.app', testNotification: { version: '1.0' } }
      expect((await push(note)).status).toBe(401)
      expect((await push(note, await oidc({}, 'https://falsch.example')))).toHaveProperty('status', 401)
      expect((await push(note, await oidc({ email: 'fremd@example.com' })))).toHaveProperty('status', 401)
      expect((await push(note, await oidc({ email_verified: false })))).toHaveProperty('status', 401)
    })

    it('bestätigt Test- und kaputte Nachrichten', async () => {
      expect((await push({ packageName: 'de.signifikation.app', testNotification: { version: '1.0' } }, await oidc())).status).toBe(204)
      expect((await push('kein json', await oidc())).status).toBe(204)
    })

    it('ein Storno setzt den Kauf auf refunded und entzieht die Gesamtausgabe', async () => {
      const d = `play-storno-${lauf}`
      legeNutzerAn(d)
      try {
        const kauf = kaufFuer(d)
        api.holeKauf.mockResolvedValue(kauf)
        await post('/api/v1/iap/play/verify', { purchaseToken: token(7), productId: PRODUKT }, d)
        expect(isEntitlementActive(d)).toBe(true)

        const note = {
          packageName: 'de.signifikation.app',
          voidedPurchaseNotification: { purchaseToken: token(7), orderId: kauf.orderId, productType: 2, refundType: 1 },
        }
        expect((await push(note, await oidc())).status).toBe(204)
        expect(zahlungVon(kauf.orderId).status).toBe('refunded')
        expect(isEntitlementActive(d)).toBe(false)
        // Pub/Sub liefert doppelt: nichts mehr zu tun
        expect(verarbeitePlayBenachrichtigung(note)).toBe('kein passender Kauf')
      } finally {
        raeumeAuf([d])
      }
    })
  })
})

describe('verarbeitePlayBenachrichtigung', () => {
  it('findet einen Kauf ohne orderId über den Token-Hash', () => {
    const e = `play-hash-${lauf}`
    legeNutzerAn(e)
    try {
      const id = zahlungsIdFuer({}, 'tok-ohne-order')
      db.prepare(`INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at) VALUES (?, ?, '6.99', 'EUR', 'paid', 'gesamtausgabe', ?)`)
        .run(id, e, Date.now())
      const note = { packageName: 'de.signifikation.app', voidedPurchaseNotification: { purchaseToken: 'tok-ohne-order', productType: 2 } }
      expect(verarbeitePlayBenachrichtigung(note)).toBe('erstattet')
      expect(zahlungVon(id).status).toBe('refunded')
    } finally {
      raeumeAuf([e])
    }
  })

  it('Storno eines unbekannten Kaufs legt einen Sperreintrag an, ein späteres Token schaltet nichts frei', () => {
    const f = `play-sperre-${lauf}`
    const orderId = `GPA.sperre-${lauf}`
    const tokenZeile = zahlungsIdFuer({}, 'tok-sperre')
    legeNutzerAn(f)
    try {
      const note = { packageName: 'de.signifikation.app', voidedPurchaseNotification: { purchaseToken: 'tok-sperre', orderId, productType: 2 } }
      expect(verarbeitePlayBenachrichtigung(note)).toBe('kein passender Kauf')
      expect(zahlungVon(orderId)).toEqual({ userId: null, status: 'gesperrt', amount: '0.00' })
      expect(zahlungVon(tokenZeile)?.status).toBe('gesperrt')
      expect(unlockForUser(f, orderId, null, PRODUKT, { quelle: 'google-play' })).toBe(false)
      expect(isEntitlementActive(f)).toBe(false)
    } finally {
      db.prepare('DELETE FROM payments WHERE id IN (?, ?)').run(orderId, tokenZeile)
      raeumeAuf([f])
    }
  })

  it('ignoriert fremde Pakete, Abos und Einmalkauf-Meldungen', () => {
    expect(verarbeitePlayBenachrichtigung({ packageName: 'com.fremd' })).toMatch(/fremdes Paket/)
    expect(verarbeitePlayBenachrichtigung({ packageName: 'de.signifikation.app', voidedPurchaseNotification: { purchaseToken: 't', productType: 1 } })).toMatch(/productType 1/)
    expect(verarbeitePlayBenachrichtigung({ packageName: 'de.signifikation.app', oneTimeProductNotification: { notificationType: 1, purchaseToken: 't' } })).toMatch(/ignoriert/)
  })
})
