/**
 * server/__tests__/course.routes.test.js
 *
 * Integration-Tests für die Kurs-API (/api/v1/course/*, AP3).
 *
 * Teststrategie (wie classroom.routes.test.js):
 *   - Echter SQLite (keine Mocks), Tabellen via Migration 0017
 *   - Dev-Header-Auth (x-dev-user-id / x-dev-user-role, ALLOW_DEV_AUTH=1)
 *   - Minimaler Express-App-Setup, Server auf Random-Port
 *
 * Abgedeckt: Premium-Gate (401/403), Stationen, Station-Detail (+Niveaus/
 * Materialarten, 404), Tasks nach station+level(+format), Material-Filter,
 * Solo-Fortschritt (GET/PUT, Upsert, 400/404), Param-Validierung.
 */

import express from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// „Eigenes Lemma" (AP9): die echte Eignungsprüfung braucht wortprofil.db.
// Im Test deterministisch mocken — „Gutwort" geeignet, alles andere nicht.
vi.mock('../customLemma.js', () => ({
  validateCustomLemma: vi.fn(async ({ q }) =>
    q === 'Gutwort'
      ? { mode: 'kollokationen', usable: true, pos: 'Substantiv', count: 25, reason: null }
      : { mode: 'kollokationen', usable: false, pos: 'Substantiv', count: 2, reason: 'Nicht genug Kollokationen.' }),
}))

import db from '../db.js'
import courseRouter from '../routes/course.js'

// ── Test-Infrastruktur ─────────────────────────────────────────

const PREFIX = 'tcourse' // Stations-IDs dieser Suite (Cleanup via LIKE)
const USER_PREMIUM = 'tcourse-premium-user'
const USER_BASIC   = 'tcourse-basic-user'

function headers(role, id) {
  const h = { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' }
  if (id)   h['x-dev-user-id']   = id
  if (role) h['x-dev-user-role'] = role
  return h
}
const premiumHeaders = headers('premium', USER_PREMIUM)

function ensureUser(id) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT OR IGNORE INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES (?, 'Test', ?, 0, ?, ?)
  `).run(id, `${id}@test.local`, now, now)
}

function insertStation(id, orderNo, title, opts = {}) {
  db.prepare(`
    INSERT OR REPLACE INTO course_stations (id, order_no, title, ipa, category, beamer_config_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, orderNo, title, opts.ipa ?? null, opts.category ?? null,
    JSON.stringify(opts.beamerConfig ?? {}), Date.now())
}

