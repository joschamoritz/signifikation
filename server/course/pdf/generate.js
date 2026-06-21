/**
 * server/course/pdf/generate.js
 *
 * Orchestrierung der Kurs-PDF-Erzeugung (AP5): Content auflösen → HTML bauen →
 * (Playwright) rendern → als Datei ablegen → optional course_materials
 * registrieren.
 *
 * Korpus-Adapter: bindet die echten DBs (wortprofil.db via queryRelation,
 * belege.db via fetchBelegeRaw) an die reine resolve.js-Logik. Synchron
 * (better-sqlite3), passend zum 1-Prozess-Deployment.
 *
 * Datenpolitik: corpus-template-Items ziehen Werte LIVE → keine harten
 * logDice-Zahlen im Material. Fehlt wortprofil.db, werden corpus-Items leer
 * aufgelöst (Worksheet bleibt strukturell gültig, nur ohne Korpuswerte) und es
 * wird gewarnt – kein harter Abbruch der ganzen Charge.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve as pathResolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import logger from '../../logger.js'
import { makeCorpusAdapter } from '../corpusAdapter.js'
import station1 from '../content/station-1.js'
import lesson1 from '../lesson/station-1.js'
import { resolveItems, resolveItem } from '../resolve.js'
import {
  renderArbeitsblattHtml,
  renderLoesungHtml,
  renderUnterrichtsentwurfHtml,
  renderBeamerHtml,
} from './html.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = pathResolve(__dirname, '..', '..', 'data', 'course-pdfs')
const LEVEL_ORDER = ['DaZ', 'SekI', 'SekII', 'LK']

// makeCorpusAdapter ist nach ../corpusAdapter.js gewandert (von AP8 mitgenutzt);
// hier re-exportiert, damit AP5-Aufrufer (Tests/Skripte) stabil bleiben.
export { makeCorpusAdapter }

/** Tasks einer Station nach Niveau gruppieren (Reihenfolge erhalten). */
function groupByLevel(tasks) {
  const groups = new Map()
  for (const t of tasks) {
    if (!groups.has(t.level)) groups.set(t.level, [])
    groups.get(t.level).push(t)
  }
  return [...groups.entries()].sort((a, b) => LEVEL_ORDER.indexOf(a[0]) - LEVEL_ORDER.indexOf(b[0]))
}

/** Beamer-Foliensatz inkl. Datenfolie (live aus Korpus) zusammenstellen. */
function buildBeamerSlides(content, beamerSpec, corpus) {
  const slides = [...beamerSpec.slides]
  const df = beamerSpec.dataFrom
  if (df) {
    const item = content.tasks.find(t => t.id === df.itemId)
    if (item) {
      const resolved = resolveItem(item, { corpus })
      const table = resolved.payload?.table ?? []
      if (table.length) {
        const dataSlide = {
          kind: 'data', kicker: df.kicker, title: df.title,
          columns: ['verbindung', 'frequency', 'logDice'], table,
          quelle: 'Signifikation-Korpus',
        }
        const at = Math.min(df.insertAfter ?? slides.length, slides.length)
        slides.splice(at + 1, 0, dataSlide)
      } else {
        logger.warn({ itemId: df.itemId }, 'course/pdf: Beamer-Datenfolie übersprungen (keine Korpuswerte)')
      }
    }
  }
  return slides
}

/**
 * Baut alle HTML-Dokumente einer Station (ohne Rendering). Nützlich für Tests/
 * Vorschau. Nutzt den echten Korpus, sofern kein Adapter übergeben wird.
 *
 * @returns {Array<{ kind, level, filename, title, html }>}
 */
export function buildStationHtml({ content = station1, lesson = lesson1, corpus = makeCorpusAdapter(), lemma } = {}) {
  const out = []
  const station = content.station

  for (const [level, tasks] of groupByLevel(content.tasks)) {
    const items = resolveItems(tasks, { corpus, lemma })
    out.push({
      kind: 'arbeitsblatt', level, title: `Arbeitsblatt – ${station.title} (${level})`,
      filename: `station-${station.orderNo}-arbeitsblatt-${level}.pdf`,
      html: renderArbeitsblattHtml({ station, level, items, ankerLemma: lemma }),
    })
    out.push({
      kind: 'loesung', level, title: `Lösung – ${station.title} (${level})`,
      filename: `station-${station.orderNo}-loesung-${level}.pdf`,
      html: renderLoesungHtml({ station, level, items, ankerLemma: lemma }),
    })
  }

  if (lesson?.entwurf) {
    out.push({
      kind: 'unterrichtsentwurf', level: null, title: `Unterrichtsentwurf – ${lesson.entwurf.stundenthema}`,
      filename: `station-${station.orderNo}-unterrichtsentwurf.pdf`,
      html: renderUnterrichtsentwurfHtml({ entwurf: lesson.entwurf }),
    })
  }

  if (lesson?.beamer) {
    const slides = buildBeamerSlides(content, lesson.beamer, corpus)
    out.push({
      kind: 'beamer', level: null, title: `Beamer-Folien – ${station.title}`,
      filename: `station-${station.orderNo}-beamer.pdf`,
      html: renderBeamerHtml({ slides }),
    })
  }
  return out
}

/**
 * Erzeugt + schreibt die PDFs einer Station.
 *
 * @param {object} [opts]
 * @param {string} [opts.outDir]   Zielordner (Default server/data/course-pdfs)
 * @param {string} [opts.lemma]    „Eigenes Lemma" (überschreibt corpusQuery.lemma)
 * @param {boolean} [opts.register] course_materials-Zeilen anlegen (Default false)
 * @returns {Promise<Array<{ kind, level, filename, path, bytes }>>}
 */
export async function generateStationPdfs({ outDir = DEFAULT_OUT, lemma, register = false } = {}) {
  const docs = buildStationHtml({ lemma })
  mkdirSync(outDir, { recursive: true })

  const { createRenderer } = await import('./render.js')
  const renderer = await createRenderer()
  const manifest = []
  try {
    for (const doc of docs) {
      const pdf = await renderer.render(doc.html)
      const filePath = join(outDir, doc.filename)
      writeFileSync(filePath, pdf)
      manifest.push({ kind: doc.kind, level: doc.level, filename: doc.filename, path: filePath, bytes: pdf.length })
      logger.info({ filename: doc.filename, bytes: pdf.length }, 'course/pdf: geschrieben')
    }
  } finally {
    await renderer.close()
  }

  if (register) await registerMaterials(station1.station, manifest)
  return manifest
}

/**
 * Registriert erzeugte PDFs als course_materials (kind/level/file_ref, source=static).
 * Separat gehalten + lazy db-Import: Tests/Vorschau brauchen keine DB-Schreibzugriffe.
 */
export async function registerMaterials(station, manifest) {
  const db = (await import('../../db.js')).default
  const stmt = db.prepare(`
    INSERT INTO course_materials (id, station_id, kind, level, title, source, file_ref, position, created_at, updated_at)
    VALUES (@id, @station_id, @kind, @level, @title, 'static', @file_ref, @position, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      file_ref = excluded.file_ref, title = excluded.title, updated_at = excluded.updated_at
  `)
  const now = Date.now()
  manifest.forEach((m, i) => {
    const id = `${station.id}-${m.kind}${m.level ? `-${m.level}` : ''}`
    stmt.run({
      id, station_id: station.id, kind: m.kind, level: m.level ?? null,
      title: m.filename, file_ref: m.filename, position: i, now,
    })
  })
  logger.info({ count: manifest.length }, 'course/pdf: course_materials registriert')
}

export default generateStationPdfs
