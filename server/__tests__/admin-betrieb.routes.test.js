// Werkzeuge › Betrieb: Systemzustand, Sicherung (Jetzt sichern, Wiederherstellen) und Änderungsprotokoll.
//
// Alle Sicherungen dieser Tests landen in einem Wegwerf-Ordner (SQLITE_BACKUP_DIR), nie in server/data.
// Die Test-Datenbank selbst legt vitest.global-setup.js in einem Temp-Ordner an (APP_DB).
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const backupDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join: pfad } = await import('node:path')
  const dir = mkdtempSync(pfad(tmpdir(), 'sig-betrieb-backups-'))
  process.env.SQLITE_BACKUP_DIR = dir
  return dir
})

// Echte Sicherung, aber als Spy: Einzelne Tests lassen sie scheitern (Sicherheitskopie vor dem Wiederherstellen).
vi.mock('../jobs/sqliteBackup.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, runSqliteBackup: vi.fn(real.runSqliteBackup) }
})

const { default: adminRouter } = await import('../routes/admin.js')
const { default: db } = await import('../db.js')
const { loadReadOnly, save } = await import('../store.js')
const { runSqliteBackup } = await import('../jobs/sqliteBackup.js')

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, 1, NULL, @now, @now)
`)
const insertAuditStmt = db.prepare(`
  INSERT INTO audit_log (timestamp, action, resource, resource_id, changes_json, admin_key_last4, ip, status, error, entry_hash)
  VALUES (@timestamp, @action, @resource, @resource_id, @changes_json, 'test', NULL, @status, NULL, @entry_hash)
`)
const insertStatsStmt = db.prepare(`
  INSERT OR REPLACE INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
  VALUES (@datum, @spiel, @user_id, 3, 15, 30, '[0,0,0,0,0,3,0,0,0,0,0]')
