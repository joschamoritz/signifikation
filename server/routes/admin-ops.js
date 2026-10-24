import express from 'express'
import { statSync } from 'fs'
import { basename } from 'path'
import db, { DB_PATH } from '../db.js'
import { belegeVerfuegbar } from '../belege.js'
import { getEventLoopLagMs, getEventLoopLagLastMs } from '../metrics.js'
import { wortprofilErreichbar } from '../wortprofil.js'
import { pushStatus } from '../notifications/sender.js'
import { isMailConfigured } from '../mailer.js'
import { todayBerlin } from '../customLemmaQuota.js'
import { listSqliteBackups, sicherungLaeuft } from '../jobs/sqliteBackup.js'

function getProcessFingerprint() {
  return {
    pid: process.pid,
    startedAt: new Date(Date.now() - Math.floor(process.uptime() * 1000)).toISOString(),
    appVersion: process.env.npm_package_version || null,
  }
}

// Hintergrund-Job-Status für die Kurs-PDF-Neugenerierung. Playwright/Chromium
// dauert 1–2 min → der Request darf nicht blockieren; der Job läuft asynchron,
// das Admin-Panel pollt /admin/course/pdf-status. Modul-Singleton (1 Prozess).
const coursePdfJob = {
  running: false, startedAt: null, finishedAt: null,
  station: null, ok: null, count: 0, error: null,
}
function coursePdfStatus() { return { ...coursePdfJob } }

/** station-Eingabe → 'all' | 1–5 | null (ungültig). */
function parseStationArg(raw) {
  if (raw == null || raw === 'all') return 'all'
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

const countStatsRowsStmt = db.prepare(`
  SELECT
    COUNT(*) AS totalRows,
    SUM(CASE WHEN user_id != '' THEN 1 ELSE 0 END) AS identifiedRows,
    SUM(plays) AS totalPlays
  FROM stats
`)

const countClassroomSessionsStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM classroom_session
`)

const countUsersStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM user
`)

// Systemzustand: nur billige Abfragen (je ein SELECT über Index bzw. Kleinsttabelle).
const pingAppDbStmt = db.prepare('SELECT 1 AS ok')
const letzterProtokollEintragStmt = db.prepare('SELECT MAX(timestamp) AS zuletzt FROM audit_log')
// Wort der Woche für die Werkzeuge-Übersicht: die laufende, sonst die nächste (eine Zeile über den Index auf bis/von)
const naechsteSpezialwocheStmt = db.prepare('SELECT woche, von, lemma_id FROM spezialwochen WHERE bis >= ? ORDER BY von LIMIT 1')
// Kursmaterial: Zeitpunkt der letzten Erzeugung (Millisekunden) und Stand je Station
const kursMaterialZuletztStmt = db.prepare(`
  SELECT MAX(COALESCE(updated_at, created_at)) AS zuletzt
  FROM course_materials
  WHERE source = 'static'
`)
const kursMaterialStationenStmt = db.prepare(`
  SELECT station_id AS station, COUNT(*) AS anzahl, MAX(COALESCE(updated_at, created_at)) AS zuletzt
  FROM course_materials
  WHERE source = 'static'
  GROUP BY station_id
  ORDER BY station_id
`)

function appDbStatus() {
  try {
    return pingAppDbStmt.get()?.ok === 1 ? 'ok' : 'error: Abfrage fehlgeschlagen'
  } catch {
    return 'error: Abfrage fehlgeschlagen'
  }
}

// Neueste TÄGLICHE Sicherung (nur sie zählt für „Sicherung zu alt“; Handsicherungen ersetzen sie nicht)
function sicherungStatus() {
  try {
    const taeglich = listSqliteBackups().filter((b) => b.anlass === 'taeglich')
    return { zuletzt: taeglich[0]?.modifiedAt ?? null, anzahl: taeglich.length, laeuft: sicherungLaeuft() }
  } catch {
    return { zuletzt: null, anzahl: 0, laeuft: false }
  }
}

