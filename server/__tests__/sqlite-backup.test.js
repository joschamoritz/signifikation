import { describe, expect, it } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { runSqliteBackup, listSqliteBackups } = await import('../jobs/sqliteBackup.js')

describe('sqliteBackup', () => {
  it('erstellt ein gzip-Backup der laufenden DB und rotiert alte Stände', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sig-backup-'))

    // Drei Fake-Altbestände für die Rotation
    for (const d of ['2020-01-01', '2020-01-02', '2020-01-03']) {
      writeFileSync(join(dir, `signifikation-${d}.db.gz`), 'x')
    }
    // Fremddatei darf die Rotation nie anfassen
    writeFileSync(join(dir, 'notizen.txt'), 'bleibt')

    const result = await runSqliteBackup({ dir, keep: 2 })

    expect(result.sizeBytes).toBeGreaterThan(0)
    expect(result.deleted).toBe(2)

    const files = readdirSync(dir).sort()
    expect(files).toContain('notizen.txt')
    expect(files.filter(f => f.endsWith('.db.gz'))).toHaveLength(2)
    expect(files).not.toContain('signifikation-2020-01-01.db.gz')
    expect(files).not.toContain('signifikation-2020-01-02.db.gz')
    // Keine .tmp-Reste
    expect(files.some(f => f.endsWith('.tmp'))).toBe(false)

    // Echtes gzip? (Magic Bytes 1f 8b)
    const head = readFileSync(result.file).subarray(0, 2)
    expect([...head]).toEqual([0x1f, 0x8b])
  })

  it('listSqliteBackups liefert Einträge absteigend nach Datum', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sig-backup-list-'))
    writeFileSync(join(dir, 'signifikation-2024-05-01.db.gz'), 'a')
    writeFileSync(join(dir, 'signifikation-2024-06-01.db.gz'), 'b')

    const list = listSqliteBackups({ dir })
    expect(list.map(e => e.file)).toEqual([
      'signifikation-2024-06-01.db.gz',
      'signifikation-2024-05-01.db.gz',
    ])
    expect(list[0].sizeBytes).toBeGreaterThan(0)
  })

  it('listSqliteBackups gibt [] zurück wenn das Verzeichnis fehlt', () => {
    expect(listSqliteBackups({ dir: join(tmpdir(), 'gibt-es-nicht-' + Date.now()) })).toEqual([])
  })
})
