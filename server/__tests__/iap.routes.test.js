import express from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// Mailer mocken (kein Mailversand, kein nodemailer-Init in Tests).
// isMailConfigured/sendWelcomeMail/sendPasswordResetMail werden von
// auth/index.js gezogen, das ueber middleware/userAuth.js mitgeladen wird.
vi.mock('../mailer.js', () => ({
  isMailConfigured: vi.fn(() => false),
  sendPurchaseConfirmation: vi.fn(),
  sendPasswordResetMail: vi.fn(),
  sendWelcomeMail: vi.fn(),
}))

const {
  default: iapRouter,
  deriveAppAccountToken,
  rejectReasonForPayload,
  unlockForUser,
  isEntitlementActive,
  verarbeiteAppStoreBenachrichtigung,
} = await import('../routes/iap.js')
const { default: db } = await import('../db.js')

const VALID_PRODUCT_ID = 'de.signifikation.gesamtausgabe.korpus'

function devHeaders(userId = `iap-test-${Date.now()}`) {
  return {
    'content-type': 'application/json',
    'x-dev-user-id': userId,
    'x-dev-user-role': 'user',
  }
}

describe('iap routes integration (flache Validierung)', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', iapRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })
    const address = server.address()
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  })

  afterAll(async () => {
    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  })

  // ── /api/v1/iap/verify ─────────────────────────────────────────

  it('verify: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jwsRepresentation: 'x', productId: VALID_PRODUCT_ID }),
    })
    expect(res.status).toBe(401)
  })

  it('verify: lehnt fehlendes jwsRepresentation mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ productId: VALID_PRODUCT_ID }),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  it('verify: lehnt unbekannte productId mit 400 ab', async () => {
    // JWS muss min(50) + Base64URL-Pattern erfüllen, sonst greift die jws-Validierung zuerst.
    const dummyJws = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ jwsRepresentation: dummyJws, productId: 'de.signifikation.unbekannt' }),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  it('verify: ungültiges JWS-Token scheitert sauber mit 400, nicht 500', async () => {
    // Lang genug + Base64URL-Pattern, damit es durch die Zod-Vorprüfung kommt
    // und die echte JWS-Verifikation in verifyAppleJWS scheitert.
    const dummyJws = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`
    const res = await fetch(`${baseUrl}/api/v1/iap/verify`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({ jwsRepresentation: dummyJws, productId: VALID_PRODUCT_ID }),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(payload.error).toBe('Transaktion konnte nicht verifiziert werden')
  })

  // ── /api/v1/iap/restore ────────────────────────────────────────

  it('restore: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transactions: [] }),
    })
    expect(res.status).toBe(401)
  })

  it('restore: lehnt fehlendes transactions-Array mit 400 ab', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/restore`, {
      method: 'POST',
      headers: devHeaders(),
      body: JSON.stringify({}),
    })
    const payload = await res.json()

    expect(res.status).toBe(400)
    expect(typeof payload.error).toBe('string')
  })

  // ── /api/v1/iap/app-account-token ──────────────────────────────

  it('app-account-token: blockiert unauthentifizierte Requests mit 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/iap/app-account-token`)
    expect(res.status).toBe(401)
  })

  it('app-account-token: liefert pro User ein stabiles UUID', async () => {
    const headers = devHeaders('iap-token-user')
    const res1 = await fetch(`${baseUrl}/api/v1/iap/app-account-token`, { headers })
    const res2 = await fetch(`${baseUrl}/api/v1/iap/app-account-token`, { headers })
    const { appAccountToken: t1 } = await res1.json()
    const { appAccountToken: t2 } = await res2.json()

    expect(res1.status).toBe(200)
    expect(t1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(t1).toBe(t2)
  })
})

