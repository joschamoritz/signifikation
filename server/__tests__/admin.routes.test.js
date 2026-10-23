import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import bcryptjs from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import adminRouter from '../routes/admin.js'
import { invalidateCache, lemmaToRow, loadReadOnly, save, stmts } from '../store.js'
import { ladeEntwurf, ladeOffeneEntwuerfe, speichereEntwuerfe } from '../store-entwuerfe.js'
import db from '../db.js'
import { countUsersByRoleStmt } from '../routes/admin-users-data.js'

const BACKUP_RESTORE_BODY_LIMIT = '10mb'

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, @emailVerified, @image, @createdAt, @updatedAt)
`)

const upsertUserProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id)
  DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)

const deleteUserProfileStmt = db.prepare(`
  DELETE FROM user_profiles
  WHERE user_id = ?
`)

const deleteUserStmt = db.prepare(`
  DELETE FROM user
  WHERE id = ?
`)

const insertSessionStmt = db.prepare(`
  INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const deleteSessionStmt = db.prepare(`DELETE FROM session WHERE id = ?`)

const insertAccountStmt = db.prepare(`
  INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
  VALUES (?, ?, ?, 'credential', ?, ?, ?)
`)

const getUserEmailStmt = db.prepare(`SELECT email FROM user WHERE id = ?`)

const nowIso = () => new Date().toISOString()

const insertAccountWithProviderStmt = db.prepare(`
  INSERT INTO account (id, userId, accountId, providerId, accessToken, refreshToken, password, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const insertPaymentStmt = db.prepare(`
  INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)

