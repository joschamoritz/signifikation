/**
 * server/jobs/sqliteBackup.js
 *
 * Tägliches dateibasiertes Backup der App-Datenbank (signifikation.db).
 *
 * Hintergrund (Review-Finding 2026-06-10): Das alte Gist-Backup sicherte nur
 * Spieldaten — user, account (Passwort-Hashes), payments, user_entitlements
 * und alle classroom_*-Tabellen waren ungesichert. Dieses Backup sichert die
 * KOMPLETTE Datei und ist damit die einzige Absicherung gegen Totalverlust.
 *
 * Technik:
 *   - better-sqlite3 Online-Backup-API (`db.backup()`): liest über die offene
 *     Verbindung und ist damit trotz WAL-Mode konsistent, ohne Writer zu
 *     blockieren. Ein simples `cp` der .db-Datei wäre bei WAL INKONSISTENT.
 *   - Danach gzip (SQLite-Dateien komprimieren typisch auf ~20–30 %).
 *   - Rotation: die letzten SQLITE_BACKUP_KEEP Stände bleiben liegen,
 *     gleicher Tag wird überschrieben (idempotent bei Deploy-Neustarts).
 *
 * belege.db / wortprofil.db sind bewusst NICHT enthalten: groß und aus der
 * Korpus-Pipeline reproduzierbar — signifikation.db ist es nicht.
 *
 * Grenze: Die Backups liegen per Default auf demselben Volume wie die DB
 * (schützt gegen App-Fehler/versehentliches Löschen, nicht gegen
 * Volume-Verlust). Für Offsite: SQLITE_BACKUP_DIR auf einen anderen Mount
 * zeigen lassen oder das Verzeichnis extern wegsynchronisieren.
 */

import { mkdirSync, existsSync, createReadStream, createWriteStream, readdirSync, statSync, unlinkSync } from 'node:fs'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { join, dirname } from 'node:path'
import Database from 'better-sqlite3'
import db, { DB_PATH } from '../db.js'
import { reportAlert } from '../alerting.js'
import logger from '../logger.js'

export const BACKUP_DIR  = process.env.SQLITE_BACKUP_DIR || join(dirname(DB_PATH), 'backups')

if (!process.env.SQLITE_BACKUP_DIR && process.env.NODE_ENV === 'production') {
  logger.warn(
    { backupDir: BACKUP_DIR },
    'SQLITE_BACKUP_DIR nicht gesetzt — Backups liegen auf demselben Volume wie die DB ' +
    'und schuetzen NICHT gegen Volume-/Hostverlust. Separates Volume/Offsite-Sync einrichten (docs/OPS.md).'
  )
}
const KEEP_COUNT  = Math.max(1, parseInt(process.env.SQLITE_BACKUP_KEEP ?? '7', 10) || 7)
// Zusätzliche Sicherungen (von Hand, vor dem Wiederherstellen): höchstens so viele je Anlass.
// Eigene Rotation je Anlass, damit weder viele Handsicherungen die Sicherheitskopie vor einem
// Wiederherstellen verdrängen noch die täglichen Stände angetastet werden – und der
// Platzbedarf begrenzt bleibt (7 täglich + 2 × 5 zusätzlich = höchstens 22 Dateien: die vor-wiederherstellung-Kopien behalten zusätzlich die erste jedes Tages).
const EXTRA_KEEP_COUNT = Math.max(1, parseInt(process.env.SQLITE_BACKUP_EXTRA_KEEP ?? '5', 10) || 5)
export const BACKUP_ANLAESSE = Object.freeze(['manuell', 'vor-wiederherstellung'])
const FILE_PATTERN = /^signifikation-\d{4}-\d{2}-\d{2}\.db\.gz$/
// signifikation-2026-10-23-1436-manuell.db.gz (Uhrzeit in Berliner Zeit; 6 Stellen nur bei Namensgleichheit)
const EXTRA_PATTERN = /^signifikation-(\d{4}-\d{2}-\d{2})-(\d{4}(?:\d{2}(?:\d{3})?)?)-(manuell|vor-wiederherstellung)\.db\.gz$/
// Reste eines Laufs: die temporäre Kopie und ihre SQLite-Nebendateien. Die
// Integritätsprüfung öffnet die Kopie und legt dabei -shm/-wal an; die blieben
// bis Oktober 2026 nach jedem Lauf liegen (leer, aber Ballast).
const TMP_PATTERN = /^signifikation-\d{4}-\d{2}-\d{2}(?:-\d{4}(?:\d{2}(?:\d{3})?)?-(?:manuell|vor-wiederherstellung))?\.db\.tmp(-wal|-shm|-journal)?$/