function insertTask(id, stationId, { format, level, source = 'static', kern = null, content = {}, template = null, rubric = {}, position = 0 }) {
  db.prepare(`
    INSERT OR REPLACE INTO course_tasks
      (id, station_id, format, level, source, kern, content_json, template_json, rubric_json, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, stationId, format, level, source, kern,
    source === 'static' ? JSON.stringify(content) : null,
    source === 'corpus-template' ? JSON.stringify(template ?? {}) : null,
    JSON.stringify(rubric), position, Date.now(),
  )
}

function insertMaterial(id, stationId, { kind, level = null, title = null, source = 'static', fileRef = '/x.pdf', template = null, position = 0 }) {
  db.prepare(`
    INSERT OR REPLACE INTO course_materials
      (id, station_id, kind, level, title, source, file_ref, template_json, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, stationId, kind, level, title, source,
    source === 'static' ? fileRef : null,
    source === 'corpus-template' ? JSON.stringify(template ?? {}) : null,
    position, Date.now(),
  )
}

function cleanup() {
  // Station-Delete kaskadiert auf tasks/materials/progress.
  db.prepare(`DELETE FROM course_stations WHERE id LIKE '${PREFIX}%'`).run()
  db.prepare('DELETE FROM course_progress WHERE user_id IN (?, ?)').run(USER_PREMIUM, USER_BASIC)
}

// ── Server-Setup ───────────────────────────────────────────────

describe('course routes (/api/v1/course)', () => {
  let server
  let baseUrl

  beforeAll(async () => {
    cleanup()
    ensureUser(USER_PREMIUM)
    ensureUser(USER_BASIC)

    // Station 1: Niveaus DaZ + SekII, Material AB(SekII) + Beamer(übergreifend)
    // order_no hoch gewählt (8001/8002), um nicht mit echten/geseedeten
    // Stationen zu kollidieren (course_stations.order_no ist UNIQUE).
    insertStation(`${PREFIX}-s1`, 8001, 'Wortpartner & Kollokationen', { ipa: 'kɔlokaˈtsi̯oːn', category: 'wortprofil' })
    insertTask(`${PREFIX}-s1-f1-daz`, `${PREFIX}-s1`, { format: 'F1', level: 'DaZ', kern: 'zuordnen', content: { prompt: 'DaZ-Item' }, rubric: { byLevel: { DaZ: { onCorrect: 'gut' } } }, position: 0 })
    insertTask(`${PREFIX}-s1-f3-sek2`, `${PREFIX}-s1`, { format: 'F3', level: 'SekII', source: 'corpus-template', kern: 'vergleich', template: { corpusQuery: { lemma: '{{lemma}}', relation: '~OBJA' } }, rubric: { preferred: ['v1'] }, position: 0 })
    insertTask(`${PREFIX}-s1-f5-sek2`, `${PREFIX}-s1`, { format: 'F5', level: 'SekII', content: { prompt: 'Datenblick' }, rubric: {}, position: 1 })
    insertMaterial(`${PREFIX}-s1-ab-sek2`, `${PREFIX}-s1`, { kind: 'arbeitsblatt', level: 'SekII', title: 'AB Sek II', source: 'corpus-template', template: { tasks: ['x'] } })
    insertMaterial(`${PREFIX}-s1-beamer`, `${PREFIX}-s1`, { kind: 'beamer', level: null, title: 'Beamer-Folien', fileRef: '/pdf/beamer-s1.pdf' })

    // Station 2: order_no 8002 (für Reihenfolge-Test)
    insertStation(`${PREFIX}-s2`, 8002, 'Wörter mit Funktion')

    const app = express()
    app.set('trust proxy', 1)
    app.use(express.json())
    app.use('/', courseRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    cleanup()
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  const get = (path, h = premiumHeaders) => fetch(`${baseUrl}${path}`, { headers: h })
  const put = (path, body, h = premiumHeaders) => fetch(`${baseUrl}${path}`, { method: 'PUT', headers: h, body: JSON.stringify(body) })
  const post = (path, body, h = premiumHeaders) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) })
  const del = (path, h = premiumHeaders) => fetch(`${baseUrl}${path}`, { method: 'DELETE', headers: h })

  // ── Zugangsmodell: Üben frei (Login), Material/Lemma Premium ───
  const basicHeaders = headers('user', USER_BASIC)

  it('401 ohne Auth (Stationen brauchen Login)', async () => {
    const res = await get('/api/v1/course/stations', headers())
    expect(res.status).toBe(401)
  })

  it('Üben ist frei: Basic (role=user) darf Stationen laden', async () => {
    const res = await get('/api/v1/course/stations', basicHeaders)
    expect(res.status).toBe(200)
  })

  it('Material bleibt Premium: 403 für Basic', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/materials`, basicHeaders)
    expect(res.status).toBe(403)
  })

  it('tasks?lemma=… bleibt Premium: 403 für Basic', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks?level=DaZ&resolve=interactive&lemma=Gutwort`, basicHeaders)
    expect(res.status).toBe(403)
  })

  it('kuratierte tasks sind frei: 200 für Basic', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks?level=DaZ&resolve=interactive`, basicHeaders)
    expect(res.status).toBe(200)
  })

  // ── Stationen ─────────────────────────────────────────────────
  it('listet Stationen nach order_no', async () => {
    const res = await get('/api/v1/course/stations')
    expect(res.status).toBe(200)
    const { stations } = await res.json()
    const mine = stations.filter(s => s.id.startsWith(PREFIX))
    expect(mine.map(s => s.id)).toEqual([`${PREFIX}-s1`, `${PREFIX}-s2`])
    expect(mine[0]).toMatchObject({ orderNo: 8001, title: 'Wortpartner & Kollokationen', ipa: 'kɔlokaˈtsi̯oːn' })
    expect(mine[0].beamerConfig).toEqual({})
  })

  // ── Station-Detail ────────────────────────────────────────────
  it('Station-Detail mit Niveaus + Materialarten', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1`)
    expect(res.status).toBe(200)
    const { station } = await res.json()
    expect(station.id).toBe(`${PREFIX}-s1`)
    expect(station.levels).toEqual(['DaZ', 'SekII'])          // DaZ→LK-Reihenfolge
    expect(station.materialKinds).toEqual(['beamer', 'arbeitsblatt']) // KIND_ORDER
  })

  it('404 für unbekannte Station', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-nope`)
    expect(res.status).toBe(404)
  })

  it('400 bei ungültiger Stations-ID', async () => {
    const res = await get('/api/v1/course/stations/BAD_ID!')
    expect(res.status).toBe(400)
  })

  // ── Tasks ─────────────────────────────────────────────────────
  it('Tasks nach Niveau gefiltert, JSON geparst, rubric dabei', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks?level=SekII`)
    expect(res.status).toBe(200)
    const { tasks, level } = await res.json()
    expect(level).toBe('SekII')
    expect(tasks).toHaveLength(2)
    expect(tasks.every(t => t.level === 'SekII')).toBe(true)
    const tmpl = tasks.find(t => t.source === 'corpus-template')
    expect(tmpl.template.corpusQuery.relation).toBe('~OBJA')
    expect(tmpl.content).toBeNull()
    expect(tmpl.rubric).toEqual({ preferred: ['v1'] })
  })

  it('Tasks ohne level → alle Stufen', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks`)
    const { tasks } = await res.json()
    expect(tasks).toHaveLength(3)
  })

  it('Tasks nach level + format', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks?level=SekII&format=F5`)
    const { tasks } = await res.json()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].format).toBe('F5')
  })

  it('400 bei ungültigem Niveau', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks?level=Uni`)
    expect(res.status).toBe(400)
  })

  it('resolve=interactive löst Items auf (kein content/template-Wrapper, selected erhalten)', async () => {
    // Isolierte Station mit korrekter rubric-Form { solution, feedback }.
    insertStation(`${PREFIX}-si`, 8003, 'Interaktiv-Test')
    insertTask(`${PREFIX}-si-f3`, `${PREFIX}-si`, {
      format: 'F3', level: 'SekI', source: 'corpus-template', kern: 'vergleich',
      template: {
        corpusQuery: { lemma: 'Test', pos: 'Substantiv', relation: '~OBJA' },
        bindings: { answer: [1], contrastPair: [1, 2] },
        payload: { frame: 'eine ___', variants: '@from:bindings.contrastPair', requireJustification: true },
        prompt: 'P', metasprache: ['Kollokation'], display: { metric: 'none' },
      },
      rubric: {
        solution: { preferred: '@from:bindings.answer' },
        feedback: { byLevel: { SekI: { onCorrect: 'typisch {{top.lemma}}', onWrong: '{{selected.lemma}} schwächer' } } },
      },
    })

    const res = await get(`/api/v1/course/stations/${PREFIX}-si/tasks?level=SekI&resolve=interactive`)
    expect(res.status).toBe(200)
    const { tasks } = await res.json()
    expect(tasks).toHaveLength(1)
    const t = tasks[0]
    // Aufgelöstes Engine-Item, nicht der DB-Wrapper.
    expect(t.content).toBeUndefined()
    expect(t.template).toBeUndefined()
    expect(t.rubric).toBeUndefined()
    expect(t.payload).toBeDefined()
    expect(t.feedback).toBeDefined()
    // {{selected.*}} bleibt für den Client erhalten, andere Platzhalter gefüllt.
    expect(t.feedback.onWrong).toMatch(/\{\{selected\.lemma\}\}/)
    expect(t.feedback.onCorrect).not.toMatch(/\{\{top/)
  })

  // ── Eigenes Lemma (AP9) ───────────────────────────────────────
  it('lemma/validate: geeignetes Wort → usable:true mit count/pos', async () => {
    const res = await get(`/api/v1/course/lemma/validate?q=Gutwort`)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ usable: true, pos: 'Substantiv', count: 25 })
  })

  it('lemma/validate: ungeeignetes Wort → usable:false mit reason', async () => {
    const res = await get(`/api/v1/course/lemma/validate?q=Nixwort`)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.usable).toBe(false)
    expect(json.reason).toBeTruthy()
  })

  it('lemma/validate ist Premium-gegated (403 für Basic)', async () => {
    const res = await get(`/api/v1/course/lemma/validate?q=Gutwort`, headers('user', USER_BASIC))
    expect(res.status).toBe(403)
  })

  it('tasks mit lemma: ungeeignet → 422 usable:false', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks?level=DaZ&resolve=interactive&lemma=Nixwort`)
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.usable).toBe(false)
  })

  it('tasks mit lemma: geeignet → 200, lemma im Response, Items aufgelöst', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/tasks?level=DaZ&resolve=interactive&lemma=Gutwort`)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.lemma).toBe('Gutwort')
    expect(json.tasks[0].content).toBeUndefined() // aufgelöstes Engine-Item
  })

  it('worksheet: Nicht-s1-Station → 404 (nur Station ① hat Content)', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/worksheet?lemma=Gutwort&level=SekII`)
    expect(res.status).toBe(404)
  })

  // ── Material ──────────────────────────────────────────────────
  it('Material nach Art gefiltert, template geparst', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/materials?kind=arbeitsblatt`)
    const { materials } = await res.json()
    expect(materials).toHaveLength(1)
    expect(materials[0].template).toEqual({ tasks: ['x'] })
    expect(materials[0].fileRef).toBeNull()
  })

  it('Material-Level-Filter schließt level-übergreifendes (NULL) mit ein', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/materials?level=SekII`)
    const { materials } = await res.json()
    const kinds = materials.map(m => m.kind).sort()
    expect(kinds).toEqual(['arbeitsblatt', 'beamer']) // beamer(level=NULL) bleibt drin
  })

  // ── Fortschritt ───────────────────────────────────────────────
  it('Fortschritt: leer → PUT → GET, dann Upsert', async () => {
    const empty = await (await get('/api/v1/course/progress')).json()
    expect(empty.progress.filter(p => p.stationId.startsWith(PREFIX))).toEqual([])

    const putRes = await put(`/api/v1/course/progress/${PREFIX}-s1`, { status: 'in-progress' })
    expect(putRes.status).toBe(200)
    expect((await putRes.json()).progress).toMatchObject({ stationId: `${PREFIX}-s1`, status: 'in-progress' })

    const after = await (await get('/api/v1/course/progress')).json()
    expect(after.progress.find(p => p.stationId === `${PREFIX}-s1`).status).toBe('in-progress')

    // Upsert: gleicher (user, station) → Status aktualisiert, kein Duplikat
    await put(`/api/v1/course/progress/${PREFIX}-s1`, { status: 'done' })
    const final = await (await get('/api/v1/course/progress')).json()
    const rows = final.progress.filter(p => p.stationId === `${PREFIX}-s1`)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('done')
  })

  it('400 bei ungültigem Status', async () => {
    const res = await put(`/api/v1/course/progress/${PREFIX}-s1`, { status: 'fertig' })
    expect(res.status).toBe(400)
  })

  it('404 bei Fortschritt auf unbekannte Station', async () => {
    const res = await put(`/api/v1/course/progress/${PREFIX}-unknown`, { status: 'done' })
    expect(res.status).toBe(404)
  })

  // ── Aufgaben-Ergebnisse (Persistenz) ──────────────────────────
  const T_F1_DAZ  = `${PREFIX}-s1-f1-daz`  // F1, DaZ
  const T_F3_SEK2 = `${PREFIX}-s1-f3-sek2` // F3, SekII
  const T_F5_SEK2 = `${PREFIX}-s1-f5-sek2` // F5, SekII

  it('results: leer am Anfang', async () => {
    const res = await get(`/api/v1/course/stations/${PREFIX}-s1/results`)
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toEqual([])
  })

  it('POST result richtig → correct true, attempts 1; GET spiegelt', async () => {
    const res = await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F1_DAZ}/result`, { level: 'DaZ', correct: true })
    expect(res.status).toBe(200)
    const { result } = await res.json()
    expect(result).toMatchObject({ taskId: T_F1_DAZ, level: 'DaZ', correct: true, attempts: 1 })

    const got = await (await get(`/api/v1/course/stations/${PREFIX}-s1/results`)).json()
    expect(got.results.find(r => r.taskId === T_F1_DAZ)).toMatchObject({ correct: true, attempts: 1 })
  })

  it('POST result mehrfach → Server idempotent, attempts zählen hoch (Sperre ist clientseitig)', async () => {
    const a = await (await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F3_SEK2}/result`, { level: 'SekII', correct: false })).json()
    expect(a.result).toMatchObject({ correct: false, attempts: 1 })
    const b = await (await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F3_SEK2}/result`, { level: 'SekII', correct: false })).json()
    expect(b.result).toMatchObject({ attempts: 2 })
    // Keine Sperre — auch weit jenseits früherer Limits geht es weiter.
    const d = await (await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F3_SEK2}/result`, { level: 'SekII', correct: false })).json()
    const e = await (await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F3_SEK2}/result`, { level: 'SekII', correct: false })).json()
    expect(d.result.attempts).toBe(3)
    expect(e.result.attempts).toBe(4)
  })

  it('POST result richtig nach falsch → correct wird true (bestes Resultat bleibt)', async () => {
    await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F5_SEK2}/result`, { level: 'SekII', correct: false })
    const r2 = await (await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F5_SEK2}/result`, { level: 'SekII', correct: true })).json()
    expect(r2.result).toMatchObject({ correct: true, attempts: 2 })
    // Erneuter (falscher) Post macht eine gelöste Aufgabe nicht wieder falsch.
    const r3 = await (await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F5_SEK2}/result`, { level: 'SekII', correct: false })).json()
    expect(r3.result.correct).toBe(true)
  })

  it('POST result Selbstkontrolle (correct null) → bearbeitet', async () => {
    // Eigene Station, damit der Null-Fall isoliert vom obigen F5-Test ist.
    insertStation(`${PREFIX}-sr`, 8004, 'Result-Null')
    insertTask(`${PREFIX}-sr-f5`, `${PREFIX}-sr`, { format: 'F5', level: 'DaZ', content: { prompt: 'x' }, rubric: {} })
    const r = await (await post(`/api/v1/course/stations/${PREFIX}-sr/tasks/${PREFIX}-sr-f5/result`, { level: 'DaZ', correct: null })).json()
    expect(r.result).toMatchObject({ correct: null, attempts: 1 })
  })

  it('progress.summary enthält gelöst/gesamt je (Station, Niveau)', async () => {
    const { summary } = await (await get('/api/v1/course/progress')).json()
    const daz = summary.find(s => s.stationId === `${PREFIX}-s1` && s.level === 'DaZ')
    expect(daz).toMatchObject({ total: 1, solved: 1 }) // F1-DaZ wurde richtig gelöst
    const sek2 = summary.find(s => s.stationId === `${PREFIX}-s1` && s.level === 'SekII')
    expect(sek2.total).toBe(2)
    expect(sek2.solved).toBe(1) // F5 gelöst, F3 nur falsch
  })

  it('404 für unbekannte Aufgabe', async () => {
    const res = await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${PREFIX}-s1-nope/result`, { level: 'DaZ', correct: true })
    expect(res.status).toBe(404)
  })

  it('404 wenn Stufe nicht zur Aufgabe passt', async () => {
    const res = await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F1_DAZ}/result`, { level: 'SekII', correct: true })
    expect(res.status).toBe(404)
  })

  it('400 bei fehlendem correct / falschem Typ', async () => {
    expect((await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F1_DAZ}/result`, { level: 'DaZ' })).status).toBe(400)
    expect((await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${T_F1_DAZ}/result`, { level: 'DaZ', correct: 'ja' })).status).toBe(400)
  })

  it('results sind frei (Login): 200 für Basic, 401 anon', async () => {
    expect((await get(`/api/v1/course/stations/${PREFIX}-s1/results`, headers('user', USER_BASIC))).status).toBe(200)
    expect((await get(`/api/v1/course/stations/${PREFIX}-s1/results`, headers())).status).toBe(401)
  })

  it('Basic darf ein Ergebnis speichern (Üben frei, kontobezogen)', async () => {
    ensureUser(USER_BASIC)
    const res = await post(`/api/v1/course/stations/${PREFIX}-s1/tasks/${PREFIX}-s1-f1-daz/result`,
      { level: 'DaZ', correct: true }, headers('user', USER_BASIC))
    expect(res.status).toBe(200)
    expect((await res.json()).result).toMatchObject({ correct: true, attempts: 1 })
  })

  it('DELETE progress?stationId → setzt nur eine Station zurück', async () => {
    const res = await del(`/api/v1/course/progress?stationId=${PREFIX}-s1`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.removed).toBeGreaterThan(0)
    const { results } = await (await get(`/api/v1/course/stations/${PREFIX}-s1/results`)).json()
    expect(results).toEqual([])
    // Andere Station (sr) bleibt erhalten.
    const sr = await (await get(`/api/v1/course/stations/${PREFIX}-sr/results`)).json()
    expect(sr.results).toHaveLength(1)
  })

  it('DELETE progress (ohne stationId) → setzt alles zurück', async () => {
    const res = await del('/api/v1/course/progress')
    expect(res.status).toBe(200)
    const sr = await (await get(`/api/v1/course/stations/${PREFIX}-sr/results`)).json()
    expect(sr.results).toEqual([])
  })

  it('DELETE progress?stationId unbekannt → 404', async () => {
    const res = await del(`/api/v1/course/progress?stationId=${PREFIX}-unknown`)
    expect(res.status).toBe(404)
  })
})
