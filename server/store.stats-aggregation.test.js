import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Stats aggregation in store', () => {
  const originalAppDb = process.env.APP_DB
  const openedDbs = []
  const tempDirs = []

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    for (const db of openedDbs.splice(0)) {
      try { db.close() } catch {}
    }

    for (const dir of tempDirs.splice(0)) {
      try { rmSync(dir, { recursive: true, force: true }) } catch {}
    }

    if (typeof originalAppDb === 'undefined') {
      delete process.env.APP_DB
    } else {
      process.env.APP_DB = originalAppDb
    }
  })

  it('aggregates anonymous and user-bound stats rows per day and game', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'signifikation-store-test-'))
    tempDirs.push(tempDir)
    const dbPath = join(tempDir, 'stats.db')

    process.env.APP_DB = dbPath

    const dbMod = await import('./db.js')
    const db = dbMod.default
    openedDbs.push(db)

    const storeMod = await import('./store.js')

    db.prepare(`
      INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
      VALUES (@datum, @spiel, @user_id, @plays, @scoreSum, @maxSum, @dist)
    `).run({
      datum: '2026-04-15',
      spiel: 'kollokationen',
      user_id: '',
      plays: 2,
      scoreSum: 10,
      maxSum: 20,
      dist: JSON.stringify([0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0]),
    })

    db.prepare(`
      INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
      VALUES (@datum, @spiel, @user_id, @plays, @scoreSum, @maxSum, @dist)
    `).run({
      datum: '2026-04-15',
      spiel: 'kollokationen',
      user_id: 'user-1',
      plays: 1,
      scoreSum: 6,
      maxSum: 10,
      dist: JSON.stringify([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]),
    })

    const stats = storeMod.loadStats()
    expect(stats['2026-04-15']).toBeDefined()
    expect(stats['2026-04-15'].kollokationen).toBeDefined()
    expect(stats['2026-04-15'].kollokationen).toEqual({
      plays: 3,
      scoreSum: 16,
      maxSum: 30,
      dist: [0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0],
    })
  })

  it('exports raw stats rows including user_id via stats-rows.json', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'signifikation-store-test-'))
    tempDirs.push(tempDir)
    const dbPath = join(tempDir, 'stats-rows.db')

    process.env.APP_DB = dbPath

    const dbMod = await import('./db.js')
    const db = dbMod.default
    openedDbs.push(db)

    const storeMod = await import('./store.js')

    db.prepare(`
      INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
      VALUES ('2026-04-16', 'wortzwilling', 'teacher-42', 4, 27, 40, '[0,0,0,0,0,0,0,1,2,1,0]')
    `).run()

    const rows = storeMod.loadReadOnly('stats-rows.json')
    expect(Array.isArray(rows)).toBe(true)
    expect(rows).toContainEqual({
      datum: '2026-04-16',
      spiel: 'wortzwilling',
      user_id: 'teacher-42',
      plays: 4,
      scoreSum: 27,
      maxSum: 40,
      dist: [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0],
    })
  })

  it('imports raw stats rows including user_id via save(stats-rows.json)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'signifikation-store-test-'))
    tempDirs.push(tempDir)
    const dbPath = join(tempDir, 'stats-rows-import.db')

    process.env.APP_DB = dbPath

    const dbMod = await import('./db.js')
    const db = dbMod.default
    openedDbs.push(db)

    const storeMod = await import('./store.js')

    await storeMod.save('stats-rows.json', [
      {
        datum: '2026-04-17',
        spiel: 'wortzwilling',
        user_id: 'user-a',
        plays: 2,
        scoreSum: 13,
        maxSum: 20,
        dist: [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0],
      },
      {
        datum: '2026-04-17',
        spiel: 'wortzwilling',
        user_id: '',
        plays: 1,
        scoreSum: 4,
        maxSum: 10,
        dist: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
      },
    ])

    const rows = db.prepare(`
      SELECT datum, spiel, user_id, plays, scoreSum, maxSum, dist
      FROM stats
      WHERE datum = '2026-04-17' AND spiel = 'wortzwilling'
      ORDER BY user_id ASC
    `).all()

    expect(rows).toHaveLength(2)
    expect(rows[0].user_id).toBe('')
    expect(rows[1].user_id).toBe('user-a')

    const aggregated = storeMod.loadStats()
    expect(aggregated['2026-04-17'].wortzwilling).toEqual({
      plays: 3,
      scoreSum: 17,
      maxSum: 30,
      dist: [0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0],
    })
  })
})