// „2026-10-23“ und „143607“ in Berliner Zeit (sv-SE liefert „2026-10-23 14:36:07“).
function berlinStempel(date = new Date()) {
  const [tag, zeit] = date.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).split(' ')
  return { tag, hhmm: zeit.slice(0, 5).replace(':', ''), hhmmss: zeit.replaceAll(':', ''), ms: String(date.getMilliseconds()).padStart(3, '0') }
}

function removeTmp(tmpPath) {
  for (const p of [tmpPath, `${tmpPath}-wal`, `${tmpPath}-shm`, `${tmpPath}-journal`]) {
    try { unlinkSync(p) } catch { /* nicht vorhanden */ }
  }
}

// Einmal pro Tag — Spieldaten ändern sich täglich, Käufe/Accounts selten genug,
// dass 24 h maximaler Datenverlust akzeptabel ist.
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000

let running = false

// Integritätsprüfung eines frisch erzeugten Backups: öffnet die Datei
// read-only und lässt SQLite `PRAGMA quick_check` laufen. Gibt 'ok' zurück
// (alles gut) oder eine Fehlerbeschreibung. Ein korruptes Backup ist
// schlimmer als ein fehlendes — es wiegt in falscher Sicherheit.
export function verifyBackupIntegrity(path) {
  let probe
  try {
    probe = new Database(path, { readonly: true, fileMustExist: true })
    // simple:true → erste Spalte der ersten Zeile ('ok' oder Fehlertext).
    return probe.pragma('quick_check', { simple: true })
  } catch (err) {
    return `quick_check warf: ${err?.message || err}`
  } finally {
    try { probe?.close() } catch { /* schon zu / nie geöffnet */ }
  }
}

/**
 * Zusätzliche Sicherungen, älteste zuerst – nach Änderungszeit, nicht nach Name. Die Namen tragen Berliner
 * Ortszeit: In der Nacht der Zeitumstellung (Winterzeit) kommt 02:30 zweimal vor, die spätere Kopie hätte den
 * kleineren Namen und würde als ältere gelöscht. Bei gleicher Zeit entscheidet der Name.
 */
function nachAlter(dir, dateien) {
  const zeit = (f) => { try { return statSync(join(dir, f)).mtimeMs } catch { return 0 } }
  return dateien.map(f => [f, zeit(f)]).sort(([fa, ma], [fb, mb]) => ma - mb || (fa < fb ? -1 : 1)).map(([f]) => f)
}

/**
 * Welche zusätzlichen Sicherungen (aufsteigend nach Alter sortiert) die Rotation löscht.
 * Behalten werden immer die `keep` neuesten. Bei `ersteJedesTages` zusätzlich die erste Kopie der `keep`
 * neuesten Tage: Wer an einem Tag mehrmals wiederherstellt (andere Datei gewählt, Fehlversuch), würde sonst
 * mit der sechsten Kopie die allererste verdrängen – und die hält den Stand vor dem ersten Wiederherstellen
 * dieses Tages, also den wertvollsten. Höchstens 2 × keep Dateien je Anlass, der Platzbedarf bleibt begrenzt.
 */
export function zuLoeschen(dateien, keep, ersteJedesTages = false) {
  const behalten = new Set(dateien.slice(Math.max(0, dateien.length - keep)))
  if (ersteJedesTages) {
    const ersteJeTag = new Map()
    for (const f of dateien) {
      const tag = EXTRA_PATTERN.exec(f)?.[1]
      if (tag && !ersteJeTag.has(tag)) ersteJeTag.set(tag, f)
    }
    for (const [, datei] of [...ersteJeTag.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, keep)) behalten.add(datei)
  }
  return dateien.filter(f => !behalten.has(f))
}

// Zusätzliche Sicherungen zusätzlich nach Alter: Die Anzahlgrenze allein hält
// eine einzelne Handsicherung beliebig lange – samt gelöschter Konten. Die
// Datenschutzerklärung verspricht, dass gelöschte Daten nach 7 Tagen aus den
// Sicherungen verschwinden; deshalb dieselbe Frist wie die täglichen Stände.
// Aufgerufen aus dem täglichen Retention-Sweep (dataRetention.js).
export const ZUSATZ_MAX_AGE_MS = KEEP_COUNT * 24 * 60 * 60 * 1000

