import express from 'express'
import { basename } from 'node:path'
import db from '../db.js'
import { BackupDateiFehler, BACKUP_DATEINAMEN, zaehleBundle } from './admin-backup-utils.js'

// Umfang der Inhalte, die „Inhalte als Datei“ (GET /admin/backup) und „Aus Datei wiederherstellen“ betreffen.
// Nur COUNT(*) – billig, auch bei vielen Statistik-Zeilen.
const umfangStmts = {
  lemmata: db.prepare('SELECT COUNT(*) AS n FROM lemmata'),
  kalender: db.prepare('SELECT COUNT(*) AS n FROM kalender'),
  wortzwilling: db.prepare('SELECT COUNT(*) AS n FROM wortzwilling'),
  zeitenwende: db.prepare('SELECT COUNT(*) AS n FROM zeitenwende'),
  statsRows: db.prepare('SELECT COUNT(*) AS n FROM stats'),
  statsRowsMitKonto: db.prepare(`SELECT COUNT(*) AS n FROM stats WHERE user_id != ''`),
}

export function createAdminBackupRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminBackupRestoreSchema,
  adminBackupPruefenSchema,
  adminBackupSqliteSchema,
  loadBackupFiles,
  replaceAllAdminData,
  sanitizeBackupBundle,
  auditCreate,
  auditUpdate,
  adminError,
  serverError,
  logger,
}) {
  const router = express.Router()
  const wer = (req) => ({ adminKey: req.adminSessionId || 'unknown', ip: req.ip })

  // „Jetzt sichern“: komplette Datenbank (signifikation.db → .db.gz) von Hand auslösen. Die Datei
  // trägt die Uhrzeit im Namen und überschreibt die tägliche Sicherung nie (jobs/sqliteBackup.js).
  // Läuft zusätzlich automatisch täglich. Ein laufender Vorgang (auch der tägliche) → 409.
  router.post('/admin/backup/sqlite', adminLimiter, requireAuth, validate(adminBackupSqliteSchema), async (req, res) => {
    try {
      const { runSqliteBackup } = await import('../jobs/sqliteBackup.js')
      const result = await runSqliteBackup({ anlass: 'manuell' })
      if (result.skipped) {
        return res.status(409).json({ error: 'Es läuft schon eine Sicherung. Bitte gleich noch einmal versuchen.', skipped: true })
      }
      if (result.integrityFailed) {
        return res.status(500).json({ error: 'Die Sicherung wurde verworfen: Die Prüfung der Kopie ist fehlgeschlagen.' })
      }
      const datei = basename(result.file)
      auditCreate('backup', 'sqlite', { datei, anlass: 'manuell', sizeBytes: result.sizeBytes }, wer(req))
      // Nur der Dateiname, nie der Pfad auf dem Server.
      res.json({ ok: true, datei, sizeBytes: result.sizeBytes, durationMs: result.durationMs, anlass: result.anlass })
    } catch (err) {
      // Fehlertexte von Dateisystem und SQLite nennen Serverpfade: ins Log, nicht in die Antwort
      logger?.error({ err }, 'Sicherung von Hand fehlgeschlagen')
      res.status(500).json({ error: 'Die Sicherung ist fehlgeschlagen. Einzelheiten stehen im Server-Protokoll.' })
    }
  })

  router.get('/admin/backup/sqlite', adminLimiter, requireAuth, async (req, res) => {
    try {
      const { listSqliteBackups, sicherungLaeuft } = await import('../jobs/sqliteBackup.js')
      res.json({ backups: listSqliteBackups(), laeuft: sicherungLaeuft() })
    } catch (err) { adminError(res, err) }
  })

  // Zahlen für den Vergleich „in der Datei / jetzt“ vor dem Wiederherstellen und für „Aktueller Umfang“.
  router.get('/admin/backup/umfang', adminLimiter, requireAuth, (req, res) => {
    try {
      const umfang = {}
      for (const [key, stmt] of Object.entries(umfangStmts)) umfang[key] = Number(stmt.get()?.n || 0)
      res.json(umfang)
    } catch (err) { adminError(res, err) }
  })

  // „Inhalte als Datei“: Wörter, Kalender, Wort-Zwilling, Zeitenwende, Statistik OHNE Konten.
  router.get('/admin/backup', adminLimiter, requireAuth, (req, res) => {
    try {
      res.setHeader('Content-Disposition', `attachment; filename="signifikation-inhalte-${new Date().toISOString().slice(0, 10)}.json"`)
      res.json({ exportedAt: new Date().toISOString(), files: loadBackupFiles() })
    } catch (err) { serverError(res, err) }
  })

  // Probelauf: Dieselbe Prüfung und Zählung wie beim Wiederherstellen, aber ohne Bestätigung und ohne etwas zu schreiben
  // (keine Sicherheitskopie, keine Änderung, kein Protokolleintrag). Die Vorschau im Admin-Bereich zeigt damit genau die
  // Zahlen, die der Server ersetzen würde – und nichts als „in Ordnung“, was er danach mit 400 ablehnt.
  // Der Pfad liegt unter /admin/backup/restore: Rate-Limit, Anmeldung, CSRF und die 10-MB-Grenze gelten schon davor
  // (middleware/backupRestoreVorschaltung.js, in index.js eingehängt); das Rate-Limit wird hier nicht noch einmal gezählt.
  router.post('/admin/backup/restore/pruefen', requireAuth, validate(adminBackupPruefenSchema), (req, res) => {
    try {
      const bundle = sanitizeBackupBundle(req.body)
      res.json({
        ok: true,
        zahlen: zaehleBundle(bundle, { mitStatistik: true }),
        hatStatistik: Array.isArray(bundle.statsRows),
      })
    } catch (err) {
      if (err instanceof BackupDateiFehler) return res.status(400).json({ error: err.message })
      adminError(res, err)
    }
  })

  router.post('/admin/backup/restore', requireAuth, validate(adminBackupRestoreSchema), async (req, res) => {
    let sicherheitskopie = null
    try {
      const mitStatistik = req.body.mitStatistik === true

      // 1. Datei prüfen. Unvollständige Dateien werden abgewiesen, bevor irgendetwas angefasst wird.
      let bundle
      try {
        bundle = sanitizeBackupBundle(req.body)
        if (mitStatistik && !bundle.statsRows) throw new BackupDateiFehler('Datei unvollständig: stats-rows.json fehlt')
      } catch (err) {
        if (err instanceof BackupDateiFehler) return res.status(400).json({ error: err.message })
        throw err
      }

      // 2. Sicherheitskopie der GANZEN Datenbank (Online-Backup-API, eigene Datei mit Uhrzeit). Ohne sie wird nichts geändert.
      const { runSqliteBackup } = await import('../jobs/sqliteBackup.js')
      let kopie = null
      try {
        kopie = await runSqliteBackup({ anlass: 'vor-wiederherstellung' })
      } catch (err) {
        logger?.error({ err }, 'Wiederherstellen abgebrochen: Sicherheitskopie fehlgeschlagen')
      }
      if (kopie?.skipped) {
        return res.status(409).json({ error: 'Es läuft gerade eine Sicherung. Bitte gleich noch einmal versuchen. Es wurde nichts geändert.' })
      }
      if (!kopie || kopie.integrityFailed) {
        return res.status(500).json({ error: 'Die Sicherheitskopie ist fehlgeschlagen. Es wurde nichts geändert.' })
      }
      sicherheitskopie = basename(kopie.file)

      // 3. Ersetzen (eine Transaktion). Die Statistik bleibt, solange nicht ausdrücklich verlangt.
      await replaceAllAdminData(bundle, { mitStatistik })

      const zahlen = zaehleBundle(bundle, { mitStatistik })
      auditUpdate('backup', 'restore', null, {
        exportedAt: req.body.exportedAt || null,
        // Nur bekannte Dateinamen: Die Schlüssel stammen aus einer hochgeladenen Datei
        files: Object.keys(req.body.files || {}).filter((name) => BACKUP_DATEINAMEN.includes(name)),
        zahlen,
        mitStatistik,
        sicherheitskopie,
      }, wer(req))

      res.json({
        ok: true,
        restored: zahlen,
        statistikErsetzt: mitStatistik,
        sicherheitskopie,
      })
    } catch (err) {
      // Nach der Sicherheitskopie gescheitert: Die Transaktion wurde zurückgerollt, die Daten sind unverändert.
      // Pfade und SQLite-Texte bleiben im Log.
      logger?.error({ err, sicherheitskopie }, 'Wiederherstellen fehlgeschlagen')
      res.status(500).json({
        error: sicherheitskopie
          ? `Das Wiederherstellen ist fehlgeschlagen. Es wurde nichts geändert. Die Sicherheitskopie ${sicherheitskopie} liegt auf dem Server.`
          : 'Das Wiederherstellen ist fehlgeschlagen. Es wurde nichts geändert. Einzelheiten stehen im Server-Protokoll.',
      })
    }
  })

  return router
}
