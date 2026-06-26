/**
 * routes/course.js – Kurs-API unter /api/v1/course/*
 *
 * Zugangsmodell (Entscheidung 2026-06-25): „Üben frei (Login), Material Premium".
 *   - Stationen + Üben + Fortschritt: requireAuthUser (jede eingeloggte Rolle,
 *     auch Basic) → Persistenz/Sperre ans Konto gebunden.
 *   - Material + Download: requirePremium — Premium-Nutzen = Lehrmaterial.
 * „Eigenes Lemma" (freie Wort-Eingabe) wurde 2026-06-25 entfernt: änderte die
 * kuratierten Aufgaben kaum, erzeugte ein unbrauchbares Arbeitsblatt und
 * untergrub den Kuratierungs-Anspruch. Inhalte sind ausschließlich kuratiert.
 * Kein capability-/session-basiertes Gating wie im Klassenraum — Einzelnutzer-Material.
 *
 * Endpunkte:
 *   GET  /stations                       – Lernpfad-Stationen (geordnet)
 *   GET  /stations/:id                   – Station-Detail (+ Niveaus + Materialarten)
 *   GET  /stations/:id/tasks?level&format– Aufgaben-Items nach Station (+Niveau/Format)
 *   GET  /stations/:id/materials?level&kind – Material-Liste der Station
 *   GET  /progress                       – kontobezogener Solo-Fortschritt (+ Übersicht)
 *   PUT  /progress/:stationId            – Fortschritt setzen (optional, Solo)
 *   DELETE /progress                     – Kurs-Fortschritt zurücksetzen (optional ?stationId)
 *   GET  /stations/:id/results           – Aufgaben-Ergebnisse der Station (je Konto)
 *   POST /stations/:id/tasks/:taskId/result – Ergebnis einer Aufgabe festhalten
 */

import express from 'express'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePremium, requireAuthUser } from '../middleware/userAuth.js'
import { serverError } from '../middleware/auth.js'
import {
  validate,
  courseStationIdParamsSchema,
  courseTasksQuerySchema,
  courseMaterialsQuerySchema,
  courseMaterialDownloadParamsSchema,
  courseProgressStationParamsSchema,
  courseProgressUpdateSchema,
  courseResultsQuerySchema,
  courseTaskResultParamsSchema,
  courseTaskResultBodySchema,
  courseResetQuerySchema,
} from '../middleware/validate.js'
import * as courseStore from '../course/store.js'
import { makeCorpusAdapter } from '../course/corpusAdapter.js'
import { resolveItemInteractive } from '../course/resolve.js'
import logger from '../logger.js'

const router = express.Router()

const BASE = '/api/v1/course'

// Ablage der generierten Kurs-PDFs (AP5: server/data/course-pdfs). Muss mit
// DEFAULT_OUT in server/course/pdf/generate.js übereinstimmen.
const __dirname = dirname(fileURLToPath(import.meta.url))
const PDF_DIR = pathResolve(__dirname, '..', 'data', 'course-pdfs')

/** GET /stations – alle Stationen des Lernpfads (frei, Login genügt). */
router.get(`${BASE}/stations`, requireAuthUser, (req, res) => {
  try {
    res.json({ stations: courseStore.listStations() })
  } catch (err) {
    logger.error({ err }, 'Kurs: Stationen laden fehlgeschlagen')
    serverError(res, err)
  }
})