`)
const statsMitKontoStmt = db.prepare(`SELECT COUNT(*) AS n FROM stats WHERE user_id = ?`)

let anfrageZaehler = 0
function adminHeaders(token) {
  return {
    'content-type': 'application/json',
    cookie: `better-auth.session_token=${token}`,
    // Jede Anfrage von einer anderen Adresse: Der Admin-Limiter erlaubt 60 Anfragen je Minute und Adresse.
    'x-forwarded-for': `203.0.113.${(anfrageZaehler++ % 250) + 1}`,
  }
}

describe('Werkzeuge › Betrieb (Server)', () => {
  let server
  let baseUrl
  let token
  let userId
  let sessionId
  let ausgangsDatei // Inhalte vor den Tests, wird am Ende zurückgespielt

  const get = (path) => fetch(`${baseUrl}${path}`, { headers: adminHeaders(token) })
  const post = (path, body) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })
  const backupDateien = () => (existsSync(backupDir) ? readdirSync(backupDir).filter((f) => f.endsWith('.db.gz')) : [])

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use('/admin/backup/restore', express.json({ limit: '10mb' }))
    app.use(express.json())
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const now = new Date().toISOString()
    userId = `betrieb-test-${randomUUID()}`
    insertUserStmt.run({ id: userId, name: 'Betrieb Test', email: `${userId}@example.test`, now })
    db.prepare('INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)').run(userId, 'admin', Date.now(), Date.now())
    sessionId = randomUUID()
    token = randomUUID()
    db.prepare('INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(sessionId, userId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test-agent', now, now)

    ausgangsDatei = await (await get('/admin/backup')).json()
  })

  afterAll(async () => {
    // Inhalte wie vorher; die Statistik bleibt wie sie ist (Standard)
    if (ausgangsDatei && server) await post('/admin/backup/restore', { ...ausgangsDatei, confirm: true })
    db.prepare('DELETE FROM stats WHERE user_id LIKE ?').run('betrieb-test-%')
    db.prepare('DELETE FROM session WHERE id = ?').run(sessionId)
    db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM user WHERE id = ?').run(userId)
    if (server) await new Promise((resolve) => server.close(resolve))
    rmSync(backupDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    runSqliteBackup.mockClear()
  })

  describe('Änderungsprotokoll: Filter', () => {
    const marke = `zzProtokollTest${Date.now().toString(36)}`
    const zeile = (timestamp, { action = 'CREATE', resource = 'kalender', status = 'SUCCESS', id = `${marke}-${timestamp}` } = {}) => {
      insertAuditStmt.run({
        timestamp, action, resource, resource_id: id, status,
        changes_json: JSON.stringify({ after: { woerter: ['Äpfel'] } }),
        entry_hash: randomUUID(),
      })
    }
    const eintraege = async (query) => {
      const r = await get(`/admin/audit-log?q=${encodeURIComponent(marke)}&${query}`)
      expect(r.status).toBe(200)
      return r.json()
    }

    beforeAll(() => {
      zeile('2026-10-22T10:00:00.000Z', { status: 'SUCCESS' })
      zeile('2026-10-23T09:00:00.000Z', { action: 'LOGIN_FAIL', resource: 'security', status: 'FAIL' })
      zeile('2026-10-23T21:30:00.000Z') // 23:30 Uhr Berliner Zeit (Sommerzeit) am 23.10.
      zeile('2026-10-23T22:30:00.000Z') // 00:30 Uhr am 24.10.
      zeile('2026-12-01T23:30:00.000Z') // 00:30 Uhr am 02.12. (Winterzeit)
      zeile('2026-12-01T22:30:00.000Z') // 23:30 Uhr am 01.12.
      zeile('2026-11-15T12:00:00.000Z', { status: 'OK' }) // ältere Einträge tragen teils OK
    })

    it('Ergebnis „fehlgeschlagen“ (FAIL) trifft FAIL-Einträge, FAILED gilt gleich', async () => {
      const fail = await eintraege('status=FAIL')
      expect(fail.entries).toHaveLength(1)
      expect(fail.entries[0].action).toBe('LOGIN_FAIL')
      expect(fail.totalMatches).toBe(1)
      expect((await eintraege('status=FAILED')).totalMatches).toBe(1)
    })

    it('Ergebnis „erfolgreich“ zeigt alles außer FAIL (auch ältere Einträge mit OK)', async () => {
      const ok = await eintraege('status=SUCCESS&limit=50')
      expect(ok.totalMatches).toBe(6)
      expect(ok.entries.every((e) => e.status !== 'FAIL')).toBe(true)
    })

    it('Vorgang: alle protokollierten Vorgänge sind filterbar, Unbekanntes wird abgewiesen', async () => {
      expect((await eintraege('action=LOGIN_FAIL')).totalMatches).toBe(1)
      for (const action of ['LOGIN_SUCCESS', 'LOGOUT', 'SESSIONS_INVALIDATED', 'CHECKOUT_REJECT_COUNTRY', 'PAYMENT_REJECT', 'WEBHOOK_REJECT']) {
        const r = await get(`/admin/audit-log?action=${action}&limit=1`)
        expect(r.status).toBe(200)
      }
      expect((await get('/admin/audit-log?action=DROP_TABLE')).status).toBe(400)
      expect((await get('/admin/audit-log?status=KAPUTT')).status).toBe(400)
    })

    it('Suche unabhängig von Groß-/Kleinschreibung, auch mit Umlauten im Inhalt', async () => {
      const r1 = await get(`/admin/audit-log?q=${encodeURIComponent(marke.toUpperCase())}&limit=50`)
      const r2 = await get(`/admin/audit-log?q=${encodeURIComponent(marke.toLowerCase())}&limit=50`)
      expect((await r1.json()).totalMatches).toBe(7)
      expect((await r2.json()).totalMatches).toBe(7)
      const umlaut = await get(`/admin/audit-log?q=${encodeURIComponent('ÄPFEL')}&limit=500`)
      expect((await umlaut.json()).totalMatches).toBeGreaterThanOrEqual(7)
      // Groß geschriebener Bereichsname trifft den kleingeschriebenen Eintrag
      expect((await eintraege('resource=KALENDER&limit=50')).totalMatches).toBe(6)
    })

    it('„Bis“ schließt den gewählten Tag nach Berliner Zeit ein, „Von“ beginnt um 0 Uhr Berliner Zeit', async () => {
      const bis = await eintraege('to=2026-10-23&limit=50')
      const zeiten = bis.entries.map((e) => e.timestamp)
      expect(zeiten).toContain('2026-10-23T21:30:00.000Z') // 23:30 Uhr Berliner Zeit am 23.10.
      expect(zeiten).not.toContain('2026-10-23T22:30:00.000Z') // schon der 24.10.

      const von = await eintraege('from=2026-10-24&to=2026-10-24&limit=50')
      expect(von.entries.map((e) => e.timestamp)).toEqual(['2026-10-23T22:30:00.000Z'])
    })

    it('Tagesgrenze gilt auch in der Winterzeit', async () => {
      const tag1 = await eintraege('from=2026-12-01&to=2026-12-01&limit=50')
      expect(tag1.entries.map((e) => e.timestamp)).toEqual(['2026-12-01T22:30:00.000Z'])
      const tag2 = await eintraege('from=2026-12-02&to=2026-12-02&limit=50')
      expect(tag2.entries.map((e) => e.timestamp)).toEqual(['2026-12-01T23:30:00.000Z'])
    })

    it('limit begrenzt die Zeilen, totalMatches zählt alle Treffer; neueste zuerst', async () => {
      const r = await eintraege('limit=2')
      expect(r.entries).toHaveLength(2)
      expect(r.totalMatches).toBe(7)
      expect(r.begrenzt).toBe(false)
      expect(r.entries[0].timestamp > r.entries[1].timestamp).toBe(true)
    })
  })

  describe('Systemzustand', () => {
    it('GET /admin/health liefert die neuen Felder ohne Geheimnisse oder Pfade', async () => {
      const r = await get('/admin/health')
      expect(r.status).toBe(200)
      const h = await r.json()
      expect(h.status).toBe('ok')
      expect(h.appDb).toBe('ok')
      expect(typeof h.wortprofilDb).toBe('string')
      expect(h.push).toEqual({ web: expect.any(Boolean), ios: expect.any(Boolean), geraete: expect.any(Number) })
      expect(h.mail).toEqual({ eingerichtet: expect.any(Boolean) })
      expect(h.sicherung).toMatchObject({ anzahl: expect.any(Number) })
      expect(h.kursmaterial).toMatchObject({ laeuft: false })
      expect(h.protokoll).toHaveProperty('zuletzt')

      const roh = JSON.stringify(h)
      expect(roh).not.toContain(backupDir)
      expect(roh).not.toMatch(/[A-Za-z]:[\\/]|\/home\/|\/srv\//)
      expect(roh.toLowerCase()).not.toMatch(/password|secret|vapid|smtp/)
    })

    it('zählt nur die tägliche Sicherung als „zuletzt“, Handsicherungen nicht', async () => {
      const vorher = await (await get('/admin/health')).json()
      expect(vorher.sicherung.zuletzt).toBeNull()

      expect((await post('/admin/backup/sqlite', {})).status).toBe(200)
      const mitHand = await (await get('/admin/health')).json()
      expect(mitHand.sicherung.zuletzt).toBeNull()
      expect(mitHand.sicherung.anzahl).toBe(0)

      await runSqliteBackup()
      const mitTaeglich = await (await get('/admin/health')).json()
      expect(Date.parse(mitTaeglich.sicherung.zuletzt)).toBeGreaterThan(Date.now() - 60_000)
      expect(mitTaeglich.sicherung.anzahl).toBe(1)
    })

    it('GET /admin/performance nennt keinen Serverpfad', async () => {
      const p = await (await get('/admin/performance')).json()
      expect(p.db.datei).toMatch(/\.db$/)
      expect(p.db).not.toHaveProperty('path')
      expect(p.db.sizeBytes).toBeGreaterThan(0)
    })

    it('GET /admin/course/pdf-status liefert den Stand je Station', async () => {
      const s = await (await get('/admin/course/pdf-status')).json()
      expect(Array.isArray(s.stationen)).toBe(true)
      expect(s).toHaveProperty('running')
    })
  })

  describe('Sicherung', () => {
    it('GET /admin/backup/umfang zählt die Inhalte', async () => {
      const u = await (await get('/admin/backup/umfang')).json()
      expect(Object.keys(u).sort()).toEqual(['kalender', 'lemmata', 'statsRows', 'statsRowsMitKonto', 'wortzwilling', 'zeitenwende'])
      expect(u.kalender).toBe(Object.keys(loadReadOnly('kalender.json')).length)
      expect(u.lemmata).toBe(loadReadOnly('lemmata.json').length)
    })

    it('GET /admin/backup heißt signifikation-inhalte-JJJJ-MM-TT.json', async () => {
      const r = await get('/admin/backup')
      expect(r.headers.get('content-disposition')).toMatch(/filename="signifikation-inhalte-\d{4}-\d{2}-\d{2}\.json"/)
    })

    it('POST /admin/backup/sqlite: eigene Datei mit Uhrzeit, nur der Dateiname in der Antwort, Eintrag im Protokoll', async () => {
      const tageszeit = backupDateien().filter((f) => !f.includes('-manuell'))
      const r = await post('/admin/backup/sqlite', {})
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body.datei).toMatch(/^signifikation-\d{4}-\d{2}-\d{2}-\d{4,6}-manuell\.db\.gz$/)
      expect(body.datei).not.toMatch(/[\\/]/)
      expect(body.sizeBytes).toBeGreaterThan(0)
      expect(backupDateien()).toContain(body.datei)
      // die tägliche Sicherung wurde nicht angefasst
      expect(backupDateien().filter((f) => !f.includes('-manuell'))).toEqual(tageszeit)

      const protokoll = await (await get(`/admin/audit-log?q=${encodeURIComponent(body.datei)}`)).json()
      expect(protokoll.entries[0]).toMatchObject({ action: 'CREATE', resource: 'backup', resourceId: 'sqlite' })
    })

    it('POST /admin/backup/sqlite: ein laufender Vorgang → 409, kein zweiter Start', async () => {
      const [a, b] = await Promise.all([post('/admin/backup/sqlite', {}), post('/admin/backup/sqlite', {})])
      expect([a.status, b.status].sort()).toEqual([200, 409])
      const abgelehnt = await (a.status === 409 ? a : b).json()
      expect(abgelehnt.skipped).toBe(true)
    })

    it('POST /admin/backup/sqlite lehnt unbekannte Felder ab', async () => {
      expect((await post('/admin/backup/sqlite', { dir: '/etc' })).status).toBe(400)
    })

    it('GET /admin/backup/sqlite listet Sicherungen mit Anlass', async () => {
      const liste = await (await get('/admin/backup/sqlite')).json()
      expect(liste.laeuft).toBe(false)
      expect(liste.backups.length).toBeGreaterThan(0)
      expect(liste.backups.every((b) => ['taeglich', 'manuell', 'vor-wiederherstellung'].includes(b.anlass))).toBe(true)
    })
  })

  describe('Wiederherstellen', () => {
    const marker = '2098-03-04'
    let datei

    beforeEach(async () => {
      // Der Kalender enthält einen Tag, den die Datei NICHT hat – ihn merken wir uns als Zeichen für „unverändert“
      const kalender = loadReadOnly('kalender.json')
      await save('kalender.json', { ...kalender, [marker]: ['restore-marker-a', 'restore-marker-b', 'restore-marker-c'] })
      datei = await (await get('/admin/backup')).json()
      delete datei.files['kalender.json'][marker] // die Datei stammt „von vorher“
      insertStatsStmt.run({ datum: '2098-03-04', spiel: 'kollokationen', user_id: 'betrieb-test-konto' })
    })

    const markerDa = () => Object.hasOwn(loadReadOnly('kalender.json'), marker)

    it.each(['lemmata.json', 'kalender.json', 'wortzwilling.json', 'zeitenwende.json'])(
      'weist eine Datei ohne %s ab: 400, nichts geändert, keine Sicherheitskopie',
      async (teil) => {
        const unvollstaendig = structuredClone(datei)
        delete unvollstaendig.files[teil]
        const vorher = backupDateien()
        const r = await post('/admin/backup/restore', { ...unvollstaendig, confirm: true })
        expect(r.status).toBe(400)
        expect((await r.json()).error).toBe(`Datei unvollständig: ${teil} fehlt`)
        expect(markerDa()).toBe(true)
        expect(backupDateien()).toEqual(vorher)
        expect(runSqliteBackup).not.toHaveBeenCalled()
      },
    )

    it('weist einen Teil mit falschem Format ab', async () => {
      const kaputt = structuredClone(datei)
      kaputt.files['kalender.json'] = []
      const r = await post('/admin/backup/restore', { ...kaputt, confirm: true })
      expect(r.status).toBe(400)
      expect(markerDa()).toBe(true)
    })

    it('leere Teile sind erlaubt (leer ist eine Angabe, fehlen nicht)', async () => {
      const leer = structuredClone(datei)
      leer.files['wortzwilling.json'] = {}
      leer.files['zeitenwende.json'] = {}
      const r = await post('/admin/backup/restore', { ...leer, confirm: true })
      expect(r.status).toBe(200)
      expect((await r.json()).restored.wortzwilling).toBe(0)
    })

    it('legt vorher eine Sicherheitskopie der ganzen Datenbank an und lässt die Statistik standardmäßig unverändert', async () => {
      const r = await post('/admin/backup/restore', { ...datei, confirm: true })
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body.ok).toBe(true)
      expect(body.statistikErsetzt).toBe(false)
      expect(body.sicherheitskopie).toMatch(/^signifikation-\d{4}-\d{2}-\d{2}-\d{4,6}-vor-wiederherstellung\.db\.gz$/)
      expect(backupDateien()).toContain(body.sicherheitskopie)
      expect(runSqliteBackup).toHaveBeenCalledWith({ anlass: 'vor-wiederherstellung' })

      // ersetzt: der Tag, den die Datei nicht hat, ist weg
      expect(markerDa()).toBe(false)
      // Statistik je Konto bleibt
      expect(statsMitKontoStmt.get('betrieb-test-konto').n).toBe(1)

      const protokoll = await (await get(`/admin/audit-log?resource=backup&q=${encodeURIComponent(body.sicherheitskopie)}`)).json()
      expect(protokoll.entries[0].changes.after).toMatchObject({ mitStatistik: false, sicherheitskopie: body.sicherheitskopie })
      expect(protokoll.entries[0].changes.after.zahlen).toMatchObject({ kalender: body.restored.kalender })
    })

    it('ersetzt die Statistik nur mit ausdrücklicher Option', async () => {
      const r = await post('/admin/backup/restore', { ...datei, confirm: true, mitStatistik: true })
      expect(r.status).toBe(200)
      expect((await r.json()).statistikErsetzt).toBe(true)
      // Die Datei hat die Statistik nur zusammengefasst (user_id ''): Zeilen je Konto sind weg
      expect(statsMitKontoStmt.get('betrieb-test-konto').n).toBe(0)
    })

    it('mit Option, aber ohne Statistik in der Datei: 400 und nichts geändert', async () => {
      const ohne = structuredClone(datei)
      delete ohne.files['stats-rows.json']
      delete ohne.files['stats.json']
      const r = await post('/admin/backup/restore', { ...ohne, confirm: true, mitStatistik: true })
      expect(r.status).toBe(400)
      expect(markerDa()).toBe(true)
    })

    it('scheitert die Sicherheitskopie, bleibt alles unverändert (500)', async () => {
      runSqliteBackup.mockRejectedValueOnce(new Error('Platte voll'))
      const r = await post('/admin/backup/restore', { ...datei, confirm: true })
      expect(r.status).toBe(500)
      expect((await r.json()).error).toMatch(/nichts geändert/)
      expect(markerDa()).toBe(true)
      expect(statsMitKontoStmt.get('betrieb-test-konto').n).toBe(1)
    })

    it('meldet die Prüfung der Sicherheitskopie als Fehler, ohne etwas zu ändern', async () => {
      runSqliteBackup.mockResolvedValueOnce({ integrityFailed: true, detail: 'kaputt' })
      const r = await post('/admin/backup/restore', { ...datei, confirm: true })
      expect(r.status).toBe(500)
      expect(markerDa()).toBe(true)
    })

    it('läuft schon eine Sicherung: 409, nichts geändert', async () => {
      runSqliteBackup.mockResolvedValueOnce({ skipped: true })
      const r = await post('/admin/backup/restore', { ...datei, confirm: true })
      expect(r.status).toBe(409)
      expect(markerDa()).toBe(true)
    })

    it('eine ungültige Statistik-Zeile weist die Datei ab, bevor etwas geändert wird', async () => {
      const kaputt = structuredClone(datei)
      kaputt.files['stats-rows.json'] = [null]
      const r = await post('/admin/backup/restore', { ...kaputt, confirm: true })
      expect(r.status).toBe(400)
      expect(markerDa()).toBe(true)
      expect(runSqliteBackup).not.toHaveBeenCalled()
    })

    it('verlangt die Bestätigung', async () => {
      const r = await post('/admin/backup/restore', { ...datei })
      expect(r.status).toBe(400)
      expect(markerDa()).toBe(true)
    })
    it('Probelauf (pruefen) zählt wie der Server: ungültige Datumsschlüssel fallen weg, nichts wird geändert', async () => {
      const probe = structuredClone(datei)
      probe.files['kalender.json'] = { '2026-01-01': ['a', 'b', 'c'], quatsch: ['x'], '2026-01-02': ['a', 'b', 'c'] }
      const vorher = backupDateien()
      const r = await post('/admin/backup/restore/pruefen', probe)
      expect(r.status).toBe(200)
      const body = await r.json()
      expect(body.zahlen.kalender).toBe(2)
      expect(body.hatStatistik).toBe(true)
      expect(markerDa()).toBe(true)
      expect(backupDateien()).toEqual(vorher)
      expect(runSqliteBackup).not.toHaveBeenCalled()
    })

    it('Probelauf lehnt ab, was das Wiederherstellen ablehnt (fehlender Teil, kaputte Statistik)', async () => {
      const ohne = structuredClone(datei)
      delete ohne.files['zeitenwende.json']
      const r1 = await post('/admin/backup/restore/pruefen', ohne)
      expect(r1.status).toBe(400)
      expect((await r1.json()).error).toBe('Datei unvollständig: zeitenwende.json fehlt')

      const kaputt = structuredClone(datei)
      kaputt.files['stats-rows.json'] = [null]
      expect((await post('/admin/backup/restore/pruefen', kaputt)).status).toBe(400)

      const keineStatistik = structuredClone(datei)
      delete keineStatistik.files['stats-rows.json']
      delete keineStatistik.files['stats.json']
      expect((await (await post('/admin/backup/restore/pruefen', keineStatistik)).json()).hatStatistik).toBe(false)
    })

    it('Probelauf verlangt die Anmeldung', async () => {
      const r = await fetch(`${baseUrl}/admin/backup/restore/pruefen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datei) })
      expect(r.status).toBe(401)
    })

    it('zählt die Statistik nur, wenn sie ersetzt wird (statsRows 0 ohne Option)', async () => {
      const ohne = await (await post('/admin/backup/restore', { ...datei, confirm: true })).json()
      expect(ohne.restored.statsRows).toBe(0)
      const mit = await (await post('/admin/backup/restore', { ...datei, confirm: true, mitStatistik: true })).json()
      expect(mit.restored.statsRows).toBeGreaterThan(0)
    })

    it('schreibt nur bekannte Dateinamen ins Protokoll und begrenzt exportedAt', async () => {
      const fremd = structuredClone(datei)
      fremd.files['evil<img src=x>.json'] = []
      const r = await post('/admin/backup/restore', { ...fremd, confirm: true })
      expect(r.status).toBe(200)
      const sicherheitskopie = (await r.json()).sicherheitskopie
      const protokoll = await (await get(`/admin/audit-log?resource=backup&q=${encodeURIComponent(sicherheitskopie)}`)).json()
      const dateien = protokoll.entries[0].changes.after.files
      expect(dateien).toContain('kalender.json')
      expect(dateien.some((name) => name.includes('evil'))).toBe(false)

      const lang = await post('/admin/backup/restore', { ...datei, confirm: true, exportedAt: 'x'.repeat(41) })
      expect(lang.status).toBe(400)
    })

    it('scheitert die Transaktion nach der Sicherheitskopie: 500, Daten unverändert, Kopie liegt da, kein Pfad in der Antwort', async () => {
      const kaputt = structuredClone(datei)
      kaputt.files['lemmata.json'] = [null]
      const vorher = backupDateien()
      const r = await post('/admin/backup/restore', { ...kaputt, confirm: true })
      expect(r.status).toBe(500)
      const fehler = (await r.json()).error
      expect(fehler).toMatch(/Es wurde nichts geändert/)
      expect(fehler).toMatch(/vor-wiederherstellung/)
      expect(fehler).not.toContain(backupDir)
      expect(markerDa()).toBe(true)
      expect(statsMitKontoStmt.get('betrieb-test-konto').n).toBe(1)
      const neu = backupDateien().filter((f) => !vorher.includes(f))
      expect(neu).toHaveLength(1)
      expect(fehler).toContain(neu[0])
    })

    it('Fehlermeldungen von Sichern und Wiederherstellen nennen keinen Serverpfad', async () => {
      runSqliteBackup.mockRejectedValueOnce(new Error(`ENOENT: no such file or directory, open '${backupDir}/geheim.tmp'`))
      const r1 = await post('/admin/backup/sqlite', {})
      expect(r1.status).toBe(500)
      expect(JSON.stringify(await r1.json())).not.toContain(backupDir)

      runSqliteBackup.mockRejectedValueOnce(new Error(`EACCES: ${backupDir}`))
      const r2 = await post('/admin/backup/restore', { ...datei, confirm: true })
      expect(r2.status).toBe(500)
      expect(JSON.stringify(await r2.json())).not.toContain(backupDir)
    })
  })

  describe('Protokoll: Last und Abfrage', () => {
    const marke = `zzLast${Date.now().toString(36)}`

    it('auditSecurity kürzt lange Textwerte', async () => {
      const { auditSecurity, AUDIT_DETAIL_MAX } = await import('../audit.js')
      auditSecurity('LOGIN_FAIL', { subject: `${marke}-a`, reason: 'x'.repeat(5000), zahl: 7 }, { ip: '203.0.113.9', status: 'FAIL' })
      const r = await (await get(`/admin/audit-log?q=${marke}-a`)).json()
      const details = r.entries[0].changes.details
      expect(details.reason.length).toBeLessThanOrEqual(AUDIT_DETAIL_MAX + 1)
      expect(details.zahl).toBe(7)
      expect(AUDIT_DETAIL_MAX).toBe(200)
    })

    it('gedrosselte Ereignisse: ein Eintrag je Schlüssel und Fenster, der Rest wird gezählt', async () => {
      const { auditSecurityGedrosselt, resetAuditDrosselung } = await import('../audit.js')
      resetAuditDrosselung()
      const schluessel = `T:${marke}`
      const eintragen = () => auditSecurityGedrosselt(schluessel, 'WEBHOOK_REJECT', { subject: `${marke}-b` }, { ip: '203.0.113.10', status: 'FAIL' }, { fensterMs: 40 })
      expect(eintragen()).toBe(true)
      expect(eintragen()).toBe(false)
      expect(eintragen()).toBe(false)
      // andere Absender sind unabhängig
      expect(auditSecurityGedrosselt(`${schluessel}-anders`, 'WEBHOOK_REJECT', { subject: `${marke}-c` }, {}, { fensterMs: 40 })).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 60))
      expect(eintragen()).toBe(true)

      const r = await (await get(`/admin/audit-log?q=${marke}-b&limit=10`)).json()
      expect(r.totalMatches).toBe(2)
      expect(r.entries[0].changes.details.unterdrueckt).toBe(2)
      expect(r.entries[1].changes.details.unterdrueckt).toBeUndefined()
    })

    it('Webhook-Zahlungs-IDs: nur die Mollie-Form kommt durch', async () => {
      const { nurMollieId } = await import('../routes/payments.js')
      expect(nurMollieId('tr_WDqYK6vllg')).toBe('tr_WDqYK6vllg')
      expect(nurMollieId('x'.repeat(5000))).toBeUndefined()
      expect(nurMollieId('tr_<script>')).toBeUndefined()
      expect(nurMollieId({ id: 'tr_abc' })).toBeUndefined()
      expect(nurMollieId(`tr_${'a'.repeat(41)}`)).toBeUndefined()
    })

    it('Drosselschlüssel: IPv6 wird wie im Rate-Limiter auf das /56-Präfix gekürzt', async () => {
      const { drosselSchluessel } = await import('../audit.js')
      expect(drosselSchluessel('WEBHOOK_REJECT', '2001:db8:abcd:1234::1')).toBe(drosselSchluessel('WEBHOOK_REJECT', '2001:db8:abcd:12ff::9'))
      expect(drosselSchluessel('WEBHOOK_REJECT', '2001:db8:abcd:1234::1')).not.toBe(drosselSchluessel('WEBHOOK_REJECT', '2001:db8:abcd:1334::1'))
      expect(drosselSchluessel('WEBHOOK_REJECT', '203.0.113.7')).toBe('WEBHOOK_REJECT:203.0.113.7')
      expect(drosselSchluessel('A', '203.0.113.7')).not.toBe(drosselSchluessel('B', '203.0.113.7'))
    })

    const sammeleintraege = async () => {
      const r = await (await get('/admin/audit-log?action=WEBHOOK_REJECT&q=sammeleintrag&limit=50')).json()
      return r.entries.map((e) => e.changes.details.ueberlauf)
    }

    it('globales Budget: darüber wird gezählt und als ein Sammeleintrag geschrieben', async () => {
      const { auditSecurityGedrosselt, resetAuditDrosselung } = await import('../audit.js')
      resetAuditDrosselung()
      const einstellungen = { fensterMs: 60, budgetMax: 3 }
      const ergebnis = []
      for (let i = 0; i < 6; i++) ergebnis.push(auditSecurityGedrosselt(`B:${marke}-${i}`, 'WEBHOOK_REJECT', { subject: `${marke}-budget-${i}` }, { ip: '203.0.113.20', status: 'FAIL' }, einstellungen))
      expect(ergebnis).toEqual([true, true, true, false, false, false])
      // Einzeleinträge: nur drei; der Sammeleintrag kommt am Ende des Fensters
      expect((await (await get(`/admin/audit-log?q=${marke}-budget&limit=50`)).json()).totalMatches).toBe(3)
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(await sammeleintraege()).toContain(3)
      // Im nächsten Fenster gilt das Budget neu
      expect(auditSecurityGedrosselt(`B:${marke}-neu`, 'WEBHOOK_REJECT', { subject: `${marke}-budget-neu` }, {}, einstellungen)).toBe(true)
    })

    it('volle Tabelle: Überlauf wird gezählt statt still verworfen', async () => {
      const { auditSecurityGedrosselt, resetAuditDrosselung } = await import('../audit.js')
      resetAuditDrosselung()
      const einstellungen = { fensterMs: 60, budgetMax: 1000, mapMax: 3 }
      const ergebnis = []
      for (let i = 0; i < 7; i++) ergebnis.push(auditSecurityGedrosselt(`M:${marke}-${i}`, 'WEBHOOK_REJECT', { subject: `${marke}-map-${i}` }, { status: 'FAIL' }, einstellungen))
      expect(ergebnis).toEqual([true, true, true, false, false, false, false])
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(await sammeleintraege()).toContain(4)
    })

    it('Filter von/bis müssen echte Tage sein (400 statt 500)', async () => {
      for (const frage of ['from=2026-13-01', 'to=2026-02-30', 'from=2026-00-10', 'to=2026-04-31']) {
        expect((await get(`/admin/audit-log?${frage}`)).status, frage).toBe(400)
      }
      expect((await get('/admin/audit-log?from=2028-02-29&to=2028-03-01')).status).toBe(200)
    })

    it('Berliner Tagesbeginn als UTC: Sommerzeit, Winterzeit und die Umstellungstage', async () => {
      const { berlinTagBeginn } = await import('../audit.js')
      expect(berlinTagBeginn('2026-10-23')).toBe('2026-10-22T22:00:00.000Z')
      expect(berlinTagBeginn('2026-12-02')).toBe('2026-12-01T23:00:00.000Z')
      expect(berlinTagBeginn('2026-03-29')).toBe('2026-03-28T23:00:00.000Z') // Umstellung auf Sommerzeit nachts um 2 Uhr
      expect(berlinTagBeginn('2026-03-30')).toBe('2026-03-29T22:00:00.000Z')
      expect(berlinTagBeginn('2026-10-25')).toBe('2026-10-24T22:00:00.000Z') // Umstellung auf Winterzeit
      expect(berlinTagBeginn('2026-10-26')).toBe('2026-10-25T23:00:00.000Z')
    })

    it('Suche durchsucht höchstens AUDIT_SCAN_MAX Zeilen und meldet „begrenzt“', async () => {
      const { AUDIT_SCAN_MAX } = await import('../audit.js')
      expect(AUDIT_SCAN_MAX).toBe(5000)
      const bereich = `zzlast${Date.now().toString(36)}`
      const einfuegen = db.transaction(() => {
        for (let i = 0; i < AUDIT_SCAN_MAX + 5; i++) {
          insertAuditStmt.run({
            timestamp: new Date(Date.UTC(2099, 0, 1, 0, 0, 0) + i * 1000).toISOString(), action: 'CREATE', resource: bereich, resource_id: `${marke}-${i}`,
            status: 'SUCCESS', changes_json: '{}', entry_hash: randomUUID(),
          })
        }
      })
      einfuegen()
      try {
        const r = await (await get(`/admin/audit-log?resource=${bereich}&q=${marke}&limit=5`)).json()
        expect(r.begrenzt).toBe(true)
        expect(r.totalMatches).toBe(AUDIT_SCAN_MAX)
        expect(r.durchsuchtMax).toBe(AUDIT_SCAN_MAX)
        expect(r.entries).toHaveLength(5)
        // ohne Suche gibt es keine Grenze: gezählt wird über den Index
        const ohne = await (await get(`/admin/audit-log?resource=${bereich}&limit=5`)).json()
        expect(ohne.totalMatches).toBe(AUDIT_SCAN_MAX + 5)
        expect(ohne.begrenzt).toBe(false)
      } finally {
        db.prepare('DELETE FROM audit_log WHERE resource = ?').run(bereich)
      }
    })

    it('Suche mit Umlauten findet unabhängig von der Schreibweise (JS-Prüfung)', async () => {
      insertAuditStmt.run({ timestamp: '2026-10-01T10:00:00.000Z', action: 'CREATE', resource: 'push', resource_id: `${marke}-u`, status: 'SUCCESS', changes_json: JSON.stringify({ after: { title: 'Größenwahn Äpfel' } }), entry_hash: randomUUID() })
      for (const q of ['GRÖßENWAHN', 'größenwahn', 'ÄPFEL', 'äpfel']) {
        const r = await (await get(`/admin/audit-log?q=${encodeURIComponent(q)}&resource=push&limit=50`)).json()
        expect(r.entries.some((e) => e.resourceId === `${marke}-u`), q).toBe(true)
      }
    })
  })
})
