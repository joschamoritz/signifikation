// Auswertung › Spiele (Schritt 8): GET /admin/auswertung/spiele und der CSV-Export.
// Die Daten liegen in einem festen Zeitraum der Vergangenheit (2021), die Uhr ist per Fake-Date darauf gestellt:
// So sind alle Zahlen exakt prüfbar, auch wenn andere Testdateien Zeilen in derselben Test-Datenbank hinterlassen.
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import adminRouter from '../routes/admin.js'
import { buildSpieleCsv } from '../routes/admin-stats.js'
import { invalidateStatsCache } from '../store.js'
import db from '../db.js'

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, 1, NULL, @createdAt, @updatedAt)
`)
const upsertProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)
const insertSessionStmt = db.prepare(`
  INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const insertStatsStmt = db.prepare(`
  INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(datum, spiel, user_id) DO UPDATE SET plays = excluded.plays, scoreSum = excluded.scoreSum, maxSum = excluded.maxSum, dist = excluded.dist
`)

const PREFIX = `ausw-spiele-${Date.now()}`
const IP = '198.51.100.71'
const createdUserIds = []
const createdSessionIds = []

const dist = (...paare) => {
  const d = Array(11).fill(0)
  for (const [punkte, n] of paare) d[punkte] = n
  return JSON.stringify(d)
}

function makeUser(role) {
  const id = `${PREFIX}-u-${createdUserIds.length}`
  const nowIso = new Date().toISOString()
  insertUserStmt.run({ id, name: 'Auswertung Test', email: `${id}@example.test`, createdAt: nowIso, updatedAt: nowIso })
  const now = Date.now()
  upsertProfileStmt.run(id, role, now, now)
  createdUserIds.push(id)
  return id
}

const headers = (token) => ({ cookie: `better-auth.session_token=${token}`, 'x-forwarded-for': IP })
const jetzt = (iso) => vi.setSystemTime(new Date(iso))

