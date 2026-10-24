// Auswertung › Klassenraum (Schritt 8): getKlassenraumAuswertung und GET /admin/classroom/stats.
// Die Auswertung zählt in der Telemetrie (bleibt 24 Monate) statt in der Tabelle classroom_session (30 Tage nach dem Ende gelöscht).
// Die Uhr ist per Fake-Date auf den 20.05.2021, 14:00 Uhr Berlin (Sommerzeit) gestellt. Weil die Test-Datenbank von allen
// Testdateien geteilt wird, räumt dieser Test Sitzungen und Telemetrie vorher ab (die Dateien laufen nacheinander).
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import adminRouter from '../routes/admin.js'
import db from '../db.js'
import { startClassroomAutoEnd } from '../jobs/classroomAutoEnd.js'
import {
  getKlassenraumAuswertung,
  trackSessionCreated,
  trackSessionStarted,
  trackSessionFinished,
  trackJoinSucceeded,
  trackParticipantReconnected,
  trackParticipantDropped,
  trackSubmissionReceived,
} from '../classroom/telemetry.js'

const PREFIX = `kr-ausw-${Date.now()}`
const IP = '198.51.100.81'
const createdUserIds = []
const createdSessionIds = []

const insertUserStmt = db.prepare(`
  INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
  VALUES (@id, @name, @email, 1, NULL, @createdAt, @updatedAt)
`)
const upsertProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)
const insertAuthSessionStmt = db.prepare(`
  INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)
const insertClassroomStmt = db.prepare(`
  INSERT INTO classroom_session (id, code, teacher_user_id, status, settings_json, created_at, started_at, last_activity_at)
  VALUES (?, ?, ?, ?, '{}', ?, ?, ?)
`)

let zaehler = 0
function makeUser(role = 'user') {
  const id = `${PREFIX}-u-${createdUserIds.length}`
  const nowIso = new Date().toISOString()
  insertUserStmt.run({ id, name: 'KR Test', email: `${id}@example.test`, createdAt: nowIso, updatedAt: nowIso })
  const now = Date.now()
  upsertProfileStmt.run(id, role, now, now)
  createdUserIds.push(id)
  return id
}

function sitzungsZeile(teacherId, { status = 'finished', createdAt = Date.now() } = {}) {
  zaehler += 1
  const id = `${PREFIX}-s-${zaehler}`
  insertClassroomStmt.run(id, `kr${zaehler}${Date.now().toString(36).slice(-6)}`, teacherId, status, createdAt, createdAt, createdAt)
  createdSessionIds.push(id)
  return id
}

const sid = () => `${PREFIX}-t-${++zaehler}`
const um = (iso) => vi.setSystemTime(new Date(iso))
const tag = (r, datum) => r.sitzungen.tage.find((t) => t.datum === datum)

function wischen() {
  db.prepare('DELETE FROM classroom_session').run()
  db.prepare('DELETE FROM classroom_telemetry').run()
}

describe('Auswertung › Klassenraum (Telemetrie)', () => {
  beforeAll(wischen)

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    um('2021-05-20T12:00:00Z')
  })

  afterEach(() => {
    vi.useRealTimers()
    wischen()
  })

  afterAll(() => {
    for (const id of createdUserIds) {
      db.prepare('DELETE FROM user_profiles WHERE user_id = ?').run(id)
      db.prepare('DELETE FROM user WHERE id = ?').run(id)
    }
  })

  it('zählt je Berliner Tag (auch zwischen 0 und 2 Uhr), jeder Tag des Zeitraums steht da, nur heute ist "teil"', () => {
    const lehrkraft = makeUser()
    // Sommerzeit: 22:30 UTC = 00:30 Uhr am nächsten Tag; 21:59 UTC = 23:59 Uhr desselben Tags
    um('2021-05-19T22:30:00Z'); trackSessionCreated(sid(), lehrkraft) // → 20.05.
    um('2021-05-19T21:59:00Z'); trackSessionCreated(sid(), lehrkraft) // → 19.05.
    um('2021-05-19T21:00:00Z'); trackSessionCreated(sid(), lehrkraft) // → 19.05.
    um('2021-05-20T12:00:00Z')

    const r = getKlassenraumAuswertung({ days: 7 })
    expect(r.zeitraum).toMatchObject({ days: 7, von: '2021-05-14', bis: '2021-05-20' })
    expect(r.sitzungen.tage).toHaveLength(7)
    expect(tag(r, '2021-05-20')).toEqual({ datum: '2021-05-20', sitzungen: 1, teil: true })
    expect(tag(r, '2021-05-19')).toMatchObject({ sitzungen: 2, teil: false })
    expect(tag(r, '2021-05-18')).toMatchObject({ sitzungen: 0 })
    expect(r.sitzungen.gesamt).toBe(3)
    expect(r.sitzungen.tage.filter((t) => t.teil)).toHaveLength(1)
  })

  it('Winterzeit: 23:30 UTC ist schon der nächste Berliner Tag', () => {
    const lehrkraft = makeUser()
    um('2021-01-14T23:30:00Z'); trackSessionCreated(sid(), lehrkraft)
    const r = getKlassenraumAuswertung({ days: 3 })
    expect(r.zeitraum.bis).toBe('2021-01-15')
    expect(tag(r, '2021-01-15')).toMatchObject({ sitzungen: 1, teil: true })
    expect(tag(r, '2021-01-14')).toMatchObject({ sitzungen: 0 })
  })

  it('Sitzungen zählen weiter, wenn die Zeile in classroom_session längst gelöscht ist (90 Tage)', () => {
    const lehrkraft = makeUser()
    um('2021-03-01T10:00:00Z'); trackSessionCreated(sid(), lehrkraft)
    um('2021-05-20T12:00:00Z')
    // keine Zeile in classroom_session: nur die Telemetrie kennt die Sitzung
    expect(db.prepare('SELECT COUNT(*) AS n FROM classroom_session').get().n).toBe(0)
    const r = getKlassenraumAuswertung({ days: 90 })
    expect(r.sitzungen.gesamt).toBe(1)
    expect(tag(r, '2021-03-01')).toMatchObject({ sitzungen: 1 })
    expect(getKlassenraumAuswertung({ days: 30 }).sitzungen.gesamt).toBe(0)
  })

  it('Wie Sitzungen enden: Auto-Ende wird gezählt, Unbekanntes gilt als "Lehrkraft beendet", offen kommt aus der Tabelle', () => {
    const lehrkraft = makeUser()
    const ids = [sid(), sid(), sid(), sid()]
    ids.forEach((id) => trackSessionCreated(id, lehrkraft))
    trackSessionFinished(ids[0], lehrkraft, { reason: 'completed' })
    trackSessionFinished(ids[1], lehrkraft, { reason: 'manual' })
    trackSessionFinished(ids[2], lehrkraft, { reason: 'auto', durationMs: 5_400_000 })
    trackSessionFinished(ids[3], lehrkraft, { reason: 'irgendwas anderes' })
    trackSessionFinished(ids[3], lehrkraft, { reason: 'auto' }) // zweites Ende derselben Sitzung zählt nicht doppelt
    sitzungsZeile(lehrkraft, { status: 'lobby', createdAt: Date.now() - 3600_000 })
    sitzungsZeile(lehrkraft, { status: 'running', createdAt: Date.now() - 3600_000 })
    sitzungsZeile(lehrkraft, { status: 'finished', createdAt: Date.now() - 3600_000 })

    const { sitzungen } = getKlassenraumAuswertung({ days: 7 })
    expect(sitzungen.ende).toEqual({ alleGespielt: 1, lehrkraft: 2, automatisch: 1, offen: 2 })
  })

  it('Wie Sitzungen enden: nur Sitzungen, die im Zeitraum angelegt wurden (dieselbe Menge wie "Sitzungen")', () => {
    const lehrkraft = makeUser()
    const frueher = sid(); const imZeitraum = sid()
    um('2021-04-01T10:00:00Z'); trackSessionCreated(frueher, lehrkraft) // vor dem 7-Tage-Zeitraum angelegt …
    um('2021-05-19T10:00:00Z'); trackSessionCreated(imZeitraum, lehrkraft)
    um('2021-05-20T10:00:00Z') // … aber im Zeitraum beendet
    trackSessionFinished(frueher, lehrkraft, { reason: 'completed' })
    trackSessionFinished(imZeitraum, lehrkraft, { reason: 'auto' })
    trackSessionFinished(sid(), lehrkraft, { reason: 'manual' }) // Ende ohne bekannte Anlage (z. B. Telemetrie lückenhaft): gehört zu keiner Sitzung des Zeitraums
    um('2021-05-20T12:00:00Z')

    const { sitzungen } = getKlassenraumAuswertung({ days: 7 })
    expect(sitzungen.gesamt).toBe(1)
    expect(sitzungen.ende).toEqual({ alleGespielt: 0, lehrkraft: 0, automatisch: 1, offen: 0 })
    const summeEnden = Object.values(sitzungen.ende).reduce((a, b) => a + b, 0)
    expect(summeEnden).toBeLessThanOrEqual(sitzungen.gesamt)
    // Im längeren Zeitraum ist die früher angelegte Sitzung dabei
    const lang = getKlassenraumAuswertung({ days: 90 }).sitzungen
    expect(lang.gesamt).toBe(2)
    expect(lang.ende).toEqual({ alleGespielt: 1, lehrkraft: 0, automatisch: 1, offen: 0 })
  })

  it('Sitzungen von Admin-Konten zählen nirgends (Markierung am Ereignis, auch ohne Kennung)', () => {
    const admin = makeUser('admin')
    const lehrkraft = makeUser('premium')
    const eigene = sid(); const fremde = sid()
    trackSessionCreated(eigene, lehrkraft)
    trackSessionCreated(fremde, admin)
    for (const id of [eigene, fremde]) {
      trackSessionStarted(id, id === fremde ? admin : lehrkraft, 10)
      trackJoinSucceeded(id, 'p1')
      trackSubmissionReceived(id, { mode: 'kollokationen', correct: true, assignmentId: `${id}-a` })
      trackSessionFinished(id, lehrkraft, { reason: 'completed' })
    }
    // Nach 30 Tagen wird die Lehrkraft-Kennung gelöscht; die Markierung bleibt
    db.prepare('UPDATE classroom_telemetry SET teacher_id = NULL').run()

    const r = getKlassenraumAuswertung({ days: 7 })
    expect(r.sitzungen.gesamt).toBe(1)
    expect(r.sitzungen.ende.alleGespielt).toBe(1)
    expect(r.teilnehmer).toMatchObject({ schnitt: 10, beitritte: 1 })
    expect(r.antworten).toEqual({ gesamt: 1, richtig: 1 })
  })

  it('Sitzungen eines Admin-Kontos, die nur als Tabellenzeile bekannt sind, zählen bei den Lehrkräften nicht', () => {
    const admin = makeUser('admin')
    const lehrkraft = makeUser()
    sitzungsZeile(admin, { createdAt: Date.now() - 3600_000 })
    sitzungsZeile(lehrkraft, { createdAt: Date.now() - 3600_000 })
    expect(getKlassenraumAuswertung({ days: 7 }).lehrkraefte).toEqual({ verfuegbar: true, anzahl: 1 })
  })

  it('Teilnehmer und Verbindungen: Ø je gestartete Sitzung (auch ohne Teilnehmer), Wiederverbindungen, Verluste', () => {
    const lehrkraft = makeUser()
    const a = sid(); const b = sid(); const c = sid()
    ;[a, b, c].forEach((id) => trackSessionCreated(id, lehrkraft))
    trackSessionStarted(a, lehrkraft, 20)
    trackSessionStarted(b, lehrkraft, 0) // gestartet ohne Beitritt: gehört in den Nenner
    trackSessionStarted(b, lehrkraft, 99) // zweite Meldung derselben Sitzung zählt nicht
    trackSessionStarted(c, lehrkraft, 10)
    for (let i = 0; i < 4; i += 1) trackJoinSucceeded(a, `p${i}`)
    trackParticipantReconnected(a, 'p0')
    trackParticipantDropped(a, 'p1')
    trackParticipantDropped(a, 'p2')

    const { teilnehmer } = getKlassenraumAuswertung({ days: 7 })
    expect(teilnehmer).toEqual({ schnitt: 10, beitritte: 4, wiederverbunden: 1, verloren: 2 })
  })

  it('ohne gestartete Sitzung gibt es kein Ø (null statt 0)', () => {
    expect(getKlassenraumAuswertung({ days: 7 }).teilnehmer.schnitt).toBeNull()
  })

  it('Antworten je Modus: Aufgaben mit Antwort, Antworten, richtig; Reihenfolge wie im Admin', () => {
    const lehrkraft = makeUser()
    const s1 = sid(); const s2 = sid()
    trackSessionCreated(s1, lehrkraft); trackSessionCreated(s2, lehrkraft)
    trackSubmissionReceived(s1, { mode: 'zeitenwende', correct: true, assignmentId: 'z1' })
    trackSubmissionReceived(s1, { mode: 'kollokationen', correct: true, assignmentId: 'k1' })
    trackSubmissionReceived(s1, { mode: 'kollokationen', correct: false, assignmentId: 'k1' })
    trackSubmissionReceived(s1, { mode: 'kollokationen', correct: true, assignmentId: 'k2' })
    trackSubmissionReceived(s2, { mode: 'kollokationen', correct: true, assignmentId: 'k1' }) // gleiche Kennung, andere Sitzung
    trackSubmissionReceived(s2, { mode: 'lueckenfueller', correct: false }) // älteres Ereignis ohne Aufgabe: eine je Sitzung und Modus
    trackSubmissionReceived(s2, { mode: 'lueckenfueller', correct: false })

    const r = getKlassenraumAuswertung({ days: 7 })
    expect(r.antworten).toEqual({ gesamt: 7, richtig: 4 })
    expect(r.nachModus).toEqual([
      { modus: 'kollokationen', aufgaben: 3, antworten: 4, richtig: 3 },
      { modus: 'zeitenwende', aufgaben: 1, antworten: 1, richtig: 1 },
      { modus: 'lueckenfueller', aufgaben: 1, antworten: 2, richtig: 0 },
    ])
  })

  describe('Lehrkräfte', () => {
    const lehrkraefteMit = (anzahlen) => anzahlen.forEach((n) => {
      const t = makeUser('premium')
      for (let i = 0; i < n; i += 1) sitzungsZeile(t, { createdAt: Date.now() - 3600_000 })
    })

    it('nur bis 30 Tage: bei 31 Tagen und mehr gibt es keine Zahlen zu Lehrkräften', () => {
      lehrkraefteMit([2, 3])
      expect(getKlassenraumAuswertung({ days: 30 }).lehrkraefte).toMatchObject({ verfuegbar: true, anzahl: 2 })
      for (const days of [31, 90, 365]) expect(getKlassenraumAuswertung({ days }).lehrkraefte).toEqual({ verfuegbar: false })
    })

    it('4 Lehrkräfte: nur die Anzahl, keine Verteilung (eine einzelne Person wäre ablesbar)', () => {
      lehrkraefteMit([1, 1, 25, 7])
      const lk = getKlassenraumAuswertung({ days: 30 }).lehrkraefte
      expect(lk).toEqual({ verfuegbar: true, anzahl: 4 })
      expect(lk.gruppen).toBeUndefined()
    })

    it('ab 5 Lehrkräften: Verteilung nach 1 bis 5, 6 bis 20 und mehr als 20 Sitzungen', () => {
      lehrkraefteMit([1, 5, 6, 20, 21])
      expect(getKlassenraumAuswertung({ days: 30 }).lehrkraefte).toEqual({
        verfuegbar: true,
        anzahl: 5,
        gruppen: { '1-5': 2, '6-20': 2, '21+': 1 },
      })
    })
  })

  it('leer: alle Zähler 0, Tage vollständig, keine Fehler', () => {
    const r = getKlassenraumAuswertung({ days: 30 })
    expect(r.sitzungen).toMatchObject({ gesamt: 0, ende: { alleGespielt: 0, lehrkraft: 0, automatisch: 0, offen: 0 } })
    expect(r.sitzungen.tage).toHaveLength(30)
    expect(r.nachModus).toEqual([])
    expect(r.antworten).toEqual({ gesamt: 0, richtig: 0 })
    expect(r.lehrkraefte).toEqual({ verfuegbar: true, anzahl: 0 })
  })

  it('Auto-Ende-Job schreibt das Ereignis mit reason "auto"; die Auswertung zählt es', () => {
    const lehrkraft = makeUser('premium')
    const id = sitzungsZeile(lehrkraft, { status: 'running', createdAt: Date.now() - 4 * 3600_000 })
    db.prepare('UPDATE classroom_session SET started_at = ?, last_activity_at = ? WHERE id = ?').run(Date.now() - 4 * 3600_000, Date.now() - 3 * 3600_000, id)
    trackSessionCreated(id, lehrkraft)

    const timer = startClassroomAutoEnd({ intervalMs: 3_600_000 })
    clearInterval(timer)

    const ereignis = db.prepare("SELECT teacher_id, payload_json FROM classroom_telemetry WHERE event = 'classroom_session_finished' AND session_id = ?").get(id)
    expect(JSON.parse(ereignis.payload_json).reason).toBe('auto')
    expect(ereignis.teacher_id).toBe(lehrkraft)
    expect(getKlassenraumAuswertung({ days: 7 }).sitzungen.ende.automatisch).toBe(1)
  })

  describe('Route /admin/classroom/stats', () => {
    let server
    let baseUrl
    let token

    beforeAll(async () => {
      const app = express()
      app.set('trust proxy', 1)
      app.use(cookieParser())
      app.use(express.json())
      app.use('/', adminRouter)
      await new Promise((resolve) => { server = app.listen(0, resolve) })
      baseUrl = `http://127.0.0.1:${server.address().port}`
      const admin = makeUser('admin')
      token = randomUUID()
      const nowIso = new Date().toISOString()
      const sessionId = randomUUID()
      insertAuthSessionStmt.run(sessionId, admin, token, new Date(Date.now() + 864e5 * 800).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)
      createdSessionIds.push(`auth:${sessionId}`)
    })

    afterAll(async () => {
      for (const id of createdSessionIds.filter((x) => x.startsWith('auth:'))) db.prepare('DELETE FROM session WHERE id = ?').run(id.slice(5))
      if (server) await new Promise((resolve) => server.close(resolve))
    })

    it('liefert nur Summen: keine Sitzungs-, Lehrkraft- oder Teilnehmer-Kennungen', async () => {
      const lehrkraft = makeUser('premium')
      const id = sid()
      trackSessionCreated(id, lehrkraft)
      trackSessionStarted(id, lehrkraft, 12)
      trackJoinSucceeded(id, 'teilnehmer-geheim')
      trackSubmissionReceived(id, { mode: 'wortzwilling', correct: true, assignmentId: 'aufgabe-geheim' })
      sitzungsZeile(lehrkraft)
      const res = await fetch(`${baseUrl}/admin/classroom/stats?days=30`, { headers: { cookie: `better-auth.session_token=${token}`, 'x-forwarded-for': IP } })
      const text = await res.text()
      expect(res.status).toBe(200)
      const d = JSON.parse(text)
      expect(d.sitzungen.gesamt).toBe(1)
      expect(d.lehrkraefte).toMatchObject({ verfuegbar: true, anzahl: 1 })
      for (const geheim of [PREFIX, 'teilnehmer-geheim', 'aufgabe-geheim', 'example.test']) expect(text).not.toContain(geheim)
    })

    it('prüft den Zeitraum, verlangt eine Anmeldung, und /admin/classroom/teachers gibt es nicht mehr', async () => {
      const kopf = { headers: { cookie: `better-auth.session_token=${token}`, 'x-forwarded-for': IP } }
      expect((await fetch(`${baseUrl}/admin/classroom/stats?days=0`, kopf)).status).toBe(400)
      expect((await fetch(`${baseUrl}/admin/classroom/stats?days=366`, kopf)).status).toBe(400)
      expect((await fetch(`${baseUrl}/admin/classroom/stats?days=30`)).status).toBe(401)
      expect((await fetch(`${baseUrl}/admin/classroom/teachers?days=30`, kopf)).status).toBe(404)
    })
  })
})
