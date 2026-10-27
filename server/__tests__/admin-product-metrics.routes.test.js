// Auswertung › Kennzahlen (Schritt 8): Zahlungen, Eigenes Lemma, aktive Konten und Wiederkehr.
// Alle Daten liegen im Jahr 2021, die Uhr ist per Fake-Date darauf gestellt (20.07.2021, 14:00 Uhr Berlin):
// So sind die Zahlen exakt prüfbar, auch wenn andere Testdateien Zeilen in derselben Test-Datenbank hinterlassen.
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import adminRouter from '../routes/admin.js'
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
const insertPaymentStmt = db.prepare(`
  INSERT INTO payments (id, user_id, amount, currency, status, product, processed_at)
  VALUES (?, ?, ?, 'EUR', ?, 'gesamtausgabe', ?)
`)
const insertUsageStmt = db.prepare(`
  INSERT INTO custom_lemma_usage (user_id, date, count) VALUES (?, ?, ?)
  ON CONFLICT(user_id, date) DO UPDATE SET count = excluded.count
`)
const insertStatsStmt = db.prepare(`
  INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist) VALUES (?, ?, ?, ?, ?, ?, '[]')
  ON CONFLICT(datum, spiel, user_id) DO UPDATE SET plays = excluded.plays
`)

const PREFIX = `pm-test-${Date.now()}`
const IP = '198.51.100.61'
const createdUserIds = []
const createdSessionIds = []
const createdPaymentIds = []

const HEUTE = '2021-07-20'

function makeUser({ role, createdAt } = {}) {
  const id = `${PREFIX}-u-${createdUserIds.length}`
  const nowIso = new Date().toISOString()
  insertUserStmt.run({ id, name: 'PM Test', email: `${id}@example.test`, createdAt: createdAt || '2021-01-01T10:00:00.000Z', updatedAt: nowIso })
  const now = Date.now()
  upsertProfileStmt.run(id, role || 'user', now, now)
  createdUserIds.push(id)
  return id
}

function kauf(id, userId, betrag, ms, status = 'paid') {
  insertPaymentStmt.run(id, userId, betrag, status, ms)
  createdPaymentIds.push(id)
}

const headers = (token) => ({ cookie: `better-auth.session_token=${token}`, 'x-forwarded-for': IP })