describe('Auswertung › Spiele', () => {
  let server
  let baseUrl
  let token
  let spieler
  let adminKonto

  const hole = async (pfad) => {
    const res = await fetch(`${baseUrl}${pfad}`, { headers: headers(token) })
    return { res, text: await res.clone().text(), json: res.headers.get('content-type')?.includes('json') ? await res.json() : null }
  }

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    adminKonto = makeUser('admin')
    spieler = makeUser('user')
    token = randomUUID()
    const sessionId = randomUUID()
    createdSessionIds.push(sessionId)
    const nowIso = new Date().toISOString()
    // Die Sitzung läuft ab 2021 bis weit in die Zukunft, damit sie auch bei gestellter Uhr gültig ist
    insertSessionStmt.run(sessionId, adminKonto, token, new Date(Date.now() + 864e5 * 400).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)

    // Heute (10.03.2021): zwei anonyme Kollokationen-Spiele
    insertStatsStmt.run('2021-03-10', 'kollokationen', '', 2, 14, 20, dist([7, 2]))
    // 08.03.: Wort-Zwilling und Lückenfüller mit Konto (Lückenfüller muss auftauchen), dazu ein Admin-Konto (zählt nicht)
    insertStatsStmt.run('2021-03-08', 'wortzwilling', spieler, 1, 8, 10, dist([8, 1]))
    insertStatsStmt.run('2021-03-08', 'lueckenfueller', spieler, 3, 12, 30, dist([4, 3]))
    insertStatsStmt.run('2021-03-08', 'kollokationen', adminKonto, 5, 50, 50, dist([10, 5]))
    // Wort der Woche: eigene Schlüssel, Donnerstag 04.03. und Freitag 05.03.
    insertStatsStmt.run('2021-03-04', 'woche_zeitenwende', spieler, 1, 6, 10, dist([6, 1]))
    insertStatsStmt.run('2021-03-05', 'woche_wortzwilling', spieler, 3, 21, 30, dist([7, 3]))
    // Vorzeitraum (die 30 Tage vor dem 09.02.): 10 Spiele
    insertStatsStmt.run('2021-02-01', 'kollokationen', '', 10, 50, 100, dist([5, 10]))
  })

  afterAll(async () => {
    db.prepare("DELETE FROM stats WHERE datum LIKE '2021-%'").run()
    for (const id of createdSessionIds) db.prepare('DELETE FROM session WHERE id = ?').run(id)
    for (const id of createdUserIds) {
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user WHERE id = ?').run(id)
    }
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    jetzt('2021-03-10T12:00:00Z') // 13:00 Uhr in Berlin
    invalidateStatsCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    invalidateStatsCache()
  })

  it('30 Tage sind genau 30 Einträge, Tage ohne Spiel stehen mit 0 da, nur heute ist "teil"', async () => {
    const { res, json: d } = await hole('/admin/auswertung/spiele?days=30')
    expect(res.status).toBe(200)
    expect(d.tage).toHaveLength(30)
    expect(d.zeitraum).toMatchObject({ days: 30, von: '2021-02-09', bis: '2021-03-10' })
    expect(d.tage[0].datum).toBe('2021-02-09')
    expect(d.tage.at(-1)).toMatchObject({ datum: '2021-03-10', teil: true })
    expect(d.tage.filter((t) => t.teil)).toHaveLength(1)
    // lückenlos aufsteigend
    d.tage.forEach((t, i) => { if (i) expect(t.datum > d.tage[i - 1].datum).toBe(true) })
    const leer = d.tage.find((t) => t.datum === '2021-03-09')
    expect(Object.keys(leer.modi)).toEqual(['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller'])
    for (const m of Object.values(leer.modi)) expect(m).toEqual({ spiele: 0, punkte: 0, max: 0 })
  })

  it('12 Monate: 365 Tage, kein Vorzeitraum; 7 Tage: 7 Tage mit Vorzeitraum', async () => {
    const jahr = (await hole('/admin/auswertung/spiele?days=365')).json
    expect(jahr.tage).toHaveLength(365)
    expect(jahr.vorher).toBeNull()
    const woche = (await hole('/admin/auswertung/spiele?days=7')).json
    expect(woche.tage).toHaveLength(7)
    expect(woche.vorher).toEqual({ spiele: 0, punkte: 0, max: 0 })
  })

  it('Lückenfüller ist enthalten (Tag, Summe, Verteilung)', async () => {
    const { json: d } = await hole('/admin/auswertung/spiele?days=30')
    const tag = d.tage.find((t) => t.datum === '2021-03-08')
    expect(tag.modi.lueckenfueller).toEqual({ spiele: 3, punkte: 12, max: 30 })
    expect(tag.modi.wortzwilling).toEqual({ spiele: 1, punkte: 8, max: 10 })
    expect(d.verteilung.lueckenfueller[4]).toBe(3)
    expect(d.verteilung.wortzwilling[8]).toBe(1)
  })

  it('Summen: ohne Admin-Konto, mit Anteil der Spiele mit Konto; Vorzeitraum getrennt', async () => {
    const { json: d } = await hole('/admin/auswertung/spiele?days=30')
    // 2 (anonym, heute) + 1 + 3 (mit Konto, 08.03.); die 5 Spiele des Admin-Kontos zählen nicht
    expect(d.summe).toEqual({ spiele: 6, punkte: 14 + 8 + 12, max: 20 + 10 + 30, mitKonto: 4, kontoBasis: 6 })
    expect(d.zeitraum.verdichtetBis).toBeNull()
    expect(d.vorher).toEqual({ spiele: 10, punkte: 50, max: 100 })
    expect(d.verteilung.kollokationen[7]).toBe(2)
    expect(d.verteilung.kollokationen[10]).toBe(0) // Admin-Zeile (5 × volle Punktzahl) fehlt
  })

  it('Wort der Woche: eigene Schlüssel, am Spieltag, getrennt von den Tagesspielen', async () => {
    const { json: d } = await hole('/admin/auswertung/spiele?days=30')
    expect(d.wortDerWoche).toEqual({ spiele: 4, punkte: 27, max: 40 })
    // weder in den Tagen noch in der Summe oder der Verteilung
    expect(d.tage.find((t) => t.datum === '2021-03-04').modi.zeitenwende.spiele).toBe(0)
    expect(d.tage.find((t) => t.datum === '2021-03-05').modi.wortzwilling.spiele).toBe(0)
    expect(d.summe.spiele).toBe(6)
    expect(d.verteilung.zeitenwende.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('Berliner Tag: 22:30 UTC im Sommer ist schon der nächste Tag (00:30 Uhr), Spiele von "heute" zählen', async () => {
    jetzt('2021-07-14T22:30:00Z')
    insertStatsStmt.run('2021-07-15', 'zeitenwende', '', 2, 9, 20, dist([4, 1], [5, 1]))
    invalidateStatsCache()
    const { json: d } = await hole('/admin/auswertung/spiele?days=7')
    expect(d.zeitraum).toMatchObject({ von: '2021-07-09', bis: '2021-07-15' })
    expect(d.tage.at(-1)).toMatchObject({ datum: '2021-07-15', teil: true })
    expect(d.tage.at(-1).modi.zeitenwende.spiele).toBe(2)
    expect(d.tage.map((t) => t.datum)).not.toContain('2021-07-08')
  })

  it('Berliner Tag: 23:30 UTC im Winter ist schon der nächste Tag; 22:59 UTC noch nicht', async () => {
    jetzt('2021-01-14T23:30:00Z')
    expect((await hole('/admin/auswertung/spiele?days=3')).json.zeitraum.bis).toBe('2021-01-15')
    jetzt('2021-01-14T22:59:00Z')
    invalidateStatsCache()
    expect((await hole('/admin/auswertung/spiele?days=3')).json.zeitraum.bis).toBe('2021-01-14')
  })

  it('Nach Mitternacht (Berlin) gilt der neue Tag auch dann, wenn der Zwischenspeicher noch frisch ist', async () => {
    jetzt('2021-03-10T22:58:00Z') // 23:58 Uhr
    expect((await hole('/admin/auswertung/spiele?days=7')).json.zeitraum.bis).toBe('2021-03-10')
    jetzt('2021-03-10T23:02:00Z') // 00:02 Uhr am 11.03.: nur 4 Minuten später, die 5 Minuten des Zwischenspeichers laufen noch
    const neu = (await hole('/admin/auswertung/spiele?days=7')).json
    expect(neu.zeitraum.bis).toBe('2021-03-11')
    expect(neu.tage.at(-1)).toMatchObject({ datum: '2021-03-11', teil: true })
  })

  it('enthält keine Konto-IDs, Namen oder E-Mail-Adressen', async () => {
    const { text } = await hole('/admin/auswertung/spiele?days=365')
    expect(text).not.toContain(spieler)
    expect(text).not.toContain(adminKonto)
    expect(text).not.toMatch(/email|@example|user_id|"name"/i)
  })

  it('Zwischenspeicher: der zweite Aufruf liefert denselben Stand, bis er geleert wird', async () => {
    const a = (await hole('/admin/auswertung/spiele?days=30')).json
    jetzt('2021-03-10T12:01:00Z')
    insertStatsStmt.run('2021-03-10', 'zeitenwende', '', 4, 20, 40, dist([5, 4]))
    const b = (await hole('/admin/auswertung/spiele?days=30')).json
    expect(b.zeitraum.stand).toBe(a.zeitraum.stand)
    expect(b.summe.spiele).toBe(a.summe.spiele)
    invalidateStatsCache()
    const c = (await hole('/admin/auswertung/spiele?days=30')).json
    expect(c.summe.spiele).toBe(a.summe.spiele + 4)
    // nach 5 Minuten läuft er auch von selbst ab
    insertStatsStmt.run('2021-03-10', 'zeitenwende', '', 5, 25, 50, dist([5, 5]))
    jetzt('2021-03-10T12:07:00Z')
    const d = (await hole('/admin/auswertung/spiele?days=30')).json
    expect(d.summe.spiele).toBe(a.summe.spiele + 5)
  })

  it('?frisch=1 übergeht den Zwischenspeicher und ersetzt dessen Eintrag; ohne frisch bleibt der alte Stand', async () => {
    const a = (await hole('/admin/auswertung/spiele?days=30')).json
    insertStatsStmt.run('2021-03-10', 'lueckenfueller', '', 6, 30, 60, dist([5, 6]))
    try {
      jetzt('2021-03-10T12:01:00Z')
      expect((await hole('/admin/auswertung/spiele?days=30')).json.summe.spiele).toBe(a.summe.spiele) // gespeichert
      const frisch = (await hole('/admin/auswertung/spiele?days=30&frisch=1')).json
      expect(frisch.summe.spiele).toBe(a.summe.spiele + 6)
      expect(frisch.zeitraum.stand).not.toBe(a.zeitraum.stand)
      // der frisch gerechnete Stand liegt jetzt im Speicher (keine zweite Variante)
      const danach = (await hole('/admin/auswertung/spiele?days=30')).json
      expect(danach.zeitraum.stand).toBe(frisch.zeitraum.stand)
      // nur "1" ist erlaubt
      expect((await hole('/admin/auswertung/spiele?days=30&frisch=ja')).res.status).toBe(400)
    } finally {
      db.prepare("DELETE FROM stats WHERE datum = '2021-03-10' AND spiel = 'lueckenfueller' AND user_id = ''").run()
    }
  })

  it('days=1 ("Spiele heute") liegt höchstens 30 Sekunden im Zwischenspeicher, längere Zeiträume 5 Minuten', async () => {
    const heute = async (days) => (await hole(`/admin/auswertung/spiele?days=${days}`)).json.summe.spiele
    const eins = await heute(1)
    const dreissig = await heute(30)
    insertStatsStmt.run('2021-03-10', 'lueckenfueller', '', 7, 30, 70, dist([5, 7]))
    try {
      jetzt('2021-03-10T12:00:20Z')
      expect(await heute(1)).toBe(eins) // nach 20 s noch gespeichert
      jetzt('2021-03-10T12:00:31Z')
      expect(await heute(1)).toBe(eins + 7) // nach 31 s neu gerechnet
      expect(await heute(30)).toBe(dreissig) // 30 Tage: noch im Speicher
    } finally {
      db.prepare("DELETE FROM stats WHERE datum = '2021-03-10' AND spiel = 'lueckenfueller' AND user_id = ''").run()
    }
  })

  it('"Mit Konto" bei verdichteten Tagen: Tage vor heute - 180 haben keine Konto-Zeilen mehr und zählen nicht in den Anteil', async () => {
    // Heute 10.03.2021 → Konto-Zeilen gibt es ab 11.09.2020. Verdichtet: alles Ältere liegt in der anonymen Zeile.
    const basis = (await hole('/admin/auswertung/spiele?days=365')).json.summe // was frühere Tests in der Datenbank hinterlassen haben
    insertStatsStmt.run('2020-08-01', 'kollokationen', '', 100, 500, 1000, dist([5, 100]))
    insertStatsStmt.run('2020-09-11', 'wortzwilling', spieler, 2, 10, 20, dist([5, 2])) // erster Tag mit Konto-Zeilen
    invalidateStatsCache()
    try {
      const jahr = (await hole('/admin/auswertung/spiele?days=365')).json
      expect(jahr.zeitraum.verdichtetBis).toBe('2020-09-10')
      // Spiele zählen alle (auch verdichtete), der Konto-Anteil nur die Tage ab 11.09.2020
      expect(jahr.summe.spiele).toBe(basis.spiele + 100 + 2)
      expect(jahr.summe.mitKonto).toBe(basis.mitKonto + 2)
      expect(jahr.summe.kontoBasis).toBe(basis.kontoBasis + 2)
      expect(basis.kontoBasis).toBe(basis.spiele) // ohne verdichtete Tage ist der Nenner die ganze Summe
      // 90 Tage reichen nicht bis zur Verdichtung: alles wie gehabt
      const kurz = (await hole('/admin/auswertung/spiele?days=90')).json
      expect(kurz.zeitraum.verdichtetBis).toBeNull()
      expect(kurz.summe.kontoBasis).toBe(kurz.summe.spiele)
    } finally {
      db.prepare("DELETE FROM stats WHERE (datum = '2020-08-01' AND spiel = 'kollokationen' AND user_id = '') OR (datum = '2020-09-11' AND spiel = 'wortzwilling' AND user_id = ?)").run(spieler)
    }
  })

  it('Zeitraum wird geprüft (1 bis 365) und die Route verlangt eine Anmeldung', async () => {
    for (const days of ['0', '366', 'abc']) expect((await hole(`/admin/auswertung/spiele?days=${days}`)).res.status).toBe(400)
    const ohne = await fetch(`${baseUrl}/admin/auswertung/spiele?days=30`)
    expect(ohne.status).toBe(401)
    // Ohne Angabe gilt der Standard von 30 Tagen
    expect((await hole('/admin/auswertung/spiele')).json.tage).toHaveLength(30)
  })

  it('Die alten Endpunkte mit Rangliste sind weg', async () => {
    expect((await hole('/admin/stats/summary?days=30&topUsers=10')).res.status).toBe(404)
    expect((await hole('/admin/stats?days=30')).res.status).toBe(404)
  })

  describe('CSV-Export', () => {
    it('Semikolon, deutsche Spalten, Dezimalkomma, BOM, Dateiname mit Zeitraum', async () => {
      const { res, text } = await hole('/admin/stats/export?days=30&format=csv')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/csv')
      expect(res.headers.get('content-disposition')).toContain('attachment')
      expect(res.headers.get('content-disposition')).toContain('signifikation-spiele-2021-02-09-bis-2021-03-10.csv')
      // fetch entfernt das BOM beim Dekodieren nicht, text() schon: Rohbytes prüfen
      const roh = Buffer.from(await (await fetch(`${baseUrl}/admin/stats/export?days=30&format=csv`, { headers: headers(token) })).arrayBuffer())
      expect([...roh.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const zeilen = text.replace(/^\uFEFF/, '').trim().split('\r\n')
      expect(zeilen[0]).toBe('Tag;Spielmodus;Spiele;Punkte;Höchstpunkte;Durchschnitt')
      expect(zeilen).toContain('10.03.2021;Kollokationen;2;14;20;"7,0"')
      expect(zeilen).toContain('08.03.2021;Lückenfüller;3;12;30;"4,0"')
      expect(zeilen).toContain('05.03.2021;Wort der Woche: Wort-Zwilling;3;21;30;"7,0"')
      // Admin-Konto und Tage ohne Spiele fehlen; keine Kommas als Trenner
      expect(text).not.toContain('09.03.2021')
      expect(zeilen.every((z) => z.split(';').length === 6)).toBe(true)
    })

    it('ohne Spiele im Zeitraum bleibt nur die Kopfzeile', async () => {
      jetzt('2021-11-20T12:00:00Z')
      const { text } = await hole('/admin/stats/export?days=7')
      expect(text.replace(/^\uFEFF/, '').trim()).toBe('Tag;Spielmodus;Spiele;Punkte;Höchstpunkte;Durchschnitt')
    })

    it('schützt Zellen vor Formel-Einschleusung', () => {
      const csv = buildSpieleCsv([{ datum: '2021-03-10', spiel: '=1+1', spiele: 1, punkte: 0, max: 1 }])
      expect(csv).toContain("'=1+1")
      expect(csv).not.toMatch(/;=1\+1/)
      const zeilen = csv.replace(/^\uFEFF/, '').trim().split('\r\n')
      expect(zeilen[1]).toBe("10.03.2021;'=1+1;1;0;1;\"0,0\"")
    })

    it('Höchstpunkte 0 ergibt einen leeren Durchschnitt statt "NaN"', () => {
      const csv = buildSpieleCsv([{ datum: '2021-03-10', spiel: 'kollokationen', spiele: 1, punkte: 0, max: 0 }])
      expect(csv).toContain('10.03.2021;Kollokationen;1;0;0;')
      expect(csv).not.toContain('NaN')
    })
  })
})