export function loescheAlteZusatzSicherungen({ dir = BACKUP_DIR, now = Date.now(), maxAgeMs = ZUSATZ_MAX_AGE_MS } = {}) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return 0 // noch kein Backup-Verzeichnis
  }
  let removed = 0
  for (const f of names) {
    if (!EXTRA_PATTERN.test(f)) continue
    try {
      if (statSync(join(dir, f)).mtimeMs < now - maxAgeMs) {
        unlinkSync(join(dir, f))
        removed += 1
      }
    } catch (err) {
      logger.warn({ err, file: f }, 'Zusatz-Sicherung konnte nicht geprueft/geloescht werden')
    }
  }
  return removed
}

/**
 * Sichert die komplette Datenbank als .db.gz.
 *
 * @param {object} [opts]
 * @param {string} [opts.dir]       Zielordner
 * @param {number} [opts.keep]      Anzahl täglicher Stände
 * @param {number} [opts.extraKeep] Anzahl zusätzlicher Stände je Anlass
 * @param {'manuell'|'vor-wiederherstellung'|null} [opts.anlass]
 *   ohne Anlass: die tägliche Sicherung (signifikation-JJJJ-MM-TT.db.gz, wird am selben Tag überschrieben).
 *   mit Anlass: eigene Datei mit Uhrzeit (signifikation-JJJJ-MM-TT-HHMM-<anlass>.db.gz), die die
 *   tägliche Sicherung nie überschreibt und eigenen Rotationsregeln folgt (höchstens extraKeep je Anlass).
 */
export async function runSqliteBackup({ dir = BACKUP_DIR, keep = KEEP_COUNT, extraKeep = EXTRA_KEEP_COUNT, anlass = null } = {}) {
  if (anlass !== null && !BACKUP_ANLAESSE.includes(anlass)) {
    throw new Error(`Unbekannter Backup-Anlass: ${anlass}`)
  }
  if (running) return { skipped: true }
  running = true
  try {
    mkdirSync(dir, { recursive: true })

    let base
    if (anlass) {
      const s = berlinStempel()
      base = `signifikation-${s.tag}-${s.hhmm}-${anlass}`
      // Zweimal in derselben Minute (oder Sekunde): nicht überschreiben, sondern Sekunden (dann Millisekunden) anhängen.
      for (const zeit of [s.hhmmss, `${s.hhmmss}${s.ms}`]) {
        if (!existsSync(join(dir, `${base}.db.gz`))) break
        base = `signifikation-${s.tag}-${zeit}-${anlass}`
      }
    } else {
      base = `signifikation-${new Date().toISOString().slice(0, 10)}`
    }
    const tmpPath   = join(dir, `${base}.db.tmp`)
    const finalPath = join(dir, `${base}.db.gz`)

    const started = Date.now()
    try {
      await db.backup(tmpPath)
    } catch (err) {
      // Zum Beispiel Platte voll: sonst bliebe eine halbe Kopie samt -wal/-shm liegen
      removeTmp(tmpPath)
      throw err
    }

    // Frisches Backup verifizieren, BEVOR es komprimiert + behalten wird.
    // gzip ist verlustfrei → ist tmpPath integer, ist es auch das .gz. Bei
    // Korruption: Datei verwerfen + laut alerten, statt sie still abzulegen.
    const integrity = verifyBackupIntegrity(tmpPath)
    if (integrity !== 'ok') {
      removeTmp(tmpPath)
      logger.error({ integrity, tmpPath }, 'SQLite-Backup-Integritätsprüfung fehlgeschlagen — Backup verworfen')
      reportAlert('backup_integrity_failed', `Backup quick_check fehlgeschlagen: ${integrity}`)
      return { integrityFailed: true, detail: integrity }
    }

    try {
      await pipeline(createReadStream(tmpPath), createGzip(), createWriteStream(finalPath))
    } catch (err) {
      // z. B. Disk voll: sonst bleibt die unkomprimierte .tmp-Kopie liegen (die
      // Rotation matcht nur .db.gz) und füllt bei Wiederholung das Volume.
      removeTmp(tmpPath)
      try { unlinkSync(finalPath) } catch { /* evtl. Teil-Datei */ }
      throw err
    }
    removeTmp(tmpPath)

    // Rotation: nur eigene Backup-Dateien anfassen, älteste zuerst löschen.
    // Tägliche und zusätzliche Sicherungen rotieren getrennt (je Anlass eigene Grenze):
    // So verdrängen Handsicherungen weder die täglichen Stände noch die Sicherheitskopie
    // vor einem Wiederherstellen, und der Platzbedarf bleibt begrenzt.
    const names = readdirSync(dir)
    const daily = names.filter(f => FILE_PATTERN.test(f)).sort()
    const toDelete = daily.slice(0, Math.max(0, daily.length - keep))
    for (const a of BACKUP_ANLAESSE) {
      const extra = nachAlter(dir, names.filter(f => EXTRA_PATTERN.exec(f)?.[3] === a))
      toDelete.push(...zuLoeschen(extra, extraKeep, a === 'vor-wiederherstellung'))
    }
    // Liegengebliebene Reste früherer Läufe (siehe TMP_PATTERN) gleich mit.
    toDelete.push(...names.filter(f => TMP_PATTERN.test(f)))
    for (const f of toDelete) {
      try { unlinkSync(join(dir, f)) } catch { /* Rotation darf das Backup nie scheitern lassen */ }
    }

    const sizeBytes = statSync(finalPath).size
    const result = { file: finalPath, sizeBytes, durationMs: Date.now() - started, deleted: toDelete.length, anlass: anlass || 'taeglich' }
    logger.info(result, 'SQLite-Backup erstellt')
    return result
  } finally {
    running = false
  }
}

