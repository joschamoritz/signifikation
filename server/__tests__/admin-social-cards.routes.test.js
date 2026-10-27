/**
 * Routen der Social Cards (Admin › Werkzeuge › Social Cards): Entwürfe auflisten, Freigeben/Verwerfen,
 * Beitragstext nur bei offenen Entwürfen, 300-Zeichen-Grenze beim Freigeben, Auth- und CSRF-Pflicht,
 * kleine Bildfassung und eigenes Bild-Limit, Zeichenmodul, Weiterleitung der alten Adresse,
 * Änderungsprotokoll beim Neu erstellen.
 */
import express from 'express'
import cookieParser from 'cookie-parser'
import { randomUUID } from 'crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import adminRouter from '../routes/admin.js'
import { csrfProtect } from '../middleware/auth.js'
import db from '../db.js'
import { speichereEntwuerfe, ladeEntwuerfe, setzeBild, merkePost } from '../socialCards/store.js'
import { BILD_DIR, kleinDatei } from '../jobs/socialCardDrafts.js'
import { createAdminSocialCardsRouter } from '../routes/admin-social-cards.js'
import { validate, adminSocialCardsTagesdataSchema, adminSocialCardsBelegeSchema, adminSocialCardsEntwuerfeQuerySchema, adminSocialCardsEntwurfParamsSchema, adminSocialCardsEntwurfPatchSchema, adminSocialCardsEigenSchema } from '../middleware/validate.js'
import { zeichenZahl, BLUESKY_MAX_ZEICHEN } from '../../shared/socialCards.js'

const PREFIX = `sc-test-${Date.now()}`
const DATUM = '2099-04-06'

function adminHeaders(token) {
  return { 'content-type': 'application/json', 'x-requested-with': 'signifikation-app', cookie: `better-auth.session_token=${token}` }
}

