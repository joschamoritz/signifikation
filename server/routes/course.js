/**
 * routes/course.js – Kurs-API unter /api/v1/course/*
 *
 * Premium-only (Kurs-Tab-Planung §0): der gesamte Kurs-Tab ist nur mit
 * Gesamtausgabe zugänglich, NICHT für Schüler freigebbar. Daher hängt jede
 * Route an requirePremium (Premium-Gate). Es gibt KEIN capability-/session-
 * basiertes Gating wie im Klassenraum — der Kurs ist Einzelnutzer-Material.
 *
 * Endpunkte:
 *   GET  /stations                       – Lernpfad-Stationen (geordnet)
 *   GET  /stations/:id                   – Station-Detail (+ Niveaus + Materialarten)
 *   GET  /stations/:id/tasks?level&format– Aufgaben-Items nach Station (+Niveau/Format)
 *   GET  /stations/:id/materials?level&kind – Material-Liste der Station
 *   GET  /progress                       – kontobezogener Solo-Fortschritt
 *   PUT  /progress/:stationId            – Fortschritt setzen (optional, Solo)
 */

import express from 'express'
import { existsSync } from 'node:fs'
import { basename, dirname, join, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requirePremium } from '../middleware/userAuth.js'
import { serverError } from '../middleware/auth.js'
import {
  validate,
  courseStationIdParamsSchema,
  courseTasksQuerySchema,
  courseMaterialsQuerySchema,
  courseMaterialDownloadParamsSchema,
  courseProgressStationParamsSchema,
  courseProgressUpdateSchema,
} from '../middleware/validate.js'
import * as courseStore from '../course/store.js'
import logger from '../logger.js'

const router = express.Router()

const BASE = '/api/v1/course'

// Ablage der generierten Kurs-PDFs (AP5: server/data/course-pdfs). Muss mit
// DEFAULT_OUT in server/course/pdf/generate.js übereinstimmen.
const __dirname = dirname(fileURLToPath(import.meta.url))
const PDF_DIR = pathResolve(__dirname, '..', 'data', 'course-pdfs')

/** GET /stations – alle Stationen des Lernpfads. */
router.get(`${BASE}/stations`, requirePremium, (req, res) => {
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
  requirePremium,
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
  requirePremium,
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
      res.json({ stationId: req.params.id, level: req.query.level ?? null, tasks })
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

/** GET /progress – kontobezogener Solo-Fortschritt des Premium-Nutzers. */
router.get(`${BASE}/progress`, requirePremium, (req, res) => {
  try {
    res.json({ progress: courseStore.getProgressForUser(req.user.id) })
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Kurs: Fortschritt laden fehlgeschlagen')
    serverError(res, err)
  }
})

/** PUT /progress/:stationId – Fortschritt setzen (idle/in-progress/done). */
router.put(
  `${BASE}/progress/:stationId`,
  requirePremium,
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