export function createAdminOpsRouter({
  adminLimiter,
  requireAuth,
  loadKalender,
  getCacheMetrics,
  getQueryCacheMetrics,
  clearQueryCache,
  leereLueckenfuellerCache = () => {},
  adminError,
  logger,
}) {
  const router = express.Router()

  router.get('/admin/performance', adminLimiter, requireAuth, (_req, res) => {
    try {
      const queryCache = getQueryCacheMetrics()
      const belegeCache = getCacheMetrics()
      const statsRows = countStatsRowsStmt.get() || { totalRows: 0, identifiedRows: 0, totalPlays: 0 }
      const classSessions = countClassroomSessionsStmt.get()?.total || 0

      let dbSizeBytes = 0
      let walSizeBytes = 0
      try {
        dbSizeBytes = statSync(DB_PATH).size
      } catch {
        dbSizeBytes = 0
      }
      try {
        walSizeBytes = statSync(`${DB_PATH}-wal`).size
      } catch {
        walSizeBytes = 0
      }

      const userCount = countUsersStmt.get()?.total || 0

      res.json({
        uptimeSec: Math.floor(process.uptime()),
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        eventLoop: {
          lagAvgMs: getEventLoopLagMs(),
          lagLastMs: getEventLoopLagLastMs(),
        },
        process: getProcessFingerprint(),
        db: {
          // Nur der Dateiname: kein Serverpfad in der Antwort.
          datei: basename(DB_PATH),
          sizeBytes: dbSizeBytes,
          walBytes: walSizeBytes,
        },
        rows: {
          statsRows: Number(statsRows.totalRows || 0),
          identifiedStatsRows: Number(statsRows.identifiedRows || 0),
          totalPlays: Number(statsRows.totalPlays || 0),
        },
        entities: {
          users: Number(userCount || 0),
          classroomSessions: Number(classSessions || 0),
        },
        cache: {
          query: queryCache,
          belege: belegeCache,
        },
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  // Systemzustand: Ein Aufruf liefert alles, was Übersicht, Woche und Systemseite brauchen. Nur billige
  // Abfragen (Ping, readdir, zwei MAX()), keine Korpus-Abfrage. Keine Pfade, Schlüssel oder Zugangsdaten.
  router.get('/admin/health', adminLimiter, requireAuth, (_req, res) => {
    let lastEntry = null
    try {
      const kalender = loadKalender()
      const keys = Object.keys(kalender).sort()
      lastEntry = keys[keys.length - 1] || null
    } catch {
      lastEntry = null
    }

    let protokollZuletzt = null
    try { protokollZuletzt = letzterProtokollEintragStmt.get()?.zuletzt ?? null } catch { protokollZuletzt = null }
    let kursZuletzt = null
    try { kursZuletzt = kursMaterialZuletztStmt.get()?.zuletzt ?? null } catch { kursZuletzt = null }
    let spezialwoche = null
    try {
      const heute = todayBerlin()
      const sw = naechsteSpezialwocheStmt.get(heute)
      // Anzeige wie in der App: erster Buchstabe groß
      if (sw) spezialwoche = { woche: sw.woche, von: sw.von, lemma: sw.lemma_id.charAt(0).toUpperCase() + sw.lemma_id.slice(1), laeuft: sw.von <= heute }
    } catch { spezialwoche = null }
    let push = { web: false, ios: false, geraete: 0 }
    try { push = pushStatus() } catch { /* Zustand „nicht eingerichtet“ */ }

    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      process: getProcessFingerprint(),
      lastEntry,
      memMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      appDb: appDbStatus(),
      wortprofilDb: wortprofilErreichbar(),
      belegeDb: belegeVerfuegbar() ? 'ok' : 'nicht verfügbar',
      push,
      mail: { eingerichtet: isMailConfigured() },
      sicherung: sicherungStatus(),
      kursmaterial: { laeuft: coursePdfJob.running, zuletzt: kursZuletzt },
      protokoll: { zuletzt: protokollZuletzt },
      spezialwoche,
    })
  })

  router.get('/admin/cache-metrics', adminLimiter, requireAuth, (_req, res) => {
    try {
      const belegeCache = getCacheMetrics()
      const queryCache = getQueryCacheMetrics()
      res.json({
        belege: belegeCache,
        queryResults: queryCache,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      adminError(res, err)
    }
  })

  router.post('/admin/cache-clear', adminLimiter, requireAuth, (_req, res) => {
    try {
      clearQueryCache()
      leereLueckenfuellerCache()
      logger.info('Alle Query-Caches geleert')
      res.json({ ok: true, message: 'Query-Cache geleert' })
    } catch (err) {
      adminError(res, err)
    }
  })

  // ── Kurs-PDFs neu generieren (Arbeitsblatt/Lösung/Entwurf/Beamer) ──────
  router.get('/admin/course/pdf-status', adminLimiter, requireAuth, (_req, res) => {
    let stationen = []
    try { stationen = kursMaterialStationenStmt.all() } catch { stationen = [] }
    res.json({ ...coursePdfStatus(), stationen })
  })

  router.post('/admin/course/regenerate-pdfs', adminLimiter, requireAuth, (req, res) => {
    if (coursePdfJob.running) {
      return res.status(409).json({ error: 'PDF-Generierung läuft bereits.', status: coursePdfStatus() })
    }
    const station = parseStationArg(req.body?.station)
    if (station === null) {
      return res.status(400).json({ error: 'station muss 1–5 oder "all" sein.' })
    }

    // Job-State setzen und SOFORT antworten – die eigentliche Erzeugung läuft im
    // Hintergrund (Playwright/Chromium), damit kein Request-/Proxy-Timeout greift.
    coursePdfJob.running = true
    coursePdfJob.startedAt = Date.now()
    coursePdfJob.finishedAt = null
    coursePdfJob.station = station
    coursePdfJob.ok = null
    coursePdfJob.count = 0
    coursePdfJob.error = null
    res.status(202).json({ ok: true, message: 'PDF-Generierung gestartet.', status: coursePdfStatus() })

    // Boot-sicherer dynamischer Import: Playwright wird erst hier (lazy) geladen,
    // nie beim Server-Start. register=true → course_materials werden aktualisiert.
    ;(async () => {
      try {
        const { generateStationPdfs } = await import('../course/pdf/generate.js')
        const manifest = await generateStationPdfs({ stationNo: station, register: true })
        coursePdfJob.ok = true
        coursePdfJob.count = manifest.length
        logger.info({ station, count: manifest.length }, 'admin: Kurs-PDFs neu generiert + registriert')
      } catch (err) {
        coursePdfJob.ok = false
        coursePdfJob.error = err.message
        logger.error({ err, station }, 'admin: Kurs-PDF-Generierung fehlgeschlagen')
      } finally {
        coursePdfJob.running = false
        coursePdfJob.finishedAt = Date.now()
      }
    })()
  })

  return router
}
