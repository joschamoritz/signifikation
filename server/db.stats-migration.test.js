import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'

describe('DB stats migration', () => {
  const originalAppDb = process.env.APP_DB
  const openedDbs = []
  const tempDirs = []

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

  it('migrates legacy stats schema and keeps old entries', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'signifikation-db-test-'))
    tempDirs.push(tempDir)
    const dbPath = join(tempDir, 'legacy.db')

    const legacyDb = new Database(dbPath)
    legacyDb.exec(`
      CREATE TABLE stats (
        datum    TEXT NOT NULL,
        spiel    TEXT NOT NULL,
        plays    INTEGER NOT NULL DEFAULT 0,
        scoreSum INTEGER NOT NULL DEFAULT 0,
        maxSum   INTEGER NOT NULL DEFAULT 0,
        dist     TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (datum, spiel)
      );

      INSERT INTO stats (datum, spiel, plays, scoreSum, maxSum, dist)
      VALUES ('04-15', 'kollokationen', 2, 11, 20, '[0,0,0,0,0,0,0,1,1,0,0]');
    `)
    legacyDb.close()

    let migratedDb
    try {
      process.env.APP_DB = dbPath
      const mod = await import(`./db.js?stats-migration=${Date.now()}`)
      migratedDb = mod.default
      openedDbs.push(migratedDb)

      const cols = migratedDb.prepare('PRAGMA table_info(stats)').all().map((row) => row.name)
      expect(cols).toContain('user_id')

      const legacyRow = migratedDb.prepare(`
        SELECT datum, spiel, user_id, plays, scoreSum, maxSum, dist
        FROM stats
        WHERE datum = '04-15' AND spiel = 'kollokationen' AND user_id = ''
      `).get()

      expect(legacyRow).toEqual({
        datum: '04-15',
        spiel: 'kollokationen',
        user_id: '',
        plays: 2,
        scoreSum: 11,
        maxSum: 20,
        dist: '[0,0,0,0,0,0,0,1,1,0,0]',
      })

      migratedDb.prepare(`
        INSERT INTO stats (datum, spiel, user_id, plays, scoreSum, maxSum, dist)
        VALUES ('04-15', 'kollokationen', 'user-1', 1, 6, 10, '[0,0,0,0,0,0,1,0,0,0,0]')
      `).run()

      const rows = migratedDb.prepare(`
        SELECT user_id
        FROM stats
        WHERE datum = '04-15' AND spiel = 'kollokationen'
        ORDER BY user_id ASC
      `).all()

      expect(rows.map((row) => row.user_id)).toEqual(['', 'user-1'])

      const indices = migratedDb.prepare('PRAGMA index_list(stats)').all().map((row) => row.name)
      expect(indices).toContain('idx_stats_user')
    } finally {
      if (migratedDb) {
        const idx = openedDbs.indexOf(migratedDb)
        if (idx >= 0) openedDbs.splice(idx, 1)
        try { migratedDb.close() } catch {}
      }
    }
  })
})