describe('rejectReasonForPayload (Flag-Verhalten)', () => {
  const basePayload = (overrides = {}) => ({
    productId: VALID_PRODUCT_ID,
    type: 'Non-Consumable',
    bundleId: 'de.signifikation.app',
    environment: 'Production',
    transactionId: 'tx-flag-test',
    ...overrides,
  })

  afterEach(() => {
    delete process.env.IAP_ALLOW_SANDBOX
    delete process.env.IAP_REQUIRE_ACCOUNT_TOKEN
  })

  it('Sandbox wird ohne Opt-in abgelehnt (sicherer Default)', () => {
    const reason = rejectReasonForPayload(
      basePayload({ environment: 'Sandbox' }), VALID_PRODUCT_ID, 'user-x')
    expect(reason).toMatch(/environment Sandbox/)
  })

  it('Sandbox wird mit IAP_ALLOW_SANDBOX=1 akzeptiert', () => {
    process.env.IAP_ALLOW_SANDBOX = '1'
    const reason = rejectReasonForPayload(
      basePayload({ environment: 'Sandbox' }), VALID_PRODUCT_ID, 'user-x')
    expect(reason).toBeNull()
  })

  it('Legacy-Payload ohne appAccountToken passiert per Default (Warn-Pfad)', () => {
    const reason = rejectReasonForPayload(basePayload(), VALID_PRODUCT_ID, 'user-x')
    expect(reason).toBeNull()
  })

  it('IAP_REQUIRE_ACCOUNT_TOKEN=1 lehnt Payloads ohne Token ab', () => {
    process.env.IAP_REQUIRE_ACCOUNT_TOKEN = '1'
    const reason = rejectReasonForPayload(basePayload(), VALID_PRODUCT_ID, 'user-x')
    expect(reason).toMatch(/appAccountToken fehlt/)
  })

  it('fremdes appAccountToken wird unabhaengig von Flags abgelehnt', () => {
    const reason = rejectReasonForPayload(
      basePayload({ appAccountToken: deriveAppAccountToken('anderer-user') }),
      VALID_PRODUCT_ID, 'user-x')
    expect(reason).toMatch(/anderen Account/)
  })

  it('eigenes appAccountToken passiert', () => {
    const reason = rejectReasonForPayload(
      basePayload({ appAccountToken: deriveAppAccountToken('user-x') }),
      VALID_PRODUCT_ID, 'user-x')
    expect(reason).toBeNull()
  })
})

describe('unlockForUser (Cross-Account-Replay)', () => {
  const userA = `iap-replay-a-${Date.now()}`
  const userB = `iap-replay-b-${Date.now()}`
  const txId = `tx-replay-${Date.now()}`
  const origId = `orig-replay-${Date.now()}`

  function ensureUser(id) {
    db.prepare(`INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt)
                VALUES (?, ?, ?, 1, ?, ?)`)
      .run(id, `${id}@test.local`, id, Date.now(), Date.now())
  }

  beforeAll(() => {
    ensureUser(userA)
    ensureUser(userB)
  })

  afterAll(() => {
    for (const t of [txId, `${txId}-2`, origId]) {
      db.prepare('DELETE FROM payments WHERE id = ?').run(t)
    }
    for (const u of [userA, userB]) {
      db.prepare('DELETE FROM user_entitlements WHERE user_id = ?').run(u)
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(u)
      db.prepare('DELETE FROM user WHERE id = ?').run(u)
    }
  })

  it('zweiter Account kann dieselbe transactionId nicht erneut einloesen', () => {
    expect(unlockForUser(userA, txId, origId, VALID_PRODUCT_ID)).toBe(true)
    expect(unlockForUser(userB, txId, origId, VALID_PRODUCT_ID)).toBe(false)

    const entB = db.prepare(
      'SELECT gesamtausgabe_unlocked FROM user_entitlements WHERE user_id = ?').get(userB)
    expect(entB?.gesamtausgabe_unlocked ?? 0).toBe(0)
  })

  it('abweichende transactionId zum selben Original wird ebenfalls gesperrt', () => {
    // Restore kann zum selben Kauf eine neue transactionId liefern —
    // die Sperre muss auch ueber originalTransactionId greifen.
    expect(unlockForUser(userB, `${txId}-2`, origId, VALID_PRODUCT_ID)).toBe(false)
  })

  // Die Antwort von /verify und /restore ist `newlyUnlocked || isEntitlementActive`.
  // Genau hier lag der Fehler: Fuer userB ist BEIDES false — frueher meldete die
  // Route trotzdem `unlocked: true`, der Client rief finishTransaction, und der
  // Kauf war bei Apple erledigt, ohne dass je ein Entitlement entstand.
  it('gesperrter Zweit-Account gilt auch nach dem Fehlschlag als nicht freigeschaltet', () => {
    expect(isEntitlementActive(userA)).toBe(true)
    expect(isEntitlementActive(userB)).toBe(false)
  })

  it('unbekannter Nutzer ist nicht freigeschaltet', () => {
    expect(isEntitlementActive('gibt-es-nicht')).toBe(false)
  })
})