/** GET /stations/:id – Station-Detail inkl. verfügbarer Niveaus + Materialarten. */
router.get(
  `${BASE}/stations/:id`,
  requireAuthUser,
  validate(courseStationIdParamsSchema, 'params'),
  (req, res) => {
    try {
      const station = courseStore.getStation(req.params.id)
      if (!station) return res.status(404).json({ error: 'Station nicht gefunden' })
      res.json({
        station: {
          ...station,
          levels:        courseStore.getStationLevels(station.id),
          materialKinds: courseStore.getStationMaterialKinds(station.id),
        },
      })
    } catch (err) {
      logger.error({ err, id: req.params.id }, 'Kurs: Station-Detail fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/** GET /stations/:id/tasks – Aufgaben-Items, optional nach Niveau/Format. */
router.get(
  `${BASE}/stations/:id/tasks`,
  requireAuthUser,
  validate(courseStationIdParamsSchema, 'params'),
  validate(courseTasksQuerySchema, 'query'),
  (req, res) => {
    try {
      const station = courseStore.getStation(req.params.id)
      if (!station) return res.status(404).json({ error: 'Station nicht gefunden' })
      const tasks = courseStore.listTasks(req.params.id, {
        level:  req.query.level,
        format: req.query.format,
      })

      // Ohne resolve=interactive → Rohtasks (Druck-/Debug-Pfad).
      if (req.query.resolve !== 'interactive') {
        return res.json({ stationId: req.params.id, level: req.query.level ?? null, tasks })
      }

      // resolve=interactive: Direktiven + Platzhalter serverseitig auflösen
      // (Korpus liegt nur am Server). selected/chosen + onWrong/onChoice bleiben
      // erhalten — der Client füllt die Auswahl. Inhalte sind kuratiert; das
      // frühere „Eigenes Lemma" (freie Wort-Eingabe) wurde entfernt.
      const items = tasks.map(t => courseStore.taskToEngineItem(t))
      const corpus = makeCorpusAdapter()
      const resolved = items.map(i => resolveItemInteractive(i, { corpus }))
      res.json({
        stationId: req.params.id,
        level: req.query.level ?? null,
        tasks: resolved,
      })
    } catch (err) {
      logger.error({ err, id: req.params.id }, 'Kurs: Tasks laden fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/** GET /stations/:id/materials – Material-Liste, optional nach Niveau/Art. */
router.get(
  `${BASE}/stations/:id/materials`,
  requirePremium,
  validate(courseStationIdParamsSchema, 'params'),
  validate(courseMaterialsQuerySchema, 'query'),
  (req, res) => {
    try {
      const station = courseStore.getStation(req.params.id)
      if (!station) return res.status(404).json({ error: 'Station nicht gefunden' })
      const materials = courseStore.listMaterials(req.params.id, {
        level: req.query.level,
        kind:  req.query.kind,
      })
      res.json({ stationId: req.params.id, materials })
    } catch (err) {
      logger.error({ err, id: req.params.id }, 'Kurs: Material laden fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/**
 * GET /stations/:id/materials/:materialId/download – PDF-Download einer
 * Material-Karte. Premium-gegated; liefert die in course_materials.file_ref
 * registrierte Datei aus PDF_DIR. Pfadsicher: nur der Basename des file_ref
 * wird verwendet (kein nutzergesteuerter Pfad).
 */
router.get(
  `${BASE}/stations/:id/materials/:materialId/download`,
  requirePremium,
  validate(courseMaterialDownloadParamsSchema, 'params'),
  (req, res) => {
    try {
      const material = courseStore.getMaterial(req.params.materialId)
      if (!material || material.stationId !== req.params.id) {
        return res.status(404).json({ error: 'Material nicht gefunden' })
      }
      if (!material.fileRef) {
        return res.status(404).json({ error: 'Für dieses Material liegt keine Datei vor' })
      }
      const filename = basename(material.fileRef) // Path-Traversal ausschließen
      const filePath = join(PDF_DIR, filename)
      if (!existsSync(filePath)) {
        return res.status(404).json({ error: 'Datei wurde noch nicht erzeugt' })
      }
      res.download(filePath, filename, (err) => {
        if (err && !res.headersSent) {
          logger.error({ err, materialId: req.params.materialId }, 'Kurs: Download fehlgeschlagen')
          res.status(500).json({ error: 'Download fehlgeschlagen' })
        }
      })
    } catch (err) {
      logger.error({ err, materialId: req.params.materialId }, 'Kurs: Download-Route fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/**
 * GET /progress – Solo-Fortschritt des Premium-Nutzers.
 *   progress: grober Stations-Status (idle/in-progress/done)
 *   summary:  je (Station, Niveau) { total, solved, attempted } für die
 *             Fortschrittsanzeige auf der Kurs-Startseite.
 */
router.get(`${BASE}/progress`, requireAuthUser, (req, res) => {
  try {
    res.json({
      progress: courseStore.getProgressForUser(req.user.id),
      summary:  courseStore.getCourseSummary(req.user.id),
    })
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Kurs: Fortschritt laden fehlgeschlagen')
    serverError(res, err)
  }
})

/**
 * DELETE /progress – Kurs-Fortschritt zurücksetzen (Ergebnisse + Status),
 * optional via ?stationId nur eine Station. Macht Station/alles neu spielbar
 * (Konto-Einstellungen). Idempotent — auch ohne vorhandene Daten 200.
 */
router.delete(
  `${BASE}/progress`,
  requireAuthUser,
  validate(courseResetQuerySchema, 'query'),
  (req, res) => {
    try {
      if (req.query.stationId && !courseStore.getStation(req.query.stationId)) {
        return res.status(404).json({ error: 'Station nicht gefunden' })
      }
      const removed = courseStore.resetCourseProgress({
        userId:    req.user.id,
        stationId: req.query.stationId ?? null,
      })
      res.json({ ok: true, removed })
    } catch (err) {
      logger.error({ err, userId: req.user?.id }, 'Kurs: Fortschritt zurücksetzen fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/** GET /stations/:id/results – Aufgaben-Ergebnisse der Station (je Konto). */
router.get(
  `${BASE}/stations/:id/results`,
  requireAuthUser,
  validate(courseStationIdParamsSchema, 'params'),
  validate(courseResultsQuerySchema, 'query'),
  (req, res) => {
    try {
      let results = courseStore.getResultsForUser(req.user.id, req.params.id)
      if (req.query.level) results = results.filter(r => r.level === req.query.level)
      res.json({ stationId: req.params.id, results })
    } catch (err) {
      logger.error({ err, userId: req.user?.id, id: req.params.id }, 'Kurs: Ergebnisse laden fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/**
 * POST /stations/:id/tasks/:taskId/result – Ergebnis einer Aufgabe festhalten.
 * Body: { level, correct: true|false|null }. attempts wird serverseitig
 * inkrementiert; correct bleibt „bestes" Resultat. Der Client sperrt eine
 * kuratierte Aufgabe nach der Abgabe (neu spielbar nur über den Profil-Reset);
 * der Server bleibt idempotent und hält schlicht das beste Ergebnis.
 *
 * „Eigenes Lemma" wird NICHT persistiert — der Client postet dort kein Ergebnis.
 */
router.post(
  `${BASE}/stations/:id/tasks/:taskId/result`,
  requireAuthUser,
  validate(courseTaskResultParamsSchema, 'params'),
  validate(courseTaskResultBodySchema, 'body'),
  (req, res) => {
    try {
      const task = courseStore.getTask(req.params.taskId)
      // Aufgabe muss existieren, zur Station gehören und die Stufe muss passen
      // (task_id ist je Niveau eindeutig) — sonst 404 statt Constraint-Fehler.
      if (!task || task.stationId !== req.params.id) {
        return res.status(404).json({ error: 'Aufgabe nicht gefunden' })
      }
      if (task.level !== req.body.level) {
        return res.status(404).json({ error: 'Aufgabe gehört nicht zu dieser Stufe' })
      }
      const result = courseStore.recordTaskResult({
        userId:    req.user.id,
        stationId: req.params.id,
        taskId:    req.params.taskId,
        level:     req.body.level,
        correct:   req.body.correct,
      })
      res.json({ result })
    } catch (err) {
      logger.error({ err, userId: req.user?.id, taskId: req.params.taskId }, 'Kurs: Ergebnis speichern fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/** PUT /progress/:stationId – Fortschritt setzen (idle/in-progress/done). */
router.put(
  `${BASE}/progress/:stationId`,
  requireAuthUser,
  validate(courseProgressStationParamsSchema, 'params'),
  validate(courseProgressUpdateSchema, 'body'),
  (req, res) => {
    try {
      // Station muss existieren (FK course_progress.station_id) → 404 statt
      // undurchsichtigem Constraint-Fehler.
      if (!courseStore.getStation(req.params.stationId)) {
        return res.status(404).json({ error: 'Station nicht gefunden' })
      }
      const progress = courseStore.upsertProgress({
        userId:    req.user.id,
        stationId: req.params.stationId,
        status:    req.body.status,
      })
      res.json({ progress })
    } catch (err) {
      logger.error({ err, userId: req.user?.id, stationId: req.params.stationId }, 'Kurs: Fortschritt speichern fehlgeschlagen')
      serverError(res, err)
    }
  },
)

export default router