describe('Auswertung › Kennzahlen', () => {
  let server
  let baseUrl
  let token
  let admin
  const hole = async (pfad) => {
    const res = await fetch(`${baseUrl}${pfad}`, { headers: headers(token) })
    return { res, text: await res.clone().text(), json: await res.json().catch(() => null) }
  }

  beforeAll(async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(cookieParser())
    app.use(express.json())
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    admin = makeUser({ role: 'admin' })
    token = randomUUID()
    const sessionId = randomUUID()
    createdSessionIds.push(sessionId)
    const nowIso = new Date().toISOString()
    insertSessionStmt.run(sessionId, admin, token, new Date(Date.now() + 864e5 * 800).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)
  })

  afterAll(async () => {
    db.prepare("DELETE FROM stats WHERE datum LIKE '2021-%'").run()
    for (const id of createdPaymentIds) db.prepare('DELETE FROM payments WHERE id = ?').run(id)
    for (const id of createdSessionIds) db.prepare('DELETE FROM session WHERE id = ?').run(id)
    for (const id of createdUserIds) {
      db.prepare('DELETE FROM custom_lemma_usage WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM stats WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user WHERE id = ?').run(id)
    }
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2021-07-20T12:00:00Z'))
    invalidateStatsCache()
  })

  afterEach(() => {
    vi.useRealTimers()
    invalidateStatsCache()
  })

  describe('Zahlungen', () => {
    const premium = []
    beforeAll(() => {
      const k1 = makeUser({ role: 'premium' })
      const k2 = makeUser({ role: 'premium' })
      const k3 = makeUser({ role: 'premium' })
      premium.push(k1, k2, k3)
      // 23:30 UTC im Sommer = 01:30 Uhr am Folgetag (Berlin) → zählt am 19.07., nicht am 18.
      kauf(`tr_${PREFIX}_a`, k1, '9.99', Date.UTC(2021, 6, 18, 23, 30))
      // 21:59 UTC = 23:59 Uhr (Berlin) → noch der 19.07.; 22:00 UTC = 00:00 Uhr → schon der 20.07.
      kauf('2000000000001', k2, '6.99', Date.UTC(2021, 6, 19, 21, 59))
      kauf(`tr_${PREFIX}_c`, k3, '14.99', Date.UTC(2021, 6, 19, 22, 0))
      // Käufe von Admin-Konten, erstattete/offene Zahlungen und Käufe vor dem Zeitraum zählen nicht
      kauf(`tr_${PREFIX}_admin`, admin, '14.99', Date.UTC(2021, 6, 19, 10, 0))
      kauf(`tr_${PREFIX}_offen`, k1, '9.99', Date.UTC(2021, 6, 19, 11, 0), 'refunded')
      kauf(`tr_${PREFIX}_alt`, k1, '9.99', Date.UTC(2021, 6, 13, 12, 0))
    })

    it('zählt je Berliner Tag, jeder Tag des Zeitraums steht da, heute ist "teil"', async () => {
      const { res, json: d } = await hole('/admin/payments/summary?days=7')
      expect(res.status).toBe(200)
      expect(d.zeitraum).toMatchObject({ days: 7, von: '2021-07-14', bis: HEUTE })
      expect(d.tage).toHaveLength(7)
      const tag = (iso) => d.tage.find((t) => t.datum === iso)
      expect(tag('2021-07-18')).toMatchObject({ kaeufe: 0, betrag: 0 })
      expect(tag('2021-07-19')).toMatchObject({ kaeufe: 2, betrag: 16.98, teil: false })
      expect(tag('2021-07-20')).toMatchObject({ kaeufe: 1, betrag: 14.99, teil: true })
      expect(d.kaeufe).toBe(3)
      expect(d.betrag).toBe(31.97)
    })

    it('trennt Website (tr_…) und App Store nach Preisstufe; Admin, Erstattetes und Altes fehlen', async () => {
      const { json: d } = await hole('/admin/payments/summary?days=7')
      expect(d.nachWeg).toEqual([
        { weg: 'mollie', stufen: [{ betrag: 9.99, kaeufe: 1 }, { betrag: 14.99, kaeufe: 1 }] },
        { weg: 'apple', stufen: [{ betrag: 6.99, kaeufe: 1 }] },
      ])
      // 30 Tage nehmen den Kauf vom 13.07. mit
      const lang = (await hole('/admin/payments/summary?days=30')).json
      expect(lang.kaeufe).toBe(4)
      expect(lang.tage).toHaveLength(30)
    })

    it('weist erstattete Käufe getrennt aus (ohne Admin-Käufe)', async () => {
      const { json: d } = await hole('/admin/payments/summary?days=7')
      expect(d.erstattet).toEqual({ kaeufe: 1, betrag: 9.99 })
    })

    it('enthält keine Konto-IDs oder E-Mail-Adressen und prüft den Zeitraum', async () => {
      const { text } = await hole('/admin/payments/summary?days=30')
      expect(text).not.toContain(PREFIX + '-u-')
      expect(text).not.toMatch(/@example|email|user_id/i)
      for (const days of ['0', '366']) expect((await hole(`/admin/payments/summary?days=${days}`)).res.status).toBe(400)
      expect((await fetch(`${baseUrl}/admin/payments/summary?days=30`)).status).toBe(401)
    })
  })

  describe('Eigenes Lemma', () => {
    beforeAll(() => {
      const gesamt = makeUser({ role: 'premium' })
      const basis = makeUser({ role: 'user' })
      const basis2 = makeUser({ role: 'user' })
      insertUsageStmt.run(gesamt, HEUTE, 3)
      insertUsageStmt.run(basis, HEUTE, 1)
      insertUsageStmt.run(basis, '2021-07-19', 1)
      insertUsageStmt.run(basis2, '2021-07-19', 4) // Bonus-Tag: mehr als ein Spiel
      insertUsageStmt.run(admin, HEUTE, 9) // Admin-Konto: zählt nirgends, auch nicht als Gesamtausgabe
    })

    it('zählt Spiele und Konten je Tag und getrennt nach Basiszugang und Gesamtausgabe, ohne Admin-Konten', async () => {
      const { res, json: d } = await hole('/admin/custom-lemma/summary?days=7')
      expect(res.status).toBe(200)
      expect(d.tage).toHaveLength(7)
      expect(d.tage.at(-1)).toMatchObject({ datum: HEUTE, spiele: 4, konten: 2, teil: true })
      expect(d.tage.find((t) => t.datum === '2021-07-19')).toMatchObject({ spiele: 5, konten: 2 })
      expect(d.heute).toEqual({ spiele: 4, konten: 2 })
      // Admin-Konto zählt nicht als Gesamtausgabe (isPremiumRole bleibt unberührt, nur die Auswertung nimmt es aus)
      expect(d.nachStufe.gesamtausgabe).toEqual({ konten: 1, spiele: 3 })
      expect(d.nachStufe.basiszugang).toEqual({ konten: 2, spiele: 6 })
      expect(d.konten).toBe(3)
      expect(d.spiele).toBe(9)
      expect(d.premiumRate).toBeUndefined()
    })

    it('enthält keine Konto-IDs', async () => {
      expect((await hole('/admin/custom-lemma/summary?days=30')).text).not.toContain(PREFIX + '-u-')
    })
  })

  describe('Aktive Konten und Wiederkehr', () => {
    const neuesKonto = (createdAt, role = 'user') => makeUser({ role, createdAt })
    const spiel = (userId, datum) => insertStatsStmt.run(datum, 'kollokationen', userId, 1, 7, 10)
    let ausDerZukunft
    let letzter // zuletzt angelegter Füller

    beforeAll(() => {
      // ── aktive Konten ──
      const heute = makeUser({ role: 'premium' })
      const gestern = makeUser()
      const vorLangem = makeUser()
      spiel(heute, HEUTE)
      spiel(gestern, '2021-07-19')
      spiel(vorLangem, '2021-07-01') // innerhalb von 30 Tagen, aber nicht von 7
      spiel(admin, HEUTE) // Admin-Konto: zählt nicht
      // Ein Spiel mit Datum nach heute (z. B. falsch gestellte Uhr am Gerät) ist kein aktives Konto von heute oder diesen Wochen
      ausDerZukunft = makeUser(); spiel(ausDerZukunft, '2021-07-23')
      insertStatsStmt.run(HEUTE, 'kollokationen', '', 6, 40, 60) // anonym: keine Kennung, fehlt bei "Konten"

      // ── Wiederkehr: Kohorte mit Anmeldetag 25.06.2021 (Berlin) ──
      // Anmeldung 24.06. um 22:30 UTC ist in Berlin schon der 25.06., 00:30 Uhr
      const spaetAbend = '2021-06-24T22:30:00.000Z'
      const nurTag6 = neuesKonto(spaetAbend) // spielt am 01.07. = 6. Tag nach der Anmeldung (Berlin) → zählt nicht
      const tag7 = neuesKonto(spaetAbend) // 02.07. = 7. Tag → zählt
      const tag13 = neuesKonto('2021-06-25T09:00:00.000Z') // 08.07. = 13. Tag → zählt
      const tag14 = neuesKonto('2021-06-25T09:00:00.000Z') // 09.07. = 14. Tag → zählt nicht mehr
      const nurErsteTage = neuesKonto('2021-06-25T09:00:00.000Z') // Tag 0 und 1 → zählt nicht
      spiel(nurTag6, '2021-07-01')
      spiel(tag7, '2021-07-02')
      spiel(tag13, '2021-07-08')
      spiel(tag14, '2021-07-09')
      spiel(nurErsteTage, '2021-06-25'); spiel(nurErsteTage, '2021-06-26')
      // Nicht in der Kohorte: Admin, zu früh (20.06.), zu spät (7 Tage her)
      const adminKohorte = neuesKonto('2021-06-25T09:00:00.000Z', 'admin'); spiel(adminKohorte, '2021-07-02')
      const zuFrueh = neuesKonto('2021-06-20T09:00:00.000Z'); spiel(zuFrueh, '2021-06-27')
      const zuSpaet = neuesKonto('2021-07-07T09:00:00.000Z'); spiel(zuSpaet, '2021-07-14')
      // Füller ohne Spiel, bis die Kohorte 19 Konten hat (5 oben + 14)
      for (let i = 0; i < 14; i += 1) letzter = neuesKonto('2021-06-30T09:00:00.000Z')
    })

    it('aktive Konten: heute, 7 und 30 Tage – nur angemeldete, ohne Admin-Konten', async () => {
      const { res, json: d } = await hole('/admin/stats/retention?days=30')
      expect(res.status).toBe(200)
      // heute: das Premium-Konto (nicht das Admin-Konto, nicht die anonyme Zeile)
      expect(d.aktiv.heute).toBe(1)
      // 7 Tage (ab 14.07.): dazu das Konto von gestern und das späte Konto der Kohorte (Spiel am 14.07.)
      expect(d.aktiv.tage7).toBe(3)
      // 30 Tage (ab 21.06.): alle zehn Konten mit Spiel; Admin-Konten (zwei) fehlen
      expect(d.aktiv.tage30).toBe(10)
      // Anteil der Spiele mit Konto: kommt aus der Spiele-Auswertung des gleichen Zeitraums
      expect(d.mitKontoAnteil).toBeGreaterThan(0)
      expect(d.mitKontoAnteil).toBeLessThan(1)
    })

    it('Wiederkehr: Spiel am 7. bis 13. Tag nach dem Anmeldetag (Berliner Tag), Kohorte 19 → kein Anteil', async () => {
      const { json: d } = await hole('/admin/stats/retention?days=30')
      // Kohorte: Anmeldetag zwischen Zeitraumbeginn (21.06.) und 14 Tage vor heute (06.07.)
      // Unter 20 Konten auch keine absolute Zahl der Wiederkehrer (null), nur die Kohortengröße
      expect(d.wiederkehr).toMatchObject({ von: '2021-06-21', bis: '2021-07-06', kohorte: 19, wieder: null, anteil: null, mindestens: 20 })
    })

    it('Wiederkehr: ab 20 Konten gibt es einen Anteil', async () => {
      neuesKonto('2021-06-30T09:00:00.000Z')
      const { json: d } = await hole('/admin/stats/retention?days=30')
      expect(d.wiederkehr).toMatchObject({ kohorte: 20, wieder: 2 })
      expect(d.wiederkehr.anteil).toBeCloseTo(0.1, 5)
      expect(letzter).toBeTruthy()
    })

    it('Wiederkehr: unter 14 Tagen Zeitraum gibt es keine Kohorte', async () => {
      const { json: d } = await hole('/admin/stats/retention?days=7')
      expect(d.wiederkehr).toMatchObject({ kohorte: 0, wieder: null, anteil: null })
    })

    it('Wiederkehr: bei 12 Monaten beginnt die Kohorte spätestens 187 Tage zurück (Tag 7 muss noch >= heute - 180 liegen)', async () => {
      const { json: d } = await hole('/admin/stats/retention?days=365')
      expect(d.wiederkehr.von).toBe('2021-01-14') // 20.07.2021 minus 187 Tage (180 + 7)
      expect(d.wiederkehr.bis).toBe('2021-07-06')
      // Probe der Rechnung: Registrierungstag 14.01. + 7 Tage = 21.01. = heute - 180 (letzter Tag mit Konto-Zeilen)
      const tag = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10)
      expect(tag(d.wiederkehr.von, 7)).toBe(tag(HEUTE, -180))
    })

    it('Mit Konto bei 12 Monaten rechnet nur die Tage mit Konto-Zeilen und nennt die Grenze', async () => {
      const kurz = (await hole('/admin/stats/retention?days=30')).json
      expect(kurz.mitKontoVerdichtetBis).toBeNull()
      const jahr = (await hole('/admin/stats/retention?days=365')).json
      expect(jahr.mitKontoVerdichtetBis).toBe('2021-01-20') // heute (20.07.) minus 180 Tage = 21.01. ist der erste Tag mit Konto-Zeilen
      expect(jahr.mitKontoAnteil).toBeGreaterThan(0)
      expect(jahr.mitKontoAnteil).toBeLessThanOrEqual(1)
    })

    it('?frisch=1 ist erlaubt (nur "1"), sonst 400', async () => {
      expect((await hole('/admin/stats/retention?days=30&frisch=1')).res.status).toBe(200)
      expect((await hole('/admin/stats/retention?days=30&frisch=x')).res.status).toBe(400)
    })

    it('enthält keine Konto-IDs', async () => {
      expect((await hole('/admin/stats/retention?days=30')).text).not.toContain(PREFIX + '-u-')
    })
  })
})