describe('unlockForUser (Admin-Konto)', () => {
  const adminId = `iap-admin-${Date.now()}`
  const plainId = `iap-plain-${Date.now()}`
  const txA = `tx-admin-${Date.now()}`
  const txP = `tx-plain-${Date.now()}`

  beforeAll(() => {
    for (const id of [adminId, plainId]) {
      db.prepare(`INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt)
                  VALUES (?, ?, ?, 1, ?, ?)`).run(id, `${id}@test.local`, id, Date.now(), Date.now())
    }
    const now = Date.now()
    db.prepare('INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)').run(adminId, 'admin', now, now)
  })

  afterAll(() => {
    for (const t of [txA, txP]) db.prepare('DELETE FROM payments WHERE id = ?').run(t)
    for (const u of [adminId, plainId]) {
      db.prepare('DELETE FROM user_entitlements WHERE user_id = ?').run(u)
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(u)
      db.prepare('DELETE FROM user WHERE id = ?').run(u)
    }
  })

  it('ein Kauf stuft ein Admin-Konto nicht herab, das Entitlement wird trotzdem gesetzt', () => {
    const vorher = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(adminId)
    expect(unlockForUser(adminId, txA, txA, VALID_PRODUCT_ID)).toBe(true)
    // Rolle und Zeile (auch updated_at) bleiben unveraendert
    expect(db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(adminId)).toEqual(vorher)
    expect(isEntitlementActive(adminId)).toBe(true)
  })

  it('ein normales Konto wird weiterhin premium', () => {
    expect(unlockForUser(plainId, txP, txP, VALID_PRODUCT_ID)).toBe(true)
    expect(db.prepare('SELECT role FROM user_profiles WHERE user_id = ?').get(plainId).role).toBe('premium')
  })
})

describe('unlockForUser (Restore nach Kontoloeschung, Migration 0020)', () => {
  const userOld = `iap-deleted-${Date.now()}`
  const userNew = `iap-rejoined-${Date.now()}`
  const txId = `tx-orphan-${Date.now()}`
  const origId = `orig-orphan-${Date.now()}`

  function ensureUser(id) {
    db.prepare(`INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt)
                VALUES (?, ?, ?, 1, ?, ?)`)
      .run(id, `${id}@test.local`, id, Date.now(), Date.now())
  }

  beforeAll(() => {
    ensureUser(userOld)
    ensureUser(userNew)
  })

  afterAll(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(origId)
    for (const u of [userOld, userNew]) {
      db.prepare('DELETE FROM user_entitlements WHERE user_id = ?').run(u)
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(u)
      db.prepare('DELETE FROM user WHERE id = ?').run(u)
    }
  })

  it('geloeschtes Konto: payments-Zeile bleibt (SET NULL) statt zu verschwinden', () => {
    expect(unlockForUser(userOld, txId, origId, VALID_PRODUCT_ID)).toBe(true)

    // Kontoloeschung nachgestellt: FK ON DELETE SET NULL (Migration 0020)
    // darf die payments-Zeile nicht mitreissen (§147-AO-Aufbewahrungspflicht).
    db.prepare('DELETE FROM user WHERE id = ?').run(userOld)

    const row = db.prepare('SELECT user_id FROM payments WHERE id = ?').get(origId)
    expect(row).toBeTruthy()
    expect(row.user_id).toBeNull()
  })

  it('neu registrierter Account kann den verwaisten Kauf per Restore reklaimen', () => {
    expect(unlockForUser(userNew, `${txId}-restore`, origId, VALID_PRODUCT_ID)).toBe(true)

    const row = db.prepare('SELECT user_id FROM payments WHERE id = ?').get(origId)
    expect(row.user_id).toBe(userNew)

    const ent = db.prepare(
      'SELECT gesamtausgabe_unlocked FROM user_entitlements WHERE user_id = ?').get(userNew)
    expect(ent?.gesamtausgabe_unlocked).toBe(1)
  })
})

