import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import Database from 'better-sqlite3'

const { runSqliteBackup, listSqliteBackups, verifyBackupIntegrity, sicherungLaeuft, zuLoeschen, startSqliteBackup } = await import('../jobs/sqliteBackup.js')
const { default: db } = await import('../db.js')

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

  it('hinterlässt keine Nebendateien und räumt alte Reste (-shm/-wal) mit ab', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sig-backup-tmp-'))
    writeFileSync(join(dir, 'signifikation-2026-06-16.db.tmp-shm'), 'x')
    writeFileSync(join(dir, 'signifikation-2026-06-16.db.tmp-wal'), '')
    writeFileSync(join(dir, 'signifikation-2026-06-16.db.tmp-notiz.txt'), 'bleibt')

    await runSqliteBackup({ dir, keep: 7 })

    const files = readdirSync(dir)
    expect(files.filter(f => /\.db\.tmp(-wal|-shm|-journal)?$/.test(f))).toEqual([])
    expect(files).toContain('signifikation-2026-06-16.db.tmp-notiz.txt')
    expect(files.filter(f => f.endsWith('.db.gz'))).toHaveLength(1)
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

  it('verifyBackupIntegrity: gibt "ok" für eine valide SQLite-Datei', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sig-integrity-ok-'))
    const path = join(dir, 'valid.db')
    const probe = new Database(path)
    probe.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t (v) VALUES (\'x\');')
    probe.close()
    expect(verifyBackupIntegrity(path)).toBe('ok')
  })

  it('verifyBackupIntegrity: erkennt eine korrupte/nicht-DB-Datei (nicht "ok")', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sig-integrity-bad-'))
    const path = join(dir, 'corrupt.db')
    // Kein gültiger SQLite-Header ("SQLite format 3\0") → quick_check/Öffnen scheitert.
    writeFileSync(path, Buffer.from('das ist definitiv keine sqlite-datenbank '.repeat(8)))
    const result = verifyBackupIntegrity(path)
    expect(result).not.toBe('ok')
    expect(typeof result).toBe('string')
  })

  describe('zusätzliche Sicherungen (von Hand, vor dem Wiederherstellen)', () => {
    const tag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })

    it('legt eine eigene Datei mit Uhrzeit an und überschreibt die tägliche nicht', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-anlass-'))
      const taeglich = await runSqliteBackup({ dir })
      const vorher = statSync(taeglich.file)
      const mtimeVorher = vorher.mtimeMs
      expect(taeglich.anlass).toBe('taeglich')

      const manuell = await runSqliteBackup({ dir, anlass: 'manuell' })
      expect(manuell.anlass).toBe('manuell')
      const name = basename(manuell.file)
      expect(name.startsWith(`signifikation-${tag}-`)).toBe(true)
      expect(name).toMatch(/-\d{4}-manuell\.db\.gz$/)

      // Die tägliche Datei ist unverändert da
      expect(statSync(taeglich.file).mtimeMs).toBe(mtimeVorher)
      expect(readdirSync(dir).filter(f => f.endsWith('.db.gz'))).toHaveLength(2)
      expect([...readFileSync(manuell.file).subarray(0, 2)]).toEqual([0x1f, 0x8b])
    })

    it('rotiert je Anlass getrennt: Handsicherungen verdrängen weder tägliche noch Sicherheitskopien', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-rot-'))
      for (const d of ['2020-01-01', '2020-01-02']) writeFileSync(join(dir, `signifikation-${d}.db.gz`), 'x')
      writeFileSync(join(dir, 'signifikation-2020-01-01-0800-vor-wiederherstellung.db.gz'), 'x')
      for (const hhmm of ['0901', '0902', '0903']) writeFileSync(join(dir, `signifikation-2020-01-02-${hhmm}-manuell.db.gz`), 'x')

      await runSqliteBackup({ dir, keep: 7, extraKeep: 2, anlass: 'manuell' })

      const files = readdirSync(dir)
      // manuell: 3 alte + 1 neue → die zwei neuesten bleiben (0903 und die neue)
      const manuell = files.filter(f => f.includes('-manuell.'))
      expect(manuell).toHaveLength(2)
      expect(manuell).not.toContain('signifikation-2020-01-02-0901-manuell.db.gz')
      expect(manuell).not.toContain('signifikation-2020-01-02-0902-manuell.db.gz')
      // Sicherheitskopie und tägliche Stände bleiben unangetastet
      expect(files).toContain('signifikation-2020-01-01-0800-vor-wiederherstellung.db.gz')
      expect(files).toContain('signifikation-2020-01-01.db.gz')
      expect(files).toContain('signifikation-2020-01-02.db.gz')
    })

    it('die tägliche Rotation fasst zusätzliche Sicherungen nicht an', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-rot2-'))
      writeFileSync(join(dir, 'signifikation-2020-01-01.db.gz'), 'x')
      writeFileSync(join(dir, 'signifikation-2020-01-01-0800-vor-wiederherstellung.db.gz'), 'x')
      writeFileSync(join(dir, 'signifikation-2020-01-01-0801-manuell.db.gz'), 'x')

      await runSqliteBackup({ dir, keep: 1 })

      const files = readdirSync(dir).filter(f => f.endsWith('.db.gz'))
      expect(files).not.toContain('signifikation-2020-01-01.db.gz')
      expect(files).toContain('signifikation-2020-01-01-0800-vor-wiederherstellung.db.gz')
      expect(files).toContain('signifikation-2020-01-01-0801-manuell.db.gz')
    })

    it('zweimal in derselben Minute überschreibt nichts (Sekunden im Namen)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-minute-'))
      const a = await runSqliteBackup({ dir, anlass: 'manuell' })
      const b = await runSqliteBackup({ dir, anlass: 'manuell' })
      expect(a.file).not.toBe(b.file)
      expect(readdirSync(dir).filter(f => f.endsWith('-manuell.db.gz'))).toHaveLength(2)
    })

    it('räumt temporäre Reste zusätzlicher Sicherungen mit ab', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-tmp2-'))
      writeFileSync(join(dir, 'signifikation-2020-01-01-0800-manuell.db.tmp'), 'x')
      writeFileSync(join(dir, 'signifikation-2020-01-01-0800-manuell.db.tmp-wal'), 'x')
      await runSqliteBackup({ dir, anlass: 'manuell' })
      expect(readdirSync(dir).filter(f => f.includes('.db.tmp'))).toEqual([])
    })

    it('listSqliteBackups liefert beide Arten mit Anlass, neueste zuerst', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-list2-'))
      await runSqliteBackup({ dir })
      await new Promise(r => setTimeout(r, 20))
      await runSqliteBackup({ dir, anlass: 'vor-wiederherstellung' })
      writeFileSync(join(dir, 'notizen.txt'), 'bleibt')

      const list = listSqliteBackups({ dir })
      expect(list.map(e => e.anlass)).toEqual(['vor-wiederherstellung', 'taeglich'])
      expect(list.every(e => e.sizeBytes > 0 && !Number.isNaN(Date.parse(e.modifiedAt)))).toBe(true)
    })

    it('lehnt einen unbekannten Anlass ab und läuft danach nicht weiter', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-bad-'))
      await expect(runSqliteBackup({ dir, anlass: 'egal' })).rejects.toThrow(/Anlass/)
      expect(sicherungLaeuft()).toBe(false)
      expect(readdirSync(dir)).toEqual([])
    })

    it('ein zweiter Start während eines Laufs wird übersprungen (Doppelstart)', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-doppel-'))
      const erster = runSqliteBackup({ dir, anlass: 'manuell' })
      expect(sicherungLaeuft()).toBe(true)
      const zweiter = await runSqliteBackup({ dir, anlass: 'manuell' })
      expect(zweiter).toEqual({ skipped: true })
      await erster
      expect(sicherungLaeuft()).toBe(false)
    })
  })

  describe('Rotation der Sicherheitskopien vor dem Wiederherstellen', () => {
    const vw = (tag, hhmm) => `signifikation-${tag}-${hhmm}-vor-wiederherstellung.db.gz`

    it('zuLoeschen behält die neuesten und die erste Kopie der neuesten Tage', () => {
      const dateien = [
        vw('2026-10-20', '0900'), vw('2026-10-20', '1000'),
        vw('2026-10-21', '0800'), vw('2026-10-21', '0900'), vw('2026-10-21', '1000'), vw('2026-10-21', '1100'), vw('2026-10-21', '1200'), vw('2026-10-21', '1300'),
      ].sort()
      // Die ersten Kopien beider Tage bleiben, obwohl sie nicht unter den 5 neuesten sind; nur die zweite des 20.10. fällt
      expect(zuLoeschen(dateien, 5, true)).toEqual([vw('2026-10-20', '1000')])
      // Ohne die Tagesregel würden auch die ersten Kopien fallen
      expect(zuLoeschen(dateien, 5, false)).toEqual([vw('2026-10-20', '0900'), vw('2026-10-20', '1000'), vw('2026-10-21', '0800')])
    })

    it('die Tagesregel ist begrenzt: höchstens 2 × keep Dateien', () => {
      const dateien = []
      for (let tag = 1; tag <= 20; tag++) {
        for (const hhmm of ['0800', '0900', '1000']) dateien.push(vw(`2026-10-${String(tag).padStart(2, '0')}`, hhmm))
      }
      const bleibt = dateien.length - zuLoeschen(dateien.sort(), 5, true).length
      expect(bleibt).toBeLessThanOrEqual(10)
      expect(bleibt).toBeGreaterThanOrEqual(5)
    })

    it('mehrfaches Wiederherstellen am selben Tag verdrängt die erste Kopie nicht', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-erste-'))
      const tag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
      const erste = vw(tag, '0001')
      writeFileSync(join(dir, erste), 'x')
      for (const hhmm of ['0100', '0200', '0300', '0400', '0500']) writeFileSync(join(dir, vw(tag, hhmm)), 'x')

      await runSqliteBackup({ dir, extraKeep: 5, anlass: 'vor-wiederherstellung' })

      const dateien = readdirSync(dir).filter(f => f.includes('vor-wiederherstellung'))
      expect(dateien).toContain(erste)
      // die zwei ältesten der übrigen sind weg, die fünf neuesten und die erste bleiben
      expect(dateien).not.toContain(vw(tag, '0100'))
      expect(dateien).toHaveLength(6)
    })

    it('Zeitumstellung: Die Rotation richtet sich nach dem Alter der Datei, nicht nach dem Namen', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-dst-'))
      // In der Nacht zur Winterzeit kommt 02:30 zweimal vor: Die spätere Kopie trägt den KLEINEREN Namen (0210 < 0230).
      const frueh = 'signifikation-2020-10-25-0230-manuell.db.gz'   // 02:30 Sommerzeit (zuerst)
      const spaet = 'signifikation-2020-10-25-0210-manuell.db.gz'   // 02:10 Winterzeit (eine Stunde später)
      const aelter = 'signifikation-2020-10-25-0100-manuell.db.gz'
      writeFileSync(join(dir, frueh), 'x')
      writeFileSync(join(dir, spaet), 'x')
      writeFileSync(join(dir, aelter), 'x')
      utimesSync(join(dir, aelter), new Date('2020-10-25T00:00:00Z'), new Date('2020-10-25T00:00:00Z'))
      utimesSync(join(dir, frueh), new Date('2020-10-25T00:30:00Z'), new Date('2020-10-25T00:30:00Z'))
      utimesSync(join(dir, spaet), new Date('2020-10-25T01:10:00Z'), new Date('2020-10-25T01:10:00Z'))

      await runSqliteBackup({ dir, extraKeep: 2, anlass: 'manuell' })

      const rest = readdirSync(dir).filter(f => f.includes('-manuell.'))
      expect(rest).toHaveLength(2)
      // Behalten: die neue Kopie und die tatsächlich jüngere der beiden alten – nach Name wäre es die falsche gewesen
      expect(rest).toContain(spaet)
      expect(rest).not.toContain(frueh)
      expect(rest).not.toContain(aelter)
    })

    it('Handsicherungen folgen weiter der einfachen Grenze', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-hand-'))
      for (const hhmm of ['0001', '0002', '0003']) writeFileSync(join(dir, `signifikation-2020-01-01-${hhmm}-manuell.db.gz`), 'x')
      await runSqliteBackup({ dir, extraKeep: 2, anlass: 'manuell' })
      expect(readdirSync(dir).filter(f => f.includes('-manuell.'))).toHaveLength(2)
    })
  })

  describe('Fehlerfälle', () => {
    it('räumt die halbe Kopie weg, wenn db.backup scheitert', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-fehler-'))
      const spy = vi.spyOn(db, 'backup').mockImplementationOnce(async (ziel) => {
        writeFileSync(ziel, 'halb')
        writeFileSync(`${ziel}-wal`, 'halb')
        throw new Error('Platte voll')
      })
      await expect(runSqliteBackup({ dir })).rejects.toThrow('Platte voll')
      spy.mockRestore()
      expect(readdirSync(dir)).toEqual([])
      expect(sicherungLaeuft()).toBe(false)
    })

    it('der tägliche Lauf wird nachgeholt, wenn er übersprungen wurde', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sig-backup-nachholen-'))
      const blockiert = runSqliteBackup({ dir, anlass: 'manuell' }) // belegt den Lauf
      expect(sicherungLaeuft()).toBe(true)
      const timer = startSqliteBackup({ dir, intervalMs: 1e9, retryMs: 30, maxRetries: 5 })
      await blockiert
      // Der erste tägliche Versuch wurde übersprungen; der zweite (nach 30 ms) läuft durch
      await vi.waitFor(() => expect(readdirSync(dir).filter(f => /^signifikation-\d{4}-\d{2}-\d{2}\.db\.gz$/.test(f))).toHaveLength(1), { timeout: 3000 })
      clearInterval(timer)
    })
  })

})
