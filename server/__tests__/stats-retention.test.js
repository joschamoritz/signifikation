// Stats-Retention (Review 2026-06-11, D-H1): per-User-Zeilen aelter als
// 180 Tage werden in die anonyme Zeile (user_id='') gefaltet — Summen und
// Score-Verteilungen muessen dabei EXAKT erhalten bleiben, und der Sweep
// muss idempotent sein.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import db from '../db.js'
import { stmts, compactOldUserStats } from '../store.js'

const OLD_DATE = '2024-01-15'   // weit vor jedem 180-Tage-Cutoff
const FRESH_DATE = new Date().toISOString().slice(0, 10) // heute → bleibt
const SPIEL = `retention-test-${Date.now()}`

function distWith(bucket, n = 1) {
  const d = Array(11).fill(0)
  d[bucket] = n
  return JSON.stringify(d)
}

function cleanup() {
  db.prepare('DELETE FROM stats WHERE spiel = ?').run(SPIEL)
}

describe('compactOldUserStats', () => {
  beforeAll(() => {
    cleanup()
    // Alte per-User-Zeilen + bestehende anonyme Zeile am selben Tag
    stmts.upsertStats.run({ datum: OLD_DATE, spiel: SPIEL, user_id: 'user-a', plays: 2, scoreSum: 14, maxSum: 20, dist: distWith(7, 2) })
    stmts.upsertStats.run({ datum: OLD_DATE, spiel: SPIEL, user_id: 'user-b', plays: 1, scoreSum: 10, maxSum: 10, dist: distWith(10) })
    stmts.upsertStats.run({ datum: OLD_DATE, spiel: SPIEL, user_id: '', plays: 5, scoreSum: 30, maxSum: 50, dist: distWith(6, 5) })
    // Frische per-User-Zeile → darf NICHT angefasst werden
    stmts.upsertStats.run({ datum: FRESH_DATE, spiel: SPIEL, user_id: 'user-a', plays: 1, scoreSum: 8, maxSum: 10, dist: distWith(8) })
  })

  afterAll(cleanup)

  it('faltet alte per-User-Zeilen exakt in die anonyme Zeile', () => {
    const compacted = compactOldUserStats(180)
    expect(compacted).toBeGreaterThanOrEqual(2)

    const rows = db.prepare('SELECT * FROM stats WHERE spiel = ? AND datum = ?').all(SPIEL, OLD_DATE)
    expect(rows).toHaveLength(1)
    const anon = rows[0]
    expect(anon.user_id).toBe('')
    expect(anon.plays).toBe(5 + 2 + 1)
    expect(anon.scoreSum).toBe(30 + 14 + 10)
    expect(anon.maxSum).toBe(50 + 20 + 10)
    const dist = JSON.parse(anon.dist)
    expect(dist[6]).toBe(5)
    expect(dist[7]).toBe(2)
    expect(dist[10]).toBe(1)
  })

  it('laesst frische per-User-Zeilen unangetastet', () => {
    const fresh = db.prepare('SELECT * FROM stats WHERE spiel = ? AND datum = ?').all(SPIEL, FRESH_DATE)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].user_id).toBe('user-a')
  })

  it('ist idempotent (zweiter Lauf kompaktiert nichts mehr)', () => {
    expect(compactOldUserStats(180)).toBe(0)
  })
})