const insertEntitlementStmt = db.prepare(`
  INSERT INTO user_entitlements (user_id, gesamtausgabe_unlocked, unlocked_at, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

// Zeilen je Konto zählen (nicht global: andere Testdateien teilen sich die Datenbank)
const countEntitlementsStmt = db.prepare(`SELECT COUNT(*) AS n FROM user_entitlements WHERE user_id = ?`)
const countPaymentsStmt = db.prepare(`SELECT COUNT(*) AS n FROM payments WHERE user_id = ?`)
const deletePaymentStmt = db.prepare(`DELETE FROM payments WHERE id = ?`)
const testPaymentIds = new Set()
function addTestPayment(id, userId, amount, processedAt) {
  insertPaymentStmt.run(id, userId, amount, 'EUR', 'paid', 'gesamtausgabe', processedAt)
  testPaymentIds.add(id)
}

const cleanupUsersTx = db.transaction((userIds) => {
  for (const userId of userIds) {
    deleteUserProfileStmt.run(userId)
    deleteUserStmt.run(userId)
  }
})

function createTestUser({ role } = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
  const userId = `admin-test-${suffix}`
  const nowIso = new Date().toISOString()

  insertUserStmt.run({
    id: userId,
    name: `Test ${suffix.slice(-6)}`,
    email: `${suffix}@example.test`,
    emailVerified: 1,
    image: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  })

  if (role) {
    const now = Date.now()
    upsertUserProfileStmt.run(userId, role, now, now)
  }

  return userId
}

async function createCredentialUser({ role, password }) {
  const userId = createTestUser({ role })
  const now = new Date().toISOString()
  const hash = await bcryptjs.hash(password, 10)
  insertAccountStmt.run(randomUUID(), userId, userId, hash, now, now)
  return { userId, email: getUserEmailStmt.get(userId).email }
}

function adminHeaders(token, ip = '198.51.100.50') {
  return {
    'content-type': 'application/json',
    cookie: `better-auth.session_token=${token}`,
    'x-forwarded-for': ip,
  }
}

describe('admin routes integration', () => {
  let server
  let baseUrl
  let token
  let testSessionId
  const testUserIds = new Set()

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use('/admin/backup/restore', express.json({ limit: BACKUP_RESTORE_BODY_LIMIT }))
    app.use(express.json())
    app.use('/', adminRouter)

    await new Promise((resolve) => {
      server = app.listen(0, resolve)
    })

    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    baseUrl = `http://127.0.0.1:${port}`

    // Admin-User + Session in DB anlegen
    const adminUserId = createTestUser({ role: 'admin' })
    testUserIds.add(adminUserId)
    testSessionId = randomUUID()
    token = randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()
    insertSessionStmt.run(testSessionId, adminUserId, token, expiresAt, '127.0.0.1', 'test-agent', now, now)
  })

  afterAll(async () => {
    if (testSessionId) deleteSessionStmt.run(testSessionId)
    for (const paymentId of testPaymentIds) deletePaymentStmt.run(paymentId)
    cleanupUsersTx([...testUserIds])

    if (!server) return
    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  })

  it('POST /admin/kalender/bulk-delete lehnt leere Liste mit 400 ab', async () => {
    const response = await fetch(`${baseUrl}/admin/kalender/bulk-delete`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ dates: [] }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Mindestens ein Datum erforderlich' })
  })

  it('POST /admin/preview/lemma liefert strukturierte Vorschau', async () => {
    const response = await fetch(`${baseUrl}/admin/preview/lemma`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ lemma: 'haus', pos: 'Substantiv' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lemma).toBeTruthy()
    expect(payload.id).toBeTruthy()
    expect(Array.isArray(payload.rundenInfo)).toBe(true)
  })

  it('GET /admin/preview/day/:datum liefert Tagesdaten fuer vorhandenen Eintrag', async () => {
    const datum = '2026-10-15'
    await save('kalender.json', { ...loadReadOnly('kalender.json'), [datum]: ['haus', 'baum', 'wort'] })

    const response = await fetch(`${baseUrl}/admin/preview/day/${encodeURIComponent(datum)}`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.datum).toBe(datum)
    expect(Array.isArray(payload.lemmata)).toBe(true)
    expect(typeof payload.modes).toBe('object')
  })

  it('GET /admin/kalender liefert thema und thema_kurz als Strings je Tag', async () => {
    const vorher = loadReadOnly('kalender.json')
    const mitThema = '2027-02-03'
    const ohneThema = '2027-02-04'
    const altFormat = '2027-02-05'
    await save('kalender.json', {
      ...vorher,
      [mitThema]: { ids: ['haus', 'baum', 'wort'], thema: 'Hausbau', thema_kurz: 'Vom Fundament bis zum Dach.' },
      [ohneThema]: { ids: ['haus', 'baum', 'wort'] },
      [altFormat]: ['haus', 'baum', 'wort'],
    })

    try {
      const response = await fetch(`${baseUrl}/admin/kalender`, { headers: adminHeaders(token) })
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload[mitThema]).toMatchObject({ thema: 'Hausbau', thema_kurz: 'Vom Fundament bis zum Dach.' })
      // Fehlende Felder und das alte Array-Format liefern leere Strings, nie undefined
      expect(payload[ohneThema]).toMatchObject({ thema: '', thema_kurz: '' })
      expect(payload[altFormat]).toMatchObject({ thema: '', thema_kurz: '' })
      // bestehende Felder bleiben erhalten
      expect(Array.isArray(payload[mitThema].modeGroups)).toBe(true)
      expect(Array.isArray(payload[mitThema].lemmata)).toBe(true)
    } finally {
      await save('kalender.json', vorher)
    }
  })

  it('GET /admin/audit-log filtert nach action und status', async () => {
    const response = await fetch(`${baseUrl}/admin/audit-log?action=CREATE&status=SUCCESS&limit=20`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(payload.entries)).toBe(true)
    expect(typeof payload.totalMatches).toBe('number')
    for (const entry of payload.entries) {
      expect(entry.action).toBe('CREATE')
      expect(entry.status).toBe('SUCCESS')
    }
  })

  it('GET /admin/audit-log/:resource/:id liefert Detailhistorie für eine Entität', async () => {
    const datum = `2026-12-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    await save('kalender.json', { ...loadReadOnly('kalender.json'), [datum]: ['haus', 'baum', 'wort'] })

    const seedResponse = await fetch(`${baseUrl}/admin/kalender/bulk-delete`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ dates: [datum] }),
    })

    expect(seedResponse.status).toBe(200)

    const overview = await fetch(`${baseUrl}/admin/audit-log?limit=5`, {
      headers: adminHeaders(token),
    })
    const overviewPayload = await overview.json()

    expect(overview.status).toBe(200)
    const first = overviewPayload.entries?.[0]
    expect(first).toBeTruthy()

    const response = await fetch(`${baseUrl}/admin/audit-log/${encodeURIComponent(first.resource)}/${encodeURIComponent(first.resourceId)}?limit=5`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.resource).toBe(first.resource)
    expect(payload.resourceId).toBe(first.resourceId)
    expect(Array.isArray(payload.entries)).toBe(true)
  })

  it('GET /admin/users blaettert ueber offset ohne Ueberschneidung', async () => {
    // Drei Nutzer mit gemeinsamem, eindeutigem Suchbegriff und fester
    // Reihenfolge (ORDER BY createdAt DESC) – so ist die Seitenfolge
    // deterministisch pruefbar.
    const marker = `paging${Date.now().toString(36)}`
    const baseTime = Date.now()
    const created = []
    for (let i = 0; i < 3; i += 1) {
      const userId = `admin-test-${marker}-${i}`
      const iso = new Date(baseTime - i * 1000).toISOString()
      insertUserStmt.run({
        id: userId,
        name: `${marker} Nutzer ${i}`,
        email: `${marker}-${i}@example.test`,
        emailVerified: 1,
        image: null,
        createdAt: iso,
        updatedAt: iso,
      })
      testUserIds.add(userId)
      created.push(userId)
    }

    const fetchPage = async (offset) => {
      const response = await fetch(`${baseUrl}/admin/users?q=${marker}&limit=2&offset=${offset}`, {
        headers: adminHeaders(token),
      })
      expect(response.status).toBe(200)
      return response.json()
    }

    const first = await fetchPage(0)
    expect(first.users.map((user) => user.id)).toEqual([created[0], created[1]])
    expect(first.page).toMatchObject({ limit: 2, offset: 0, filtered: 3, hasMore: true })

    const second = await fetchPage(2)
    expect(second.users.map((user) => user.id)).toEqual([created[2]])
    expect(second.page).toMatchObject({ limit: 2, offset: 2, filtered: 3, hasMore: false })

    // summary.total bleibt die Gesamtzahl, filtered nur die Treffer
    expect(first.summary.total).toBeGreaterThanOrEqual(3)
  })

  it('GET /admin/users nutzt Defaults ohne Query-Parameter', async () => {
    // Express 5 baut req.query bei jedem Zugriff neu, die Zod-Defaults aus
    // validate() kommen im Handler nicht an – ohne eigene Ableitung liefe
    // die Abfrage in einen fehlenden LIMIT-Parameter.
    const response = await fetch(`${baseUrl}/admin/users`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.page).toMatchObject({ limit: 50, offset: 0 })
    expect(payload.users.length).toBeLessThanOrEqual(50)
  })

  it('GET /admin/users lehnt ein zu grosses limit ab', async () => {
    const response = await fetch(`${baseUrl}/admin/users?limit=500`, {
      headers: adminHeaders(token),
    })

    expect(response.status).toBe(400)
  })

  it('GET /admin/users/:id/stats liefert nur Statistikdaten', async () => {
    const userId = createTestUser({ role: 'premium' })
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}/stats`, {
      headers: adminHeaders(token),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.userId).toBe(userId)
    expect(typeof payload.totals).toBe('object')
    expect(Array.isArray(payload.byGame)).toBe(true)
    expect(Array.isArray(payload.recent)).toBe(true)
  })

  it('POST /admin/backup/restore akzeptiert vorhandenes Backup-Format', async () => {
    const backupResponse = await fetch(`${baseUrl}/admin/backup`, {
      headers: adminHeaders(token),
    })
    const backupPayload = await backupResponse.json()
    expect(backupResponse.status).toBe(200)

    const response = await fetch(`${baseUrl}/admin/backup/restore`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({ ...backupPayload, confirm: true }),
    })
    const raw = await response.text()
    let payload = null
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = { raw }
    }

    expect(response.status).toBe(200)
    expect(payload.ok).toBe(true)
    expect(typeof payload.restored?.kalender).toBe('number')
  })

  it('POST /admin/tag entfernt optionale Modi, wenn Felder geleert werden', async () => {
    const datum = `2026-11-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`

    const firstResponse = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        notizen: ['', '', ''],
        links: ['', '', ''],
        definitionen: ['', '', ''],
        zwilling_paar: ['Tag', 'Nacht'],
        zwilling_pos: 'Substantiv',
        zeitenwende_lemma: 'Zeit',
      }),
    })
    expect(firstResponse.status).toBe(200)

    const secondResponse = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        notizen: ['', '', ''],
        links: ['', '', ''],
        definitionen: ['', '', ''],
        zwilling_paar: null,
        zwilling_pos: 'Substantiv',
        zeitenwende_lemma: '',
      }),
    })
    expect(secondResponse.status).toBe(200)

    const wortzwilling = loadReadOnly('wortzwilling.json')
    const zeitenwende = loadReadOnly('zeitenwende.json')

    expect(wortzwilling[datum]).toBeUndefined()
    expect(zeitenwende[datum]).toBeUndefined()
  })

  it('POST /admin/tag meldet den Lückenfüller-Status und speichert den Tag trotzdem', async () => {
    // Die ID passt zu keinem Wort des Tages — das prüft die Verdrahtung, ohne
    // die Belege-Datenbank zu brauchen (der Bau selbst ist in
    // server/lueckenfuellerAutoGen.test.js abgedeckt).
    const datum = `2026-12-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    const response = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        zwilling_pos: 'Substantiv',
        lueckenfueller_id: 'gibt-es-heute-nicht',
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lueckenfuellerOk).toBe(false)
    expect(payload.lueckenfuellerStatus).toBe('unbekannt')
    expect(loadReadOnly('kalender.json')[datum]).toBeDefined()
  })

  it('POST /admin/tag ohne Lückenfüller meldet null statt eines Fehlers', async () => {
    const datum = `2027-01-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    const response = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        zwilling_pos: 'Substantiv',
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lueckenfuellerOk).toBeNull()
    expect(payload.lueckenfuellerStatus).toBeNull()
  })

  // Eigene IP für die Lückenfüller-/Kollisions-Tests: Der Admin-Limiter erlaubt 60 Anfragen je Minute und IP,
  // die übrigen Tests dieser Datei kämen sonst darüber (429).
  const lfHeaders = () => adminHeaders(token, '198.51.100.62')

  it('POST /admin/tag nimmt für den Lückenfüller ein Wort und speichert die Kennung', async () => {
    // Wort statt Kennung (so trägt es das Formular ein). „Gibt es heute nicht“ gehört
    // zu keinem Wort des Tages und hat keine Runden: Status „unbekannt“, ohne Belege-DB.
    const datum = `2027-03-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    const response = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: lfHeaders(),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        zwilling_pos: 'Substantiv',
        lueckenfueller_id: '  Gibt es heute nicht ',
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.lueckenfuellerId).toBe('gibt-es-heute-nicht')
    expect(payload.lueckenfuellerStatus).toBe('unbekannt')
    expect(loadReadOnly('kalender.json')[datum].lueckenfueller_id).toBe('gibt-es-heute-nicht')
  })

  it('POST /admin/tag übersetzt ein Wort über den Namen eines vorhandenen Lemmas, auch bei abweichender Kennung', async () => {
    const lemma = { id: 'lf-test-kennung-7', lemma: 'Lückenfüller-Testwort', pos: 'Substantiv', lueckenfueller: [{ type: 'single', kollokator: 'x' }] }
    stmts.upsertLemma.run(lemmaToRow(lemma))
    invalidateCache('lemmata.json')

    const datum = `2027-04-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    const body = (eingabe) => JSON.stringify({
      datum,
      woerter: ['Haus', 'Baum', 'Wort'],
      positionen: ['Substantiv', 'Verb', 'Adjektiv'],
      zwilling_pos: 'Substantiv',
      lueckenfueller_id: eingabe,
    })

    // Wort → Kennung des vorhandenen Lemmas (toId(Wort) wäre eine andere Kennung)
    const mitWort = await (await fetch(`${baseUrl}/admin/tag`, { method: 'POST', headers: lfHeaders(), body: body('Lückenfüller-Testwort') })).json()
    expect(mitWort.lueckenfuellerId).toBe('lf-test-kennung-7')
    expect(mitWort.lueckenfuellerStatus).toBe('vorhanden')

    // Kennung (Altdaten, Entwurfs-Postfach) funktioniert unverändert weiter
    const mitKennung = await (await fetch(`${baseUrl}/admin/tag`, { method: 'POST', headers: lfHeaders(), body: body('lf-test-kennung-7') })).json()
    expect(mitKennung.lueckenfuellerId).toBe('lf-test-kennung-7')
    expect(mitKennung.lueckenfuellerStatus).toBe('vorhanden')

    // GET /admin/tag/:datum liefert zur Kennung das Wort für das Formularfeld mit
    const geladen = await (await fetch(`${baseUrl}/admin/tag/${datum}`, { headers: lfHeaders() })).json()
    expect(geladen.lueckenfueller_id).toBe('lf-test-kennung-7')
    expect(geladen.lueckenfueller_lemma).toBe('Lückenfüller-Testwort')
  })

  it('GET /admin/lueckenfueller/runden zählt vorhandene Runden (Wort oder Kennung), sonst 0', async () => {
    stmts.upsertLemma.run(lemmaToRow({ id: 'lf-runden-test-1', lemma: 'Rundentestwort', pos: 'Substantiv', lueckenfueller: [{ type: 'single', kollokator: 'a' }, { type: 'single', kollokator: 'b' }] }))
    stmts.upsertLemma.run(lemmaToRow({ id: 'lf-runden-test-2', lemma: 'Rundenleerwort', pos: 'Substantiv' }))
    invalidateCache('lemmata.json')

    const frage = async (q) => {
      const r = await fetch(`${baseUrl}/admin/lueckenfueller/runden?q=${encodeURIComponent(q)}`, { headers: lfHeaders() })
      return { status: r.status, body: await r.json() }
    }
    expect((await frage('Rundentestwort')).body).toEqual({ vorhandeneRunden: 2 })
    expect((await frage('lf-runden-test-1')).body).toEqual({ vorhandeneRunden: 2 })
    expect((await frage('Rundenleerwort')).body).toEqual({ vorhandeneRunden: 0 })
    expect((await frage('Gibt es nicht')).body).toEqual({ vorhandeneRunden: 0 })

    const ohneLogin = await fetch(`${baseUrl}/admin/lueckenfueller/runden?q=Rundentestwort`)
    expect(ohneLogin.status).toBe(401)
    const ohneWort = await fetch(`${baseUrl}/admin/lueckenfueller/runden`, { headers: lfHeaders() })
    expect(ohneWort.status).toBe(400)
  })

  it('POST /admin/lueckenfueller/generate überschreibt kein Lemma mit abgeleiteter Kennung, aber anderem Namen', async () => {
    const original = { id: 'essen', lemma: 'essen', pos: 'Verb', notiz: 'Notiz des Verbs', ipa: 'ˈɛsn̩', lueckenfueller: [{ type: 'single', kollokator: 'gut' }] }
    stmts.upsertLemma.run(lemmaToRow(original))
    invalidateCache('lemmata.json')

    const response = await fetch(`${baseUrl}/admin/lueckenfueller/generate`, {
      method: 'POST',
      headers: lfHeaders(),
      body: JSON.stringify({ lemmaName: 'Essen' }),
    })
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.ok).toBe(false)
    expect(payload.reason).toContain('„essen“')
    expect(payload.reason).toContain('Bitte das vorhandene Wort verwenden')

    // nichts überschrieben
    const row = stmts.getAllLemmata.all().find((r) => r.id === 'essen')
    expect(row.lemma).toBe('essen')
    expect(row.pos).toBe('Verb')
    expect(row.notiz).toBe('Notiz des Verbs')
    expect(JSON.parse(row.lueckenfueller)).toEqual(original.lueckenfueller)

    // Die Rundenzählung nutzt dieselbe Zuordnung: das Wort „Essen“ hat keine eigenen Runden, „essen“ eine.
    const zaehle = async (q) => (await (await fetch(`${baseUrl}/admin/lueckenfueller/runden?q=${encodeURIComponent(q)}`, { headers: lfHeaders() })).json()).vorhandeneRunden
    expect(await zaehle('essen')).toBe(1)
    expect(await zaehle('Essen')).toBe(0)
  })

  describe('Kennungs-Kollision beim Speichern eines Tages', () => {
    const verb = { id: 'essen', lemma: 'essen', pos: 'Verb', wortart: 'Verb', notiz: 'Notiz des Verbs', link: 'https://example.test/essen', definition: 'Nahrung aufnehmen', ipa: 'ˈɛsn̩', definitionen: ['x'], bonusFrage: { label: 'B', question: 'Q?' }, lueckenfueller: [{ type: 'single', kollokator: 'gut' }] }
    const zeile = (id) => stmts.getAllLemmata.all().find((r) => r.id === id)
    const zufallsDatum = (monat) => `2027-${monat}-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`

    it('bricht ab, wenn die Kennung eines Wortes zu einem Lemma mit anderer Schreibung gehört: 409, nichts geschrieben', async () => {
      stmts.upsertLemma.run(lemmaToRow(verb))
      invalidateCache('lemmata.json')
      const datum = zufallsDatum('08')
      const vorher = zeile('essen')

      const response = await fetch(`${baseUrl}/admin/tag`, {
        method: 'POST',
        headers: lfHeaders(),
        body: JSON.stringify({ datum, woerter: ['Haus', 'Essen', 'Wort'], positionen: ['Substantiv', 'Substantiv', 'Adjektiv'], zwilling_pos: 'Substantiv' }),
      })
      const payload = await response.json()
      expect(response.status).toBe(409)
      expect(payload.error).toBe('Die Kennung „essen“ gehört schon zu „essen“ (Verb). Bitte das vorhandene Wort verwenden.')
      expect(payload.feld).toBe(1)

      expect(zeile('essen')).toEqual(vorher)                       // fremdes Lemma unverändert
      expect(loadReadOnly('kalender.json')[datum]).toBeUndefined() // auch der Tag und die anderen Wörter nicht geschrieben
    })

    it('erlaubt gleichen Namen mit anderer Wortart (Korrektur der Wortart) wie bisher', async () => {
      stmts.upsertLemma.run(lemmaToRow({ id: 'ton', lemma: 'Ton', pos: 'Substantiv', wortart: 'Substantiv', notiz: 'alt' }))
      invalidateCache('lemmata.json')
      const datum = zufallsDatum('09')

      const response = await fetch(`${baseUrl}/admin/tag`, {
        method: 'POST',
        headers: lfHeaders(),
        body: JSON.stringify({ datum, woerter: ['Ton', 'Baum', 'Wort'], positionen: ['Verb', 'Verb', 'Adjektiv'], notizen: ['neu', '', ''], zwilling_pos: 'Substantiv' }),
      })
      expect(response.status).toBe(200)
      const row = zeile('ton')
      expect(row.lemma).toBe('Ton')
      expect(row.pos).toBe('Verb')
      expect(row.notiz).toBe('neu')
    })
  })

  it('POST /admin/tag meldet „mehrdeutig“ statt still ein fremdes Lemma zu verwenden, und speichert den Tag trotzdem', async () => {
    stmts.upsertLemma.run(lemmaToRow({ id: 'essen', lemma: 'essen', pos: 'Verb', lueckenfueller: [{ type: 'single', kollokator: 'gut' }] }))
    invalidateCache('lemmata.json')

    const datum = `2027-06-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    const response = await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: lfHeaders(),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        zwilling_pos: 'Substantiv',
        lueckenfueller_id: 'Essen',
      }),
    })
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.lueckenfuellerStatus).toBe('mehrdeutig')
    expect(payload.lueckenfuellerOk).toBe(false)
    expect(payload.lueckenfuellerId).toBeNull()
    expect(loadReadOnly('kalender.json')[datum].lueckenfueller_id).toBe('')
  })

  it('GET /admin/tag/:datum löst eine als Wort gespeicherte Kennung wie der Spielweg über den Wortnamen auf', async () => {
    stmts.upsertLemma.run(lemmaToRow({ id: 'lf-wortname-1', lemma: 'Wortnamenlemma', pos: 'Substantiv' }))
    invalidateCache('lemmata.json')
    const datum = `2027-07-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    await save('kalender.json', { ...loadReadOnly('kalender.json'), [datum]: { ids: [], thema: '', thema_kurz: '', thema_quelle: '', lueckenfueller_id: 'Wortnamenlemma' } })
    const geladen = await (await fetch(`${baseUrl}/admin/tag/${datum}`, { headers: lfHeaders() })).json()
    expect(geladen.lueckenfueller_lemma).toBe('Wortnamenlemma')
  })

  it('GET /admin/tag/:datum liefert kein Wort, wenn die Kennung zu keinem Lemma passt', async () => {
    const datum = `2027-05-${String((Math.floor(Math.random() * 20) + 10)).padStart(2, '0')}`
    await fetch(`${baseUrl}/admin/tag`, {
      method: 'POST',
      headers: lfHeaders(),
      body: JSON.stringify({
        datum,
        woerter: ['Haus', 'Baum', 'Wort'],
        positionen: ['Substantiv', 'Verb', 'Adjektiv'],
        zwilling_pos: 'Substantiv',
        lueckenfueller_id: 'gibt-es-heute-nicht',
      }),
    })
    const geladen = await (await fetch(`${baseUrl}/admin/tag/${datum}`, { headers: lfHeaders() })).json()
    expect(geladen.lueckenfueller_id).toBe('gibt-es-heute-nicht')
    expect(geladen.lueckenfueller_lemma).toBe('')
  })

  describe('Entwurfs-Postfach', () => {
    // Lückenfüller-ID ohne passendes Wort: hält die Tests unabhängig von der Belege-DB.
    const entwurfsTag = (datum) => ({
      datum,
      woerter: ['Haus', 'Baum', 'Wort'],
      positionen: ['Substantiv', 'Verb', 'Adjektiv'],
      zwilling_pos: 'Substantiv',
      thema: 'Testthema',
      lueckenfueller_id: 'gibt-es-heute-nicht',
    })
    const idFuer = (datum) => ladeOffeneEntwuerfe().find((e) => e.datum === datum).id

    it('GET /admin/entwuerfe liefert offene Entwürfe und verlangt Login', async () => {
      speichereEntwuerfe([entwurfsTag('2027-02-11')])

      const ohneLogin = await fetch(`${baseUrl}/admin/entwuerfe`)
      expect(ohneLogin.status).toBe(401)

      const response = await fetch(`${baseUrl}/admin/entwuerfe`, { headers: adminHeaders(token) })
      const payload = await response.json()
      expect(response.status).toBe(200)
      expect(payload.entwuerfe.some((e) => e.datum === '2027-02-11' && e.tag.thema === 'Testthema')).toBe(true)
    })

    it('GET /admin/entwuerfe meldet, wenn am Datum schon ein Eintrag steht', async () => {
      await fetch(`${baseUrl}/admin/tag`, {
        method: 'POST',
        headers: adminHeaders(token),
        body: JSON.stringify({
          datum: '2027-02-15',
          woerter: ['Haus', 'Baum', 'Wort'],
          positionen: ['Substantiv', 'Verb', 'Adjektiv'],
          zwilling_pos: 'Substantiv',
        }),
      })
      speichereEntwuerfe([entwurfsTag('2027-02-15'), entwurfsTag('2027-02-16')])

      const response = await fetch(`${baseUrl}/admin/entwuerfe`, { headers: adminHeaders(token) })
      const { entwuerfe } = await response.json()
      const belegt = entwuerfe.find((e) => e.datum === '2027-02-15')
      const frei = entwuerfe.find((e) => e.datum === '2027-02-16')

      expect(belegt.belegt.woerter).toHaveLength(3)
      expect(belegt.belegt.woerter[0]).toBe('Haus')
      expect(frei.belegt).toBeNull()
    })

    it('Übernehmen speichert den Tag über den normalen Speicherweg und schließt den Entwurf ab', async () => {
      speichereEntwuerfe([entwurfsTag('2027-02-12')])
      const id = idFuer('2027-02-12')

      const response = await fetch(`${baseUrl}/admin/entwuerfe/${id}/uebernehmen`, {
        method: 'POST', headers: adminHeaders(token),
      })
      const payload = await response.json()

      expect(response.status).toBe(200)
      expect(payload).toMatchObject({ ok: true, datum: '2027-02-12', entwurfId: id, lueckenfuellerStatus: 'unbekannt' })
      expect(loadReadOnly('kalender.json')['2027-02-12']).toBeDefined()
      expect(ladeEntwurf(id).status).toBe('uebernommen')

      const nochmal = await fetch(`${baseUrl}/admin/entwuerfe/${id}/uebernehmen`, {
        method: 'POST', headers: adminHeaders(token),
      })
      expect(nochmal.status).toBe(409)
    })

    it('Paralleles Doppel-Übernehmen speichert den Tag nur einmal', async () => {
      speichereEntwuerfe([entwurfsTag('2027-02-17')])
      const id = idFuer('2027-02-17')
      const anfrage = () => fetch(`${baseUrl}/admin/entwuerfe/${id}/uebernehmen`, {
        method: 'POST', headers: adminHeaders(token),
      })

      const antworten = await Promise.all([anfrage(), anfrage()])
      const status = antworten.map((r) => r.status).sort()
      expect(status).toEqual([200, 409])

      const abgelehnt = await antworten.find((r) => r.status === 409).json()
      expect(['Entwurf wird gerade übernommen', 'Entwurf ist bereits abgeschlossen']).toContain(abgelehnt.error)
      expect(ladeEntwurf(id).status).toBe('uebernommen')
    })

    it('Verwerfen schließt den Entwurf ab, ohne den Kalender anzufassen', async () => {
      speichereEntwuerfe([entwurfsTag('2027-02-13')])
      const id = idFuer('2027-02-13')

      const response = await fetch(`${baseUrl}/admin/entwuerfe/${id}/verwerfen`, {
        method: 'POST', headers: adminHeaders(token),
      })
      expect(response.status).toBe(200)
      expect(ladeEntwurf(id).status).toBe('verworfen')
      expect(loadReadOnly('kalender.json')['2027-02-13']).toBeUndefined()

      const nochmal = await fetch(`${baseUrl}/admin/entwuerfe/${id}/verwerfen`, {
        method: 'POST', headers: adminHeaders(token),
      })
      expect(nochmal.status).toBe(409)
    })

    it('meldet unbekannte und ungültige IDs sauber', async () => {
      const unbekannt = await fetch(`${baseUrl}/admin/entwuerfe/999999/uebernehmen`, {
        method: 'POST', headers: adminHeaders(token),
      })
      expect(unbekannt.status).toBe(404)

      const ungueltig = await fetch(`${baseUrl}/admin/entwuerfe/abc/verwerfen`, {
        method: 'POST', headers: adminHeaders(token),
      })
      expect(ungueltig.status).toBe(400)
    })

    it('Übernehmen bricht bei einer Kennungs-Kollision ab: 409, fremdes Lemma unverändert, Entwurf bleibt offen', async () => {
      const verb = { id: 'essen', lemma: 'essen', pos: 'Verb', wortart: 'Verb', notiz: 'Notiz des Verbs', ipa: 'ˈɛsn̩', lueckenfueller: [{ type: 'single', kollokator: 'gut' }] }
      stmts.upsertLemma.run(lemmaToRow(verb))
      invalidateCache('lemmata.json')
      const vorher = stmts.getAllLemmata.all().find((r) => r.id === 'essen')

      speichereEntwuerfe([{ ...entwurfsTag('2027-02-20'), woerter: ['Haus', 'Baum', 'Essen'] }])
      const id = idFuer('2027-02-20')
      const response = await fetch(`${baseUrl}/admin/entwuerfe/${id}/uebernehmen`, { method: 'POST', headers: lfHeaders() })
      const payload = await response.json()

      expect(response.status).toBe(409)
      expect(payload.error).toContain('Die Kennung „essen“ gehört schon zu „essen“ (Verb)')
      expect(payload.feld).toBe(2)
      expect(stmts.getAllLemmata.all().find((r) => r.id === 'essen')).toEqual(vorher)
      expect(loadReadOnly('kalender.json')['2027-02-20']).toBeUndefined()
      expect(ladeEntwurf(id).status).toBe('offen')

      // Die Reservierung ist wieder frei: ein zweiter Versuch meldet erneut die Kollision, nicht „wird gerade übernommen“.
      const nochmal = await (await fetch(`${baseUrl}/admin/entwuerfe/${id}/uebernehmen`, { method: 'POST', headers: lfHeaders() })).json()
      expect(nochmal.error).toContain('Bitte das vorhandene Wort verwenden')
    })

    it('lehnt einen Entwurf ab, der nicht mehr zum Speicherformat passt', async () => {
      speichereEntwuerfe([{ datum: '2027-02-14', woerter: ['nur', 'zwei'] }])
      const id = idFuer('2027-02-14')

      const response = await fetch(`${baseUrl}/admin/entwuerfe/${id}/uebernehmen`, {
        method: 'POST', headers: adminHeaders(token),
      })
      expect(response.status).toBe(422)
      expect(ladeEntwurf(id).status).toBe('offen')
    })
  })

  it('POST /admin/backup/restore bleibt bei Fehlern atomisch', async () => {
    const originalKalender = loadReadOnly('kalender.json')
    const originalLemmata = loadReadOnly('lemmata.json')
    const markerDatum = '2026-10-31'
    const markerId = 'restore-atomic-marker'

    await save('kalender.json', { ...originalKalender, [markerDatum]: [markerId] })

    const invalidBundle = {
      exportedAt: new Date().toISOString(),
      confirm: true,
      files: {
        'kalender.json': {},
        'lemmata.json': originalLemmata,
        'wortzwilling.json': {},
        'zeitenwende.json': {},
        'stats-rows.json': [null],
      },
    }

    const response = await fetch(`${baseUrl}/admin/backup/restore`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify(invalidBundle),
    })

    // Eine kaputte Statistik-Zeile macht die Datei unbrauchbar: 400, bevor irgendetwas geändert wird
    expect(response.status).toBe(400)

    const kalenderAfter = loadReadOnly('kalender.json')
    const lemmataAfter = loadReadOnly('lemmata.json')

    expect(kalenderAfter[markerDatum]).toEqual({ ids: [markerId], thema: '', thema_kurz: '', thema_quelle: '', lueckenfueller_id: '' })
    expect(lemmataAfter.some((entry) => entry.id === markerId)).toBe(false)

    await save('kalender.json', originalKalender)
  })

  it('POST /admin/users/bulk-update setzt Rollen fuer mehrere Nutzer', async () => {
    const firstUserId = createTestUser()
    const secondUserId = createTestUser()
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)
    const missingUserId = `missing-${Date.now()}`

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'setRole',
        userIds: [firstUserId, secondUserId, missingUserId],
        role: 'premium',
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.action).toBe('setRole')
    expect(payload.changedCount).toBe(2)
    expect(new Set(payload.changed)).toEqual(new Set([firstUserId, secondUserId]))
    expect(payload.skipped).toEqual([missingUserId])

    const firstUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(firstUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(firstUserDetailsRes.status).toBe(200)
    const firstUserDetails = await firstUserDetailsRes.json()
    expect(firstUserDetails.user.role).toBe('premium')

    const secondUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(secondUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(secondUserDetailsRes.status).toBe(200)
    const secondUserDetails = await secondUserDetailsRes.json()
    expect(secondUserDetails.user.role).toBe('premium')
  })

  it('POST /admin/users/bulk-update validiert fehlende role bei setRole', async () => {
    const userId = createTestUser()
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'setRole',
        userIds: [userId],
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'role ist fuer setRole erforderlich' })
  })

  it('POST /admin/users/bulk-update loescht mehrere Nutzer', async () => {
    const firstUserId = createTestUser({ role: 'premium' })
    const secondUserId = createTestUser({ role: 'user' })
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)
    const missingUserId = `missing-${Date.now()}`

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'delete',
        userIds: [firstUserId, secondUserId, missingUserId],
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.action).toBe('delete')
    expect(payload.deletedCount).toBe(2)
    expect(new Set(payload.deleted)).toEqual(new Set([firstUserId, secondUserId]))
    expect(payload.skipped).toEqual([missingUserId])

    const firstUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(firstUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(firstUserDetailsRes.status).toBe(404)

    const secondUserDetailsRes = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(secondUserId)}`, {
      headers: adminHeaders(token),
    })
    expect(secondUserDetailsRes.status).toBe(404)

    testUserIds.delete(firstUserId)
    testUserIds.delete(secondUserId)
  })

  it('POST /admin/users/bulk-update exportiert Nutzer als JSON', async () => {
    const firstUserId = createTestUser({ role: 'premium' })
    const secondUserId = createTestUser()
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'export',
        format: 'json',
        userIds: [secondUserId, firstUserId],
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.action).toBe('export')
    expect(payload.exportedCount).toBe(2)
    expect(payload.users).toHaveLength(2)

    const exportedIds = new Set(payload.users.map((row) => row.id))
    expect(exportedIds).toEqual(new Set([firstUserId, secondUserId]))

    for (const row of payload.users) {
      expect(typeof row.email).toBe('string')
      expect(['user', 'premium']).toContain(row.role)
      expect(typeof row.emailVerified).toBe('boolean')
    }
  })

  it('POST /admin/users/bulk-update exportiert Nutzer als CSV', async () => {
    const firstUserId = createTestUser()
    const secondUserId = createTestUser()
    testUserIds.add(firstUserId)
    testUserIds.add(secondUserId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token),
      body: JSON.stringify({
        action: 'export',
        format: 'csv',
        userIds: [firstUserId, secondUserId],
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('attachment; filename=')
    expect(response.headers.get('x-exported-count')).toBe('2')
    expect(response.headers.get('x-skipped-count')).toBe('0')

    const csv = await response.text()
    expect(csv).toContain('id,name,email,role,emailVerified,createdAt')
    expect(csv).toContain(firstUserId)
    expect(csv).toContain(secondUserId)
  })

  // Eigene Absender-Adresse für die Nutzer-Tests: adminLimiter erlaubt 60 Anfragen/Minute je IP, die Datei hat mehr.
const NUTZER_IP = '198.51.100.61'

// ── Nutzer: Konto-Abruf (Kauf, Konto-Angaben), rein lesend ───────────────

  it('GET /admin/users/:id liefert Kauf und Konto-Angaben, ohne etwas zu schreiben', async () => {
    const userId = createTestUser({ role: 'user' })
    const otherUserId = createTestUser({ role: 'user' })
    testUserIds.add(userId)
    testUserIds.add(otherUserId)
    const suffix = userId.slice(-8)
    const mollieId = `tr_test${suffix}`
    const appleId = `2000000${Date.now()}`.slice(0, 16)
    const fremdId = `tr_fremd${suffix}`
    const now = Date.now()
    addTestPayment(mollieId, userId, '9.99', now - 5000)
    addTestPayment(appleId, userId, '14.99', now - 1000)
    addTestPayment(fremdId, otherUserId, '9.99', now)
    insertEntitlementStmt.run(userId, 1, now - 5000, 'mollie', now, now)
    insertAccountWithProviderStmt.run(randomUUID(), userId, 'fremd-konto-id-4711', 'google', 'geheimes-access-token', 'geheimes-refresh-token', null, nowIso(), nowIso())
    insertAccountWithProviderStmt.run(randomUUID(), userId, userId, 'credential', null, null, 'geheimer-passwort-hash', nowIso(), nowIso())
    insertAccountWithProviderStmt.run(randomUUID(), userId, 'x', 'github', null, null, null, nowIso(), nowIso())
    insertSessionStmt.run(randomUUID(), userId, randomUUID(), new Date(now + 1000000).toISOString(), '203.0.113.9', 'geheimer-user-agent', nowIso(), nowIso())
    db.prepare(`INSERT OR REPLACE INTO user_activity (user_id, last_active_at, inactivity_warned_at) VALUES (?, ?, ?)`)
      .run(userId, '2026-10-22T08:00:00.000Z', '2026-10-19T08:00:00.000Z')

    const entitlementBefore = db.prepare('SELECT * FROM user_entitlements WHERE user_id = ?').get(userId)
    const paymentsBefore = countPaymentsStmt.get(userId).n

    const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}`, { headers: adminHeaders(token, NUTZER_IP) })
    const raw = await response.text()
    const payload = JSON.parse(raw)

    expect(response.status).toBe(200)
    expect(payload.konto.zuletztAktiv).toBe('2026-10-22T08:00:00.000Z')
    expect(payload.konto.loeschWarnungAm).toBe('2026-10-19T08:00:00.000Z')
    expect([...payload.konto.anmeldung].sort()).toEqual(['andere', 'credential', 'google'])
    expect(payload.kauf.gesamtausgabe).toBe(true)
    expect(payload.kauf.quelle).toBe('mollie')
    expect(payload.kauf.seit).toBe(new Date(now - 5000).toISOString())

    // Neueste Zahlung zuerst; fremder Beleg erscheint nicht
    expect(payload.kauf.zahlungen.map((z) => z.beleg)).toEqual([appleId, mollieId])
    expect(payload.kauf.zahlungen[0]).toMatchObject({ quelle: 'apple', betrag: '14.99', waehrung: 'EUR', status: 'paid', produkt: 'gesamtausgabe' })
    expect(payload.kauf.zahlungen[1]).toMatchObject({ quelle: 'mollie', betrag: '9.99' })
    expect(raw).not.toContain(fremdId)

    // Nur die vereinbarten Felder: keine IP, kein User-Agent, keine Tokens, keine Hashes, keine Fremd-IDs
    for (const geheim of ['geheimes-access-token', 'geheimes-refresh-token', 'geheimer-passwort-hash', 'geheimer-user-agent', '203.0.113.9', 'fremd-konto-id-4711', 'ipAddress', 'userAgent', 'accessToken', 'password']) {
      expect(raw).not.toContain(geheim)
    }

    // Rein lesend: Entitlement-Zeile unverändert, keine neue Zahlung
    expect(db.prepare('SELECT * FROM user_entitlements WHERE user_id = ?').get(userId)).toEqual(entitlementBefore)
    expect(countEntitlementsStmt.get(userId).n).toBe(1)
    expect(countPaymentsStmt.get(userId).n).toBe(paymentsBefore)
  })

  it('GET /admin/users/:id legt für Konten ohne Entitlement keine Zeile an', async () => {
    const userId = createTestUser({ role: 'premium' })
    testUserIds.add(userId)
    expect(countEntitlementsStmt.get(userId).n).toBe(0)

    const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}`, { headers: adminHeaders(token, NUTZER_IP) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.kauf).toEqual({ gesamtausgabe: false, seit: null, quelle: null, zahlungen: [] })
    expect(payload.konto.anmeldung).toEqual([])
    expect(payload.konto.loeschWarnungAm).toBeNull()
    expect(payload.konto.rolleGeaendertAm).toEqual(expect.any(String))
    // Beweis „rein lesend“: Der Abruf hat keine Zeile angelegt (anders als account.js beim Lesen)
    expect(countEntitlementsStmt.get(userId).n).toBe(0)
  })

  it('GET /admin/users liefert gekauft je Konto und zählt Admins nicht als User', async () => {
    const marker = `kauf${Date.now().toString(36)}`
    const buyerId = createTestUser({ role: 'user' })
    const plainId = createTestUser({ role: 'user' })
    testUserIds.add(buyerId)
    testUserIds.add(plainId)
    db.prepare('UPDATE user SET name = ? WHERE id IN (?, ?)').run(marker, buyerId, plainId)
    const now = Date.now()
    insertEntitlementStmt.run(buyerId, 1, now, 'apple-iap', now, now)

    const response = await fetch(`${baseUrl}/admin/users?q=${marker}`, { headers: adminHeaders(token, NUTZER_IP) })
    const payload = await response.json()
    expect(response.status).toBe(200)
    const byId = new Map(payload.users.map((u) => [u.id, u]))
    expect(byId.get(buyerId).gekauft).toBe(true)
    expect(byId.get(plainId).gekauft).toBe(false)

    // Zählung ohne Admins: ein weiteres Admin-Konto ändert weder „User“ noch „Premium“.
    // Synchron zwischen den beiden Zählungen, damit parallele Testdateien nicht dazwischenfunken.
    const before = countUsersByRoleStmt.get()
    const extraAdmin = createTestUser({ role: 'admin' })
    testUserIds.add(extraAdmin)
    const after = countUsersByRoleStmt.get()
    expect(after.users).toBe(before.users)
    expect(after.premium).toBe(before.premium)
  })

  // ── Nutzer: Admin-Konten sind geschützt ───────────────────────────────────

  const getRoleStmt = db.prepare(`SELECT role FROM user_profiles WHERE user_id = ?`)
  const userExists = (id) => !!db.prepare('SELECT 1 FROM user WHERE id = ?').get(id)

  it('PATCH und POST /admin/users/:id/role lehnen Admin-Konten ab (auch das eigene)', async () => {
    const otherAdmin = createTestUser({ role: 'admin' })
    testUserIds.add(otherAdmin)
    const ownAdmin = db.prepare('SELECT userId FROM session WHERE id = ?').get(testSessionId).userId

    for (const targetId of [otherAdmin, ownAdmin]) {
      for (const method of ['PATCH', 'POST']) {
        const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(targetId)}/role`, {
          method,
          headers: adminHeaders(token, NUTZER_IP),
          body: JSON.stringify({ role: 'user' }),
        })
        const payload = await response.json()
        expect(response.status).toBe(403)
        expect(payload.error).toContain('Admin-Konten')
        expect(getRoleStmt.get(targetId).role).toBe('admin')
      }
    }
  })

  it('Rolle admin lässt sich über die Routen nicht vergeben', async () => {
    const userId = createTestUser({ role: 'user' })
    testUserIds.add(userId)

    const single = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ role: 'admin' }),
    })
    expect(single.status).toBe(400)

    const bulk = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ action: 'setRole', role: 'admin', userIds: [userId] }),
    })
    expect(bulk.status).toBe(400)
    expect(getRoleStmt.get(userId)?.role ?? 'user').toBe('user')
  })

  it('DELETE /admin/users/:id lehnt Admin-Konten ab (auch das eigene), normale Konten gehen', async () => {
    const otherAdmin = createTestUser({ role: 'admin' })
    const normalId = createTestUser({ role: 'premium' })
    testUserIds.add(otherAdmin)
    testUserIds.add(normalId)
    const ownAdmin = db.prepare('SELECT userId FROM session WHERE id = ?').get(testSessionId).userId

    for (const targetId of [otherAdmin, ownAdmin]) {
      const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
        headers: adminHeaders(token, NUTZER_IP),
      })
      const payload = await response.json()
      expect(response.status).toBe(403)
      expect(payload.error).toContain('Admin-Konten')
      expect(userExists(targetId)).toBe(true)
    }

    const ok = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(normalId)}`, {
      method: 'DELETE',
      headers: adminHeaders(token, NUTZER_IP),
    })
    expect(ok.status).toBe(200)
    expect(userExists(normalId)).toBe(false)
    testUserIds.delete(normalId)
  })

  it('bulk-update setRole überspringt Admin-Konten und meldet sie mit Grund', async () => {
    const adminId = createTestUser({ role: 'admin' })
    const userId = createTestUser({ role: 'user' })
    testUserIds.add(adminId)
    testUserIds.add(userId)
    const ownAdmin = db.prepare('SELECT userId FROM session WHERE id = ?').get(testSessionId).userId
    const missingId = `missing-${Date.now()}`

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ action: 'setRole', role: 'premium', userIds: [adminId, ownAdmin, userId, missingId] }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.changed).toEqual([userId])
    expect(payload.changedCount).toBe(1)
    expect(new Set(payload.skipped)).toEqual(new Set([adminId, ownAdmin, missingId]))
    expect(payload.skippedDetails).toEqual(expect.arrayContaining([
      { id: missingId, reason: 'not_found' },
      { id: adminId, reason: 'admin' },
      { id: ownAdmin, reason: 'admin' },
    ]))
    expect(getRoleStmt.get(adminId).role).toBe('admin')
    expect(getRoleStmt.get(ownAdmin).role).toBe('admin')
    expect(getRoleStmt.get(userId).role).toBe('premium')
  })

  it('bulk-update setRole meldet Konten mit gleicher Rolle als unchanged und protokolliert nur echte Änderungen', async () => {
    const hasPremium = createTestUser({ role: 'premium' })
    const isBasis = createTestUser({ role: 'user' })
    testUserIds.add(hasPremium)
    testUserIds.add(isBasis)
    const auditCount = (id) => db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'user' AND resource_id = ?").get(id).n

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ action: 'setRole', role: 'premium', userIds: [hasPremium, isBasis] }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.changed).toEqual([isBasis])
    expect(payload.changedCount).toBe(1)
    expect(payload.unchanged).toEqual([hasPremium])
    expect(payload.unchangedCount).toBe(1)
    expect(auditCount(hasPremium)).toBe(0)
    expect(auditCount(isBasis)).toBe(1)
    expect(getRoleStmt.get(hasPremium).role).toBe('premium')
  })

  it('PATCH /admin/users/:id/role mit unveränderter Rolle schreibt und protokolliert nichts, Antwort ok', async () => {
    const userId = createTestUser({ role: 'premium' })
    testUserIds.add(userId)
    const profilVorher = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId)
    const auditVorher = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'user' AND resource_id = ?").get(userId).n

    const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ role: 'premium' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true, userId, role: 'premium' })
    expect(db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId)).toEqual(profilVorher)
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE resource = 'user' AND resource_id = ?").get(userId).n).toBe(auditVorher)
  })

  it('PATCH /admin/users/:id/role protokolliert die vorherige Rolle', async () => {
    const userId = createTestUser({ role: 'premium' })
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ role: 'user' }),
    })
    expect(response.status).toBe(200)

    const row = db.prepare("SELECT changes_json FROM audit_log WHERE resource = 'user' AND resource_id = ? ORDER BY id DESC LIMIT 1").get(userId)
    const changes = JSON.parse(row.changes_json)
    expect(changes.before).toEqual({ role: 'premium' })
    expect(changes.after).toEqual({ role: 'user' })
  })

  it('bulk-update delete überspringt Admin-Konten und löscht nur die übrigen', async () => {
    const adminId = createTestUser({ role: 'admin' })
    const userId = createTestUser({ role: 'user' })
    testUserIds.add(adminId)
    testUserIds.add(userId)
    const ownAdmin = db.prepare('SELECT userId FROM session WHERE id = ?').get(testSessionId).userId

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ action: 'delete', userIds: [adminId, ownAdmin, userId] }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.deleted).toEqual([userId])
    expect(payload.deletedCount).toBe(1)
    expect(payload.skippedDetails).toEqual(expect.arrayContaining([
      { id: adminId, reason: 'admin' },
      { id: ownAdmin, reason: 'admin' },
    ]))
    expect(userExists(adminId)).toBe(true)
    expect(userExists(ownAdmin)).toBe(true)
    expect(userExists(userId)).toBe(false)
    testUserIds.delete(userId)
  })

  it('bulk-update setRole nur mit Admin-Konten ändert nichts', async () => {
    const adminId = createTestUser({ role: 'admin' })
    testUserIds.add(adminId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ action: 'setRole', role: 'user', userIds: [adminId] }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.changedCount).toBe(0)
    expect(payload.skippedDetails).toEqual([{ id: adminId, reason: 'admin' }])
    expect(getRoleStmt.get(adminId).role).toBe('admin')
  })

  it('bulk-update export bleibt für Admin-Konten möglich (nur lesend)', async () => {
    const adminId = createTestUser({ role: 'admin' })
    testUserIds.add(adminId)

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ action: 'export', format: 'json', userIds: [adminId] }),
    })
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.exportedCount).toBe(1)
    expect(payload.skipped).toEqual([])
  })

  // ── CSV-Export: Schutz vor Formel-Einschleusung ───────────────────────────

  it('bulk-update CSV entschärft Zellen, die mit = + - @ Tab oder CR beginnen', async () => {
    const gefaehrlich = ['=HYPERLINK("http://boese.example","x")', '+cmd|calc', '-2+3', '@SUM(A1)', '\tTab', '\rCR']
    const ids = gefaehrlich.map((name, i) => {
      const id = `admin-test-csv-${Date.now().toString(36)}-${i}`
      const iso = new Date().toISOString()
      insertUserStmt.run({ id, name, email: `csv-${Date.now().toString(36)}-${i}@example.test`, emailVerified: 1, image: null, createdAt: iso, updatedAt: iso })
      testUserIds.add(id)
      return id
    })

    const response = await fetch(`${baseUrl}/admin/users/bulk-update`, {
      method: 'POST',
      headers: adminHeaders(token, NUTZER_IP),
      body: JSON.stringify({ action: 'export', format: 'csv', userIds: ids }),
    })
    expect(response.status).toBe(200)
    const csv = await response.text()

    // Kein Namensfeld beginnt mit einem Formelzeichen: Jedes bekommt ein vorangestelltes '
    expect(csv).toContain(`"'=HYPERLINK(""http://boese.example"",""x"")"`)
    expect(csv).toContain(`'+cmd|calc`)
    expect(csv).toContain(`'-2+3`)
    expect(csv).toContain(`'@SUM(A1)`)
    expect(csv).toContain(`'\tTab`)
    expect(csv).toContain(`"'\rCR"`)
    // Normale Werte bleiben unverändert
    expect(csv).toContain('id,name,email,role,emailVerified,createdAt')
  })

  // ── Admin-Login (POST /admin/auth) ────────────────────────────

  const loginHeaders = {
    'content-type': 'application/json',
    'x-forwarded-for': '198.51.100.77',
  }

  it('POST /admin/auth lehnt fehlende Zugangsdaten mit 400 ab', async () => {
    const response = await fetch(`${baseUrl}/admin/auth`, {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({}),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Email und Passwort erforderlich' })
  })

  it('POST /admin/auth weist falsches Passwort mit 401 ab', async () => {
    const { userId, email } = await createCredentialUser({ role: 'admin', password: 'korrektes-passwort' })
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/auth`, {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({ email, password: 'falsches-passwort' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Email oder Passwort falsch' })
  })

  it('POST /admin/auth weist Nicht-Admin trotz korrektem Passwort mit 401 ab', async () => {
    const { userId, email } = await createCredentialUser({ role: 'user', password: 'korrektes-passwort' })
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/auth`, {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({ email, password: 'korrektes-passwort' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Email oder Passwort falsch' })
  })

  it('POST /admin/auth meldet gültige Admin-Credentials mit 200 + Session-Cookie an', async () => {
    const { userId, email } = await createCredentialUser({ role: 'admin', password: 'korrektes-passwort' })
    testUserIds.add(userId)

    const response = await fetch(`${baseUrl}/admin/auth`, {
      method: 'POST',
      headers: loginHeaders,
      body: JSON.stringify({ email, password: 'korrektes-passwort' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ok: true })
    expect(response.headers.get('set-cookie')).toContain('better-auth.session_token=')
  })
})