describe('admin social-cards Postfach', () => {
  let server, baseUrl, token, id

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/admin', csrfProtect)
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`

    const adminId = `${PREFIX}-admin`
    const nowIso = new Date().toISOString()
    db.prepare(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, 'SC Test', ?, 1, NULL, ?, ?)`)
      .run(adminId, `${adminId}@example.test`, nowIso, nowIso)
    db.prepare(`INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, 'admin', ?, ?)`).run(adminId, Date.now(), Date.now())
    token = randomUUID()
    db.prepare(`INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)

    speichereEntwuerfe([{ datum: DATUM, slot: 'T', spec: { format: 'T', data: { lemmata: [] } }, caption: 'Teaser', hashtags: '#signifikation' }])
    id = ladeEntwuerfe(DATUM, DATUM)[0].id
  })

  afterAll(async () => {
    db.prepare('DELETE FROM social_card_entwurf WHERE datum = ?').run(DATUM)
    db.prepare('DELETE FROM session WHERE userId LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user_profiles WHERE user_id LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user WHERE id LIKE ?').run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('listet Entwürfe im Fenster mit Bild-URLs (voll und klein), ohne Dateipfad', async () => {
    const res = await fetch(`${baseUrl}/admin/social-cards/entwuerfe?von=${DATUM}&bis=${DATUM}`, { headers: adminHeaders(token) })
    expect(res.status).toBe(200)
    const { entwuerfe, ...umfang } = await res.json()
    expect(entwuerfe).toHaveLength(1)
    expect(entwuerfe[0]).toMatchObject({ id, slot: 'T', status: 'offen', caption: 'Teaser' })
    expect(entwuerfe[0].bildUrl).toMatch(new RegExp(`^/admin/social-cards/entwuerfe/${id}/bild\\?v=`))
    expect(entwuerfe[0].bildKleinUrl).toMatch(new RegExp(`^/admin/social-cards/entwuerfe/${id}/bild\\?groesse=klein&v=`))
    expect(entwuerfe[0]).not.toHaveProperty('bild')
    // Zustand des automatischen Anlegens für die Seite (ohne Schalter: an)
    expect(umfang).toMatchObject({ von: DATUM, bis: DATUM, automatisch: process.env.SOCIAL_CARDS_ENTWUERFE !== 'off', horizont: 7, aufbewahrung: 56 })
  })

  it('verlangt Anmeldung', async () => {
    const res = await fetch(`${baseUrl}/admin/social-cards/entwuerfe`)
    expect(res.status).toBe(401)
  })

  it('verlangt den CSRF-Header bei Änderungen', async () => {
    const { 'x-requested-with': _weg, ...ohneCsrf } = adminHeaders(token)
    const res = await fetch(`${baseUrl}/admin/social-cards/entwuerfe/${id}`, { method: 'POST', headers: ohneCsrf, body: JSON.stringify({ status: 'freigegeben' }) })
    expect(res.status).toBe(403)
  })

  it('speichert Caption, gibt frei und sperrt danach die Caption', async () => {
    const post = (body) => fetch(`${baseUrl}/admin/social-cards/entwuerfe/${id}`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })

    let res = await post({ caption: 'Neue Caption', status: 'freigegeben' })
    expect(res.status).toBe(200)
    expect((await res.json()).entwurf).toMatchObject({ caption: 'Neue Caption', status: 'freigegeben' })

    res = await post({ caption: 'Zu spät' })
    expect(res.status).toBe(409)

    res = await post({ status: 'offen' })
    expect((await res.json()).entwurf).toMatchObject({ status: 'offen', entschiedenAm: null })
  })

  it('lehnt leere Änderungen und unbekannte Status ab, 404 für fremde IDs', async () => {
    const post = (pfad, body) => fetch(`${baseUrl}${pfad}`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })
    expect((await post(`/admin/social-cards/entwuerfe/${id}`, {})).status).toBe(400)
    expect((await post(`/admin/social-cards/entwuerfe/${id}`, { status: 'veroeffentlicht' })).status).toBe(400)
    expect((await post('/admin/social-cards/entwuerfe/999999', { status: 'verworfen' })).status).toBe(404)
  })

  it('zeigt veröffentlichte Entwürfe mit Bluesky-Link und sperrt danach jede Änderung', async () => {
    speichereEntwuerfe([{ datum: DATUM, slot: 'X', spec: { format: 'X', data: {} }, caption: 'Zitat', hashtags: '' }])
    const x = ladeEntwuerfe(DATUM, DATUM).find((e) => e.slot === 'X')
    merkePost({ entwurfId: x.id, uri: 'at://did:plc:test/app.bsky.feed.post/3abc', cid: 'c1' })
    try {
      const liste = await (await fetch(`${baseUrl}/admin/social-cards/entwuerfe?von=${DATUM}&bis=${DATUM}`, { headers: adminHeaders(token) })).json()
      expect(liste.entwuerfe.find((e) => e.id === x.id).gepostet.url).toBe('https://bsky.app/profile/did:plc:test/post/3abc')
      expect(liste).toHaveProperty('posten')
      const post = (body) => fetch(`${baseUrl}/admin/social-cards/entwuerfe/${x.id}`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })
      expect((await post({ status: 'offen' })).status).toBe(409)
      expect((await post({ status: 'verworfen' })).status).toBe(409)
      const neu = await fetch(`${baseUrl}/admin/social-cards/entwuerfe/${x.id}/neu`, { method: 'POST', headers: adminHeaders(token), body: '{}' })
      expect(neu.status).toBe(409)
    } finally {
      db.prepare('DELETE FROM social_post WHERE entwurf_id = ?').run(x.id)
    }
  })

  it('Textbeiträge haben keine Bild-URL, die Bild-Route antwortet 404', async () => {
    speichereEntwuerfe([{ datum: DATUM, slot: 'TB', spec: { format: 'text', data: {} }, caption: '„Satz mit ______.“', hashtags: '' }])
    const res = await fetch(`${baseUrl}/admin/social-cards/entwuerfe?von=${DATUM}&bis=${DATUM}`, { headers: adminHeaders(token) })
    const text = (await res.json()).entwuerfe.find((e) => e.slot === 'TB')
    expect(text.bildUrl).toBeNull()
    expect(text.bildKleinUrl).toBeNull()
    const bild = await fetch(`${baseUrl}/admin/social-cards/entwuerfe/${text.id}/bild`, { headers: adminHeaders(token) })
    expect(bild.status).toBe(404)
  })

  it('liefert das Zeichenmodul mit Anmeldung, bei jedem Aufruf per ETag geprüft', async () => {
    const res = await fetch(`${baseUrl}/admin/social-cards/karten.js`, { headers: adminHeaders(token) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/javascript/)
    expect(res.headers.get('cache-control')).toBe('private, no-cache')
    expect(await res.text()).toContain('export function drawCard')
    // Ohne Sitzung (abgelaufen) kein Modul: Die Seite meldet das, statt still ohne Vorschau zu bleiben
    expect((await fetch(`${baseUrl}/admin/social-cards/karten.js`)).status).toBe(401)
  })

  it('leitet die alte Adresse in den Admin um – mit und ohne Anmeldung', async () => {
    for (const headers of [{}, adminHeaders(token)]) {
      const res = await fetch(`${baseUrl}/admin/social-cards`, { headers, redirect: 'manual' })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe('/admin#werkzeuge/social-cards')
      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/)
    }
  })
})

describe('admin social-cards: Beitragstext und Freigeben', () => {
  let server, baseUrl, token
  const DATUM2 = '2099-04-07'
  const post = (eid, body) => fetch(`${baseUrl}/admin/social-cards/entwuerfe/${eid}`, { method: 'POST', headers: adminHeaders(token), body: JSON.stringify(body) })
  const anlegen = (slot, caption, hashtags) => {
    speichereEntwuerfe([{ datum: DATUM2, slot, spec: { format: 'T', data: { lemmata: [] } }, caption, hashtags }])
    return ladeEntwuerfe(DATUM2, DATUM2).find((e) => e.slot === slot).id
  }

  beforeAll(async () => {
    const app = express()
    app.use(cookieParser())
    app.use(express.json())
    app.use('/admin', csrfProtect)
    app.use('/', adminRouter)
    await new Promise((resolve) => { server = app.listen(0, resolve) })
    baseUrl = `http://127.0.0.1:${server.address().port}`
    const adminId = `${PREFIX}-admin2`
    const nowIso = new Date().toISOString()
    db.prepare(`INSERT INTO user (id, name, email, emailVerified, image, createdAt, updatedAt) VALUES (?, 'SC Test 2', ?, 1, NULL, ?, ?)`)
      .run(adminId, `${adminId}@example.test`, nowIso, nowIso)
    db.prepare(`INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES (?, 'admin', ?, ?)`).run(adminId, Date.now(), Date.now())
    token = randomUUID()
    db.prepare(`INSERT INTO session (id, userId, token, expiresAt, ipAddress, userAgent, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), adminId, token, new Date(Date.now() + 864e5).toISOString(), '127.0.0.1', 'test', nowIso, nowIso)
  })

  afterAll(async () => {
    db.prepare('DELETE FROM social_card_entwurf WHERE datum = ?').run(DATUM2)
    db.prepare('DELETE FROM session WHERE userId LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user_profiles WHERE user_id LIKE ?').run(`${PREFIX}%`)
    db.prepare('DELETE FROM user WHERE id LIKE ?').run(`${PREFIX}%`)
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  it('gibt 300 Zeichen mit Hashtags frei, 301 nicht (gezählt wird, was gepostet würde)', async () => {
    const tags = '#Linguistik #DeutscheSprache'
    const rest = BLUESKY_MAX_ZEICHEN - zeichenZahl(`\n\n${tags}`)
    // Umlaute zählen als ein Zeichen (Graphem), nicht als zwei Bytes
    const genau = anlegen('A', 'ä'.repeat(rest), tags)
    expect(zeichenZahl(`${'ä'.repeat(rest)}\n\n${tags}`)).toBe(300)
    const zuLang = anlegen('B', 'ä'.repeat(rest + 1), tags)

    let res = await post(zuLang, { status: 'freigegeben' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Zu lang für Bluesky: 1 Zeichen kürzen.')
    expect(ladeEntwuerfe(DATUM2, DATUM2).find((e) => e.id === zuLang).status).toBe('offen')

    res = await post(genau, { status: 'freigegeben' })
    expect(res.status).toBe(200)
    expect((await res.json()).entwurf.status).toBe('freigegeben')
  })

  it('prüft beim Freigeben auch den mitgeschickten Text – und ändert dann nichts', async () => {
    const eid = anlegen('X', 'kurz', '')
    const res = await post(eid, { caption: 'x'.repeat(301), status: 'freigegeben' })
    expect(res.status).toBe(409)
    const e = ladeEntwuerfe(DATUM2, DATUM2).find((x) => x.id === eid)
    expect(e).toMatchObject({ caption: 'kurz', status: 'offen' })
    const ok = await post(eid, { caption: 'x'.repeat(300), status: 'freigegeben' })
    expect(ok.status).toBe(200)
  })

  it('erlaubt einen längeren Beitragstext, solange er nicht freigegeben wird (bis 2 200 Zeichen)', async () => {
    const eid = anlegen('TB', 'kurz', '')
    expect((await post(eid, { caption: 'y'.repeat(2200) })).status).toBe(200)
    expect((await post(eid, { caption: 'y'.repeat(2201) })).status).toBe(400)
  })

  it('liefert die kleine Fassung, ersatzweise die volle, und zählt Bildabrufe nicht gegen das Admin-Limit', async () => {
    const eid = anlegen('T', 'Bild', '')
    mkdirSync(BILD_DIR, { recursive: true })
    const gross = `entwurf-${eid}.png`
    writeFileSync(join(BILD_DIR, gross), 'GROSS-GROSS-GROSS')
    setzeBild(eid, gross)
    const url = (q) => `${baseUrl}/admin/social-cards/entwuerfe/${eid}/bild${q}`
    try {
      // Vorschau fehlt noch → volle Datei, kurz zwischengespeichert
      let res = await fetch(url('?groesse=klein'), { headers: adminHeaders(token) })
      expect(await res.text()).toBe('GROSS-GROSS-GROSS')
      expect(res.headers.get('cache-control')).toBe('private, max-age=60')

      writeFileSync(join(BILD_DIR, kleinDatei(gross)), 'klein')
      res = await fetch(url('?groesse=klein'), { headers: adminHeaders(token) })
      expect(await res.text()).toBe('klein')
      expect(res.headers.get('cache-control')).toBe('private, max-age=3600')
      res = await fetch(url(''), { headers: adminHeaders(token) })
      expect(await res.text()).toBe('GROSS-GROSS-GROSS')
      // Der Download ist immer die volle Fassung
      res = await fetch(url('?groesse=klein&download'), { headers: adminHeaders(token) })
      expect(await res.text()).toBe('GROSS-GROSS-GROSS')
      expect(res.headers.get('content-disposition')).toMatch(/attachment/)

      // Eine Liste lädt ~15 Vorschauen auf einmal: 61 Abrufe in einer Minute bleiben ohne 429 …
      const stati = []
      for (let i = 0; i < 61; i++) stati.push((await fetch(url('?groesse=klein'), { headers: adminHeaders(token) })).status)
      expect(stati.every((s) => s === 200)).toBe(true)
      // … und die übrigen Admin-Abrufe sind davon unberührt
      const liste = await fetch(`${baseUrl}/admin/social-cards/entwuerfe?von=${DATUM2}&bis=${DATUM2}`, { headers: adminHeaders(token) })
      expect(liste.status).toBe(200)
    } finally {
      rmSync(join(BILD_DIR, gross), { force: true })
      rmSync(join(BILD_DIR, kleinDatei(gross)), { force: true })
    }
  })
})

describe('admin social-cards: Neu erstellen und Änderungsprotokoll', () => {
  // Eigener Router mit Attrappen: Die echte Neuerstellung braucht Korpus und Browser
  const erzeuge = (erneuereEntwurf, { reihenfolge = [], bildPfad } = {}) => {
    const auditUpdate = vi.fn()
    const durch = (_req, _res, next) => next()
    const router = createAdminSocialCardsRouter({
      requireAuth: (req, _res, next) => { reihenfolge.push('auth'); req.adminSessionId = 'sitzung-1'; next() },
      adminLimiter: durch,
      adminBildLimiter: (_req, _res, next) => { reihenfolge.push('limiter'); next() },
      validate,
      adminSocialCardsTagesdataSchema,
      adminSocialCardsBelegeSchema,
      adminSocialCardsEntwuerfeQuerySchema,
      adminSocialCardsEntwurfParamsSchema,
      adminSocialCardsEntwurfPatchSchema,
      ladeEntwurf: (eid) => (Number(eid) === 11 ? { id: 11, datum: '2099-05-04', slot: 'A', spec: {}, status: 'offen' } : null),
      erneuereEntwurf,
      bildPfad,
      auditUpdate,
      adminError: (res, err) => res.status(500).json({ error: err.message }),
      entwurfEinstellungen: () => ({}),
      kartenModulPath: '/nicht-benoetigt',
    })
    const app = express()
    app.use(express.json())
    app.use('/', router)
    return { app, auditUpdate }
  }
  const starte = (app) => new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })

  it('schreibt für Rätsel und Auflösung je einen Protokolleintrag mit altem und neuem Text', async () => {
    const { app, auditUpdate } = erzeuge(async () => ({
      ok: true,
      ersetzt: [
        { id: 11, vorher: { caption: 'alt Rätsel', hashtags: '#a' }, nachher: { caption: 'neu Rätsel', hashtags: '#a' } },
        { id: 12, vorher: { caption: 'alt Auflösung', hashtags: '' }, nachher: { caption: 'neu Auflösung', hashtags: '' } },
      ],
    }))
    const server = await starte(app)
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/social-cards/entwuerfe/11/neu`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, ersetzt: [11, 12] })
      expect(auditUpdate).toHaveBeenCalledTimes(2)
      expect(auditUpdate).toHaveBeenNthCalledWith(1, 'social_card_entwurf', '11',
        { caption: 'alt Rätsel', hashtags: '#a' }, { caption: 'neu Rätsel', hashtags: '#a', neuErstellt: true },
        expect.objectContaining({ adminKey: 'sitzung-1' }))
      expect(auditUpdate.mock.calls[1][1]).toBe('12')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Zeichenfehler beim Neuerstellen: Antwort ok mit bildFehlt, Protokoll wird trotzdem geschrieben', async () => {
    const { app, auditUpdate } = erzeuge(async () => ({
      ok: true,
      bildFehlt: true,
      ersetzt: [{ id: 11, vorher: { caption: 'alt', hashtags: '' }, nachher: { caption: 'neu', hashtags: '' } }],
    }))
    const server = await starte(app)
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/social-cards/entwuerfe/11/neu`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, ersetzt: [11], bildFehlt: true })
      expect(auditUpdate).toHaveBeenCalledTimes(1)
      expect(auditUpdate.mock.calls[0][3]).toEqual({ caption: 'neu', hashtags: '', neuErstellt: true })
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Zeichenmodul: Limiter läuft VOR der Anmeldeprüfung', async () => {
    const reihenfolge = []
    const { app } = erzeuge(async () => ({ ok: false, grund: 'x' }), { reihenfolge })
    const server = await starte(app)
    try {
      await fetch(`http://127.0.0.1:${server.address().port}/admin/social-cards/karten.js`)
      expect(reihenfolge).toEqual(['limiter', 'auth'])
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('Bild-Route: Entwurf unterdessen gelöscht (bildPfad liefert null) → 404 statt 500', async () => {
    const { app } = erzeuge(async () => ({ ok: false, grund: 'x' }), { bildPfad: async () => null })
    const server = await starte(app)
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/social-cards/entwuerfe/11/bild`)
      expect(res.status).toBe(404)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it('protokolliert nichts, wenn das Neuerstellen abgelehnt wird (Partner schon entschieden)', async () => {
    const { app, auditUpdate } = erzeuge(async () => ({ ok: false, grund: 'Rätsel und Auflösung gehören zusammen – beide müssen offen sein.' }))
    const server = await starte(app)
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/social-cards/entwuerfe/11/neu`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      expect(res.status).toBe(409)
      expect((await res.json()).error).toMatch(/gehören zusammen/)
      expect(auditUpdate).not.toHaveBeenCalled()
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

describe('admin social-cards: Als Entwurf ablegen', () => {
  // Router mit Attrappe für die Ablage (die echte zeichnet mit Chromium)
  const erzeuge = (legeEigenenEntwurfAb) => {
    const auditCreate = vi.fn()
    const durch = (req, _res, next) => { req.adminSessionId = 'sitzung-1'; next() }
    const router = createAdminSocialCardsRouter({
      requireAuth: durch,
      adminLimiter: durch,
      adminBildLimiter: durch,
      validate,
      adminSocialCardsTagesdataSchema,
      adminSocialCardsBelegeSchema,
      adminSocialCardsEntwuerfeQuerySchema,
      adminSocialCardsEntwurfParamsSchema,
      adminSocialCardsEntwurfPatchSchema,
      adminSocialCardsEigenSchema,
      legeEigenenEntwurfAb,
      berlinHeute: () => '2099-05-01',
      auditCreate,
      auditUpdate: vi.fn(),
      adminError: (res, err) => res.status(500).json({ error: err.message }),
      entwurfEinstellungen: () => ({}),
      kartenModulPath: '/nicht-benoetigt',
    })
    const app = express()
    app.use(express.json())
    app.use('/', router)
    return { app, auditCreate }
  }
  const mitServer = async (app, fn) => {
    const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)) })
    try { await fn(`http://127.0.0.1:${server.address().port}`) } finally { await new Promise((resolve) => server.close(resolve)) }
  }
  const body = (extra = {}) => ({ datum: '2099-05-04', spec: { format: 'A', data: { lemma: 'Haus' } }, caption: 'Text', ...extra })
  const post = (basis, b) => fetch(`${basis}/admin/social-cards/entwuerfe/eigen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })

  it('legt ab, schreibt je Entwurf einen Protokolleintrag und reicht die Wochenzahl durch', async () => {
    const lege = vi.fn(async () => ({ ok: true, entwuerfe: [{ id: 7, datum: '2099-05-04', slot: 'E' }, { id: 8, datum: '2099-05-05', slot: 'E-aufloesung' }], wocheFreigegeben: 3, bildFehlt: false }))
    const { app, auditCreate } = erzeuge(lege)
    await mitServer(app, async (basis) => {
      const res = await post(basis, body({ mitAufloesung: true }))
      expect(res.status).toBe(200)
      expect((await res.json()).wocheFreigegeben).toBe(3)
      expect(lege.mock.calls[0][0]).toMatchObject({ datum: '2099-05-04', mitAufloesung: true, hashtags: '' })
      expect(lege.mock.calls[0][0].spec).toMatchObject({ theme: 'hell', ratio: '4:5', header: true })
      expect(auditCreate).toHaveBeenCalledTimes(2)
      expect(auditCreate.mock.calls[0][2]).toMatchObject({ slot: 'E', eigen: true, ersetzt: false })
    })
  })

  it('prüft Format, Text und Datum (nicht in der Vergangenheit)', async () => {
    const lege = vi.fn()
    const { app } = erzeuge(lege)
    await mitServer(app, async (basis) => {
      expect((await post(basis, body({ spec: { format: 'Q', data: {} } }))).status).toBe(400)
      expect((await post(basis, body({ caption: '  ' }))).status).toBe(400)
      const alt = await post(basis, body({ datum: '2099-04-30' }))
      expect(alt.status).toBe(400)
      expect(await alt.json()).toEqual({ error: 'Der Tag liegt in der Vergangenheit.', feld: 'datum' })
      expect(lege).not.toHaveBeenCalled()
    })
  })

  it('belegter Platz: 409 mit ersetzbar, entschiedener ohne; fehlende Auflösungsdaten → 400', async () => {
    const offen = erzeuge(async () => ({ ok: false, belegt: { datum: '2099-05-04', status: 'offen' }, ersetzbar: true }))
    await mitServer(offen.app, async (basis) => {
      const res = await post(basis, body())
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ error: 'Für diesen Tag gibt es schon einen eigenen Entwurf.', ersetzbar: true })
    })
    const frei = erzeuge(async () => ({ ok: false, belegt: { datum: '2099-05-05', status: 'freigegeben' }, ersetzbar: false }))
    await mitServer(frei.app, async (basis) => {
      const res = await post(basis, body({ ersetzen: true }))
      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('Für den Folgetag (Auflösung) gibt es schon einen eigenen Entwurf, der freigegeben ist.')
    })
    const kaputt = erzeuge(async () => { throw Object.assign(new Error('Für die Auflösung fehlen Wort oder richtige Antwort.'), { status: 400 }) })
    await mitServer(kaputt.app, async (basis) => {
      const res = await post(basis, body({ mitAufloesung: true }))
      expect(res.status).toBe(400)
    })
  })
})