/** Läuft gerade eine Sicherung? (Für Anzeige und Doppelstart-Schutz) */
export function sicherungLaeuft() {
  return running
}

/**
 * Alle Sicherungen im Ordner, neueste zuerst.
 * anlass: 'taeglich' | 'manuell' | 'vor-wiederherstellung'
 */
export function listSqliteBackups({ dir = BACKUP_DIR } = {}) {
  let names = []
  try {
    names = readdirSync(dir)
  } catch {
    return [] // Verzeichnis existiert noch nicht — noch kein Backup gelaufen
  }
  const eintraege = []
  for (const f of names) {
    const anlass = FILE_PATTERN.test(f) ? 'taeglich' : EXTRA_PATTERN.exec(f)?.[3]
    if (!anlass) continue
    try {
      const { size, mtimeMs } = statSync(join(dir, f))
      eintraege.push({ file: f, sizeBytes: size, mtimeMs, anlass })
    } catch { /* zwischen readdir und stat rotiert */ }
  }
  // Neueste zuerst; die tägliche Datei wird am selben Tag überschrieben, ihre Änderungszeit gilt.
  eintraege.sort((x, y) => y.mtimeMs - x.mtimeMs || (x.file < y.file ? 1 : -1))
  return eintraege.map(({ file, sizeBytes, mtimeMs, anlass }) => ({
    file, sizeBytes, modifiedAt: new Date(mtimeMs).toISOString(), anlass,
  }))
}

export function startSqliteBackup(options = {}) {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  // Lief gerade eine Sicherung von Hand, wird der tägliche Lauf übersprungen: nicht still, sondern später nachholen
  const retryMs = options.retryMs ?? 5 * 60 * 1000
  const maxRetries = options.maxRetries ?? 3
  const { intervalMs: _i, retryMs: _r, maxRetries: _m, ...runOptions } = options

  const run = (versuch = 0) => {
    runSqliteBackup(runOptions).then(result => {
      if (!result?.skipped) return
      if (versuch >= maxRetries) {
        logger.error({ versuch }, 'Täglicher SQLite-Backup-Lauf übersprungen und nicht nachgeholt')
        reportAlert('backup_failed', 'Täglicher SQLite-Backup-Lauf wurde mehrfach übersprungen (andere Sicherung lief).')
        return
      }
      logger.warn({ versuch, retryInMs: retryMs }, 'Täglicher SQLite-Backup-Lauf übersprungen (andere Sicherung läuft) – neuer Versuch folgt')
      setTimeout(() => run(versuch + 1), retryMs).unref()
    }).catch(err => {
      logger.error({ err }, 'SQLite-Backup fehlgeschlagen')
      reportAlert('backup_failed', `SQLite-Backup fehlgeschlagen: ${err?.message || err}`)
    })
  }

  run() // direkt beim Start: deckt auch Server, die selten 24 h durchlaufen
  const interval = setInterval(() => run(), intervalMs)
  interval.unref()
  return interval
}

export default startSqliteBackup
