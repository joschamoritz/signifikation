/**
 * Lückenfüller kommender Tage neu bauen: welche Wörter, was gespeichert wird, Doppelstart.
 */
import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const KALENDER = {
  '2026-10-29': { ids: [], lueckenfueller_id: 'gestern' },
  '2026-10-30': { ids: [], lueckenfueller_id: 'heute' },
  '2026-11-02': { ids: [], lueckenfueller_id: 'zahl' },
  '2026-11-03': { ids: [], lueckenfueller_id: 'heute' },     // heute gespielt, später noch einmal: bleibt
  '2026-11-04': { ids: [], lueckenfueller_id: 'fehlt' },     // kein Lemma dazu
  '2026-11-05': { ids: [], lueckenfueller_id: '' },
  '2026-11-06': ['alt-format'],
}
const WOCHEN = [
  { woche: '2026-W44', von: '2026-10-26', bis: '2026-11-01', lueckenfueller_id: 'laufende-woche' },
  { woche: '2026-W49', von: '2026-11-30', bis: '2026-12-06', lueckenfueller_id: 'weihnachtsmarkt' },
]
const LEMMATA = new Map([
  ['zahl', { id: 'zahl', lemma: 'Zahl', pos: 'Substantiv', runden: {} }],
  ['weihnachtsmarkt', { id: 'weihnachtsmarkt', lemma: 'Weihnachtsmarkt', pos: 'Substantiv', runden: {} }],
])

const upsert = vi.fn()
vi.mock('../store.js', () => ({
  loadDailyContentMaps: () => ({ kalender: KALENDER }),
  getLemmataIndex: () => ({ byId: LEMMATA }),
  invalidateCache: vi.fn(),
  lemmaToRow: (l) => l,
  stmts: { upsertLemma: { run: (...a) => upsert(...a) } },
}))
vi.mock('../store-spezialwochen.js', () => ({ loadAllSpezialwochen: () => WOCHEN }))
const bauen = vi.fn()
vi.mock('../lueckenfuellerImWorker.js', () => ({ buildLueckenfuellerImWorker: (...a) => bauen(...a) }))

const { kommendeLueckenfuellerIds, starteLueckenfuellerNeubau, lueckenfuellerNeubauStatus } = await import('../lueckenfuellerNeubau.js')

beforeEach(() => { upsert.mockReset(); bauen.mockReset() })

describe('kommendeLueckenfuellerIds', () => {
  it('nimmt Tage nach heute und Wochen, die noch nicht begonnen haben – ohne heute und die laufende Woche', () => {
    expect(kommendeLueckenfuellerIds('2026-10-30').sort()).toEqual(['fehlt', 'weihnachtsmarkt', 'zahl'])
  })
})

describe('starteLueckenfuellerNeubau', () => {
  it('speichert neue Runden, lässt Wörter ohne Material und ohne Lemma unverändert', async () => {
    bauen.mockImplementation(async (lemma) => (lemma === 'Zahl' ? [{ type: 'choice' }] : null))
    const start = starteLueckenfuellerNeubau({ heute: '2026-10-30' })
    expect(start).toMatchObject({ status: 'gestartet', gesamt: 3, laeuft: true })
    await start.fertig
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0][0]).toMatchObject({ id: 'zahl', lueckenfueller: [{ type: 'choice' }] })
    expect(lueckenfuellerNeubauStatus()).toMatchObject({ laeuft: false, gesamt: 3, fertig: 3, neu: 1, unveraendert: 2, fehler: 0 })
  })

  it('zählt Fehler und macht mit dem nächsten Wort weiter', async () => {
    bauen.mockImplementation(async (lemma) => { if (lemma === 'Zahl') throw new Error('Zeitlimit'); return [{ type: 'choice' }] })
    await starteLueckenfuellerNeubau({ heute: '2026-10-30' }).fertig
    expect(lueckenfuellerNeubauStatus()).toMatchObject({ fehler: 1, neu: 1 })
  })

  it('startet nicht doppelt', async () => {
    let freigeben
    bauen.mockImplementation(() => new Promise((r) => { freigeben = r }))
    const erster = starteLueckenfuellerNeubau({ heute: '2026-10-30' })
    expect(starteLueckenfuellerNeubau({ heute: '2026-10-30' }).status).toBe('laeuft')
    // die zwei Wörter mit Lemma freigeben („fehlt“ ruft den Worker nicht auf)
    for (let i = 0; i < 2; i++) { await vi.waitFor(() => expect(freigeben).toBeTypeOf('function')); const f = freigeben; freigeben = null; f(null) }
    await erster.fertig
  })
})

describe('POST /admin/lueckenfueller-neubau', () => {
  it('startet über die Route und liefert den Stand ohne Promise', async () => {
    const { createAdminOpsRouter } = await import('../routes/admin-ops.js')
    const app = express()
    app.use(express.json())
    app.use(createAdminOpsRouter({
      adminLimiter: (_q, _r, n) => n(),
      requireAuth: (_q, _r, n) => n(),
      loadKalender: () => ({}),
      getCacheMetrics: () => ({}),
      getQueryCacheMetrics: () => ({}),
      clearQueryCache: () => {},
      starteLueckenfuellerNeubau: () => ({ status: 'gestartet', gesamt: 4, fertig: Promise.resolve() }),
      adminError: (res, err) => res.status(500).json({ error: String(err?.message ?? err) }),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    }))
    const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/admin/lueckenfueller-neubau`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'gestartet', gesamt: 4 })
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  }, 30_000)   // admin-ops.js lädt beim ersten Import Datenbank-Module
})