describe('deriveAppAccountToken', () => {
  it('ist deterministisch und unterscheidet User', () => {
    expect(deriveAppAccountToken('user-a')).toBe(deriveAppAccountToken('user-a'))
    expect(deriveAppAccountToken('user-a')).not.toBe(deriveAppAccountToken('user-b'))
  })

  it('erzeugt gültige UUIDv5 (Version + Variante)', () => {
    const token = deriveAppAccountToken('irgendein-user')
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('App-Store-Benachrichtigungen (Erstattung)', () => {
  const user = `iap-refund-${Date.now()}`
  const origId = `orig-refund-${Date.now()}`
  const txId = `tx-refund-${Date.now()}`
  const statusVon = () => db.prepare('SELECT status FROM payments WHERE id = ?').get(origId)?.status
  // Die innere Signaturprüfung wird ersetzt: Getestet wird die Auswertung, nicht die Kryptografie
  const tx = (felder = {}) => () => ({ bundleId: 'de.signifikation.app', transactionId: txId, originalTransactionId: origId, ...felder })
  const meldung = (notificationType, data = {}) => ({
    notificationType,
    data: { bundleId: 'de.signifikation.app', environment: 'Production', signedTransactionInfo: 'a.b.c', ...data },
  })

  beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO user (id, email, name, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)`)
      .run(user, `${user}@test.local`, user, Date.now(), Date.now())
    unlockForUser(user, txId, origId, VALID_PRODUCT_ID)
  })

  afterAll(() => {
    db.prepare('DELETE FROM payments WHERE id = ?').run(origId)
    db.prepare('DELETE FROM user_entitlements WHERE user_id = ?').run(user)
    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(user)
    db.prepare('DELETE FROM user WHERE id = ?').run(user)
  })

  it('REFUND setzt den Kauf auf refunded, REFUND_REVERSED wieder auf paid', () => {
    expect(statusVon()).toBe('paid')
    expect(verarbeiteAppStoreBenachrichtigung(meldung('REFUND'), tx({ revocationReason: 0 }))).toEqual({ status: 200, ergebnis: 'erstattet' })
    expect(statusVon()).toBe('refunded')
    expect(isEntitlementActive(user)).toBe(true)
    // Apple wiederholt: nichts mehr zu tun
    expect(verarbeiteAppStoreBenachrichtigung(meldung('REFUND'), tx()).ergebnis).toBe('kein passender Kauf')
    expect(verarbeiteAppStoreBenachrichtigung(meldung('REFUND_REVERSED'), tx())).toEqual({ status: 200, ergebnis: 'zurückgenommen' })
    expect(statusVon()).toBe('paid')
  })

  it('findet den Kauf auch über die transactionId, wenn die Original-ID fehlt', () => {
    const nurTx = () => ({ bundleId: 'de.signifikation.app', transactionId: origId })
    expect(verarbeiteAppStoreBenachrichtigung(meldung('REFUND'), nurTx).ergebnis).toBe('erstattet')
    verarbeiteAppStoreBenachrichtigung(meldung('REFUND_REVERSED'), nurTx)
    expect(statusVon()).toBe('paid')
  })

  it('ignoriert andere Typen und Sandbox ohne Freigabe, lehnt fremde Apps ab', () => {
    const pruefe = vi.fn(tx())
    expect(verarbeiteAppStoreBenachrichtigung({ notificationType: 'TEST', data: {} }, pruefe)).toEqual({ status: 200, ergebnis: 'ignoriert' })
    expect(verarbeiteAppStoreBenachrichtigung(meldung('REFUND', { environment: 'Sandbox' }), pruefe).status).toBe(200)
    expect(verarbeiteAppStoreBenachrichtigung(meldung('REFUND', { bundleId: 'com.fremd.app' }), pruefe).status).toBe(400)
    expect(verarbeiteAppStoreBenachrichtigung(meldung('REFUND'), tx({ bundleId: 'com.fremd.app' })).status).toBe(400)
    expect(pruefe).not.toHaveBeenCalled()
    expect(statusVon()).toBe('paid')
  })
})
