// stats_tag (Migration 0031) wird per Trigger aus stats gepflegt. Nach jedem Schreibweg muss die Tabelle
// genau der Aggregation über stats entsprechen (ohne Admin-Konten): Spiel, Überschreiben, Kontolöschung,
// Verdichtung alter Konto-Zeilen, Wiederherstellung.
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

describe('stats_tag (Tagessummen per Trigger)', () => {
  const originalAppDb = process.env.APP_DB
  let tempDir
  let db
  let store

  beforeAll(async () => {
    vi.resetModules()
    tempDir = mkdtempSync(join(tmpdir(), 'signifikation-stats-tag-'))
    process.env.APP_DB = join(tempDir, 'stats.db')
    db = (await import('./db.js')).default
    store = await import('./store.js')
    db.prepare(`INSERT INTO user_profiles (user_id, role, created_at, updated_at) VALUES ('admin-1', 'admin', 0, 0)`).run()
  })

  afterAll(() => {
    try { db.close() } catch {}
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
    if (typeof originalAppDb === 'undefined') delete process.env.APP_DB
    else process.env.APP_DB = originalAppDb
  })

  const B = Array.from({ length: 11 }, (_, i) => i)
  function erwartet() {
    const rows = db.prepare(`SELECT * FROM stats WHERE user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')`).all()
    const m = new Map()
    for (const r of rows) {
      const k = `${r.datum}|${r.spiel}`
      const e = m.get(k) || { spiele: 0, punkte: 0, max: 0, d: B.map(() => 0) }
      e.spiele += r.plays; e.punkte += r.scoreSum; e.max += r.maxSum
      const dist = JSON.parse(r.dist)
      B.forEach((i) => { e.d[i] += Number(dist[i] || 0) })
      m.set(k, e)
    }
    return Object.fromEntries([...m].sort())
  }
  function tabelle() {
    const rows = db.prepare('SELECT * FROM stats_tag WHERE spiele <> 0 OR punkte <> 0 OR max <> 0 ORDER BY datum, spiel').all()
    return Object.fromEntries(rows.map((r) => [`${r.datum}|${r.spiel}`, { spiele: r.spiele, punkte: r.punkte, max: r.max, d: B.map((i) => r[`d${i}`]) }]))
  }

  it('folgt Spielen, Kontolöschung, Verdichtung und Wiederherstellung', () => {
    const heute = new Date().toISOString().slice(0, 10)
    for (const [userId, score] of [['', 3], ['nutzer-1', 7], ['nutzer-1', 10], ['admin-1', 5], ['nutzer-2', 0]]) {
      store.recordStat({ datum: heute, spiel: 'kollokationen', userId, score, max: 10 })
    }
    store.recordStat({ datum: '2020-01-02', spiel: 'wortzwilling', userId: 'nutzer-2', score: 4, max: 8 })
    store.recordStat({ datum: '2020-01-02', spiel: 'wortzwilling', userId: 'admin-1', score: 8, max: 8 })
    expect(tabelle()).toEqual(erwartet())
    expect(tabelle()[`${heute}|kollokationen`].spiele).toBe(4)

    // Kontolöschung räumt die Zeilen eines Kontos ab
    db.prepare('DELETE FROM stats WHERE user_id = ?').run('nutzer-1')
    expect(tabelle()).toEqual(erwartet())

    // Verdichtung: Konto-Zeilen vor der Grenze wandern in die anonyme Zeile (auch die des Admins, wie bisher)
    store.compactOldUserStats(30)
    expect(db.prepare(`SELECT COUNT(*) AS n FROM stats WHERE datum = '2020-01-02' AND user_id != ''`).get().n).toBe(0)
    expect(tabelle()).toEqual(erwartet())

    // Wiederherstellung ersetzt alles
    store.replaceAllAdminData({ lemmata: [], kalender: {}, wortzwilling: {}, zeitenwende: {}, statsRows: [
      { datum: '2021-05-05', spiel: 'zeitenwende', user_id: '', plays: 3, scoreSum: 12, maxSum: 30, dist: [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1] },
    ] }, { mitStatistik: true })
    expect(tabelle()).toEqual(erwartet())
    expect(Object.keys(tabelle())).toEqual(['2021-05-05|zeitenwende'])
  })

  it('verträgt kaputte Verteilungen, ohne dass das Spiel scheitert', () => {
    db.prepare(`INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist) VALUES ('2022-02-02', 'kollokationen', 'x', 1, 2, 3, 'kaputt')`).run()
    expect(tabelle()['2022-02-02|kollokationen']).toEqual({ spiele: 1, punkte: 2, max: 3, d: B.map(() => 0) })
  })
})
