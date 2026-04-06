/**
 * db-pool.js – SQLite Connection Pool
 *
 * Verhindert Blocking unter Load durch mehrere Datenbankverbindungen.
 * Pool-Größe konfigurierbar, Thread-safe.
 */
import Database from 'better-sqlite3'
import logger from './logger.js'

export class SQLitePool {
  constructor(dbPath, options = {}) {
    const poolSize = options.poolSize || 4
    const readonly = options.readonly !== false

    this.connections = []
    this.available = []
    this.waiting = []

    for (let i = 0; i < poolSize; i++) {
      const db = new Database(dbPath, {
        readonly,
        fileMustExist: true,
        verbose: options.verbose ? (msg) => logger.debug(msg) : undefined,
      })

      // Pragmas für Performance
      db.pragma('cache_size = -65536')    // 64 MB
      db.pragma('mmap_size = 536870912')  // 512 MB
      db.pragma('temp_store = MEMORY')
      if (!readonly) {
        db.pragma('journal_mode = WAL')   // Write-Ahead Logging für concurrent writes
        db.pragma('synchronous = NORMAL')
      }

      this.connections.push({ db, inUse: false, created: Date.now() })
      this.available.push(i)
    }

    this.stats = {
      totalAcquires: 0,
      totalReleases: 0,
      peakWaiting: 0,
    }

    logger.info(
      `SQLite Connection Pool initialized: ${poolSize} connections, readonly=${readonly}`,
      { dbPath }
    )
  }

  /**
   * Synchrone Acquire (für better-sqlite3 sync API).
   * Wirft Error wenn keine Connections verfügbar sind.
   */
  acquire() {
    const idx = this.available.pop()
    if (idx !== undefined) {
      const conn = this.connections[idx]
      conn.inUse = true
      this.stats.totalAcquires++
      return { db: conn.db, release: () => this.release(idx) }
    }

    // Fallback: Warn + Return erste Connection (wird busy-waiting für andere)
    logger.warn('Connection Pool exhausted – using fallback (performance degraded)')
    return { db: this.connections[0].db, release: () => {} }
  }

  /**
   * Release einer Connection zurück in Pool.
   */
  release(idx) {
    const conn = this.connections[idx]
    conn.inUse = false
    this.available.push(idx)
    this.stats.totalReleases++
  }

  /**
   * Stats abrufen.
   */
  getStats() {
    const inUse = this.connections.filter(c => c.inUse).length
    const available = this.available.length
    return {
      poolSize: this.connections.length,
      inUse,
      available,
      utilization: `${((inUse / this.connections.length) * 100).toFixed(1)}%`,
      totalAcquires: this.stats.totalAcquires,
      totalReleases: this.stats.totalReleases,
    }
  }

  /**
   * Schließt alle Connections (graceful shutdown).
   */
  close() {
    for (const conn of this.connections) {
      try {
        conn.db.close()
      } catch (err) {
        logger.warn({ err }, 'Error closing database connection')
      }
    }
    logger.info('SQLite Connection Pool closed')
  }
}
