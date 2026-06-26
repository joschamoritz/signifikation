/**
 * routes/course.js – Kurs-API unter /api/v1/course/*
 *
 * Zugangsmodell (Entscheidung 2026-06-25): „Üben frei (Login), Material Premium".
 *   - Stationen + Üben + Fortschritt: requireAuthUser (jede eingeloggte Rolle,
 *     auch Basic) → Persistenz/Sperre ans Konto gebunden.
 *   - Material, Worksheet, Eigenes-Lemma (lemma=…/lemma/validate): requirePremium
 *     bzw. Premium-Check im Handler — Premium-Nutzen = Lehrmaterial + Extras.
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
  courseLemmaValidateSchema,
  courseWorksheetQuerySchema,
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
import { validateCustomLemma } from '../customLemma.js'
import { buildStationHtml } from '../course/pdf/generate.js'
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

/**
 * Wortart, die die corpus-template-Items der Station erwarten (für die
 * Eigenes-Lemma-Eignungsprüfung + Auflösung). Station ① = Substantiv.
 */
function stationCorpusPos(items) {
  const corpusItem = items.find(i => i.source === 'corpus-template' && i.corpusQuery?.pos)
  return corpusItem?.corpusQuery?.pos ?? 'Substantiv'
}

/** GET /stations/:id/tasks – Aufgaben-Items, optional nach Niveau/Format/Lemma. */
router.get(
  `${BASE}/stations/:id/tasks`,
  requireAuthUser,
  validate(courseStationIdParamsSchema, 'params'),
  validate(courseTasksQuerySchema, 'query'),
  async (req, res) => {
    try {
      const station = courseStore.getStation(req.params.id)
      if (!station) return res.status(404).json({ error: 'Station nicht gefunden' })
      const tasks = courseStore.listTasks(req.params.id, {
        level:  req.query.level,
        format: req.query.format,
      })

      // Ohne resolve=interactive → Rohtasks (Druck-/Debug-Pfad, kein Lemma).
      if (req.query.resolve !== 'interactive') {
        return res.json({ stationId: req.params.id, level: req.query.level ?? null, tasks })
      }

      // resolve=interactive: Direktiven + Platzhalter serverseitig auflösen
      // (Korpus liegt nur am Server). selected/chosen + onWrong/onChoice bleiben
      // erhalten — der Client füllt die Auswahl.
      const items = tasks.map(t => courseStore.taskToEngineItem(t))
      let lemma // undefined = Anker-Lemma aus dem Content

      // „Eigenes Lemma" (AP9): Template mit gewähltem Wort füllen. Bleibt
      // Premium-Feature — die Route selbst ist frei (requireAuthUser), aber der
      // lemma-Pfad ist Premium-gegated; kein Verbrauch des Basic-Kontingents.
      if (req.query.lemma) {
        if (req.user.role !== 'premium' && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Eigenes Lemma ist Teil der Gesamtausgabe' })
        }
        const pos = req.query.pos ?? stationCorpusPos(items)
        const verdict = await validateCustomLemma({ mode: 'kollokationen', q: req.query.lemma, pos })
        if (!verdict.usable) {
          return res.status(422).json({ error: verdict.reason, usable: false, lemma: req.query.lemma })
        }
        lemma = req.query.lemma
      }

      const corpus = makeCorpusAdapter()
      const resolved = items.map(i => resolveItemInteractive(i, { corpus, lemma }))
      res.json({
        stationId: req.params.id,
        level: req.query.level ?? null,
        lemma: lemma ?? null,
        tasks: resolved,
      })
    } catch (err) {
      logger.error({ err, id: req.params.id }, 'Kurs: Tasks laden fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/**
 * GET /lemma/validate?q=&pos= – Eignungsprüfung fürs Eigenes-Lemma-Template
 * (Premium). Spiegelt die Spiel-Validierung (≥10 Kollokationen); ohne pos wird
 * die Wortart automatisch erkannt. Verbraucht KEIN Kontingent.
 */
router.get(
  `${BASE}/lemma/validate`,
  requirePremium,
  validate(courseLemmaValidateSchema, 'query'),
  async (req, res) => {
    try {
      const verdict = await validateCustomLemma({ mode: 'kollokationen', q: req.query.q, pos: req.query.pos })
      res.json({ usable: verdict.usable, pos: verdict.pos ?? null, count: verdict.count ?? 0, reason: verdict.reason })
    } catch (err) {
      logger.error({ err, q: req.query.q }, 'Kurs: Lemma-Validierung fehlgeschlagen')
      serverError(res, err)
    }
  },
)

/**
 * GET /stations/:id/worksheet?lemma=&level=&kind= – Eigenes-Lemma-Arbeitsblatt
 * (bzw. Lösung) als druckbares HTML, live aus dem Korpus gefüllt (Premium).
 *
 * Bewusst HTML, NICHT PDF: die PDF-Pipeline (AP5) braucht Chromium, das im
 * Server-Runtime nie geladen wird. buildStationHtml ist rein/synchron — die
 * Lehrkraft druckt aus dem Browser (Strg+P → PDF).
 */
router.get(
  `${BASE}/stations/:id/worksheet`,
  requirePremium,
  validate(courseStationIdParamsSchema, 'params'),
  validate(courseWorksheetQuerySchema, 'query'),
  async (req, res) => {
    try {
      // buildStationHtml nutzt aktuell den Content von Station ① (station-1.js).
      if (req.params.id !== 's1') {
        return res.status(404).json({ error: 'Für diese Station gibt es noch kein Eigenes-Lemma-Arbeitsblatt' })
      }
      const verdict = await validateCustomLemma({ mode: 'kollokationen', q: req.query.lemma, pos: 'Substantiv' })
      if (!verdict.usable) {
        return res.status(422).json({ error: verdict.reason, usable: false })
      }

      const kind = req.query.kind ?? 'arbeitsblatt'
      const docs = buildStationHtml({ lemma: req.query.lemma })
      const doc = docs.find(d => d.kind === kind && (!req.query.level || d.level === req.query.level))
      if (!doc) return res.status(404).json({ error: 'Arbeitsblatt für dieses Niveau nicht gefunden' })

      res.type('html').send(doc.html)
    } catch (err) {
      logger.error({ err, id: req.params.id, lemma: req.query.lemma }, 'Kurs: Eigenes-Lemma-Arbeitsblatt fehlgeschlagen')
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
