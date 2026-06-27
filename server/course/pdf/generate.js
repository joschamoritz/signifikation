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
import station2 from '../content/station-2.js'
import station3 from '../content/station-3.js'
import station4 from '../content/station-4.js'
import station5 from '../content/station-5.js'
import lesson1 from '../lesson/station-1.js'
import lesson2 from '../lesson/station-2.js'
import lesson3 from '../lesson/station-3.js'
import lesson4 from '../lesson/station-4.js'
import lesson5 from '../lesson/station-5.js'
import { resolveItems, resolveItem } from '../resolve.js'
import {
  renderArbeitsblattHtml,
  renderLoesungHtml,
  renderUnterrichtsentwurfHtml,
  renderBeamerHtml,
} from './html.js'

/** Stationen-Registry: Nummer → { content, lesson }. */
const STATION_MAP = new Map([
  [1, { content: station1, lesson: lesson1 }],
  [2, { content: station2, lesson: lesson2 }],
  [3, { content: station3, lesson: lesson3 }],
  [4, { content: station4, lesson: lesson4 }],
  [5, { content: station5, lesson: lesson5 }],
])

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = pathResolve(__dirname, '..', '..', 'data', 'course-pdfs')
const LEVEL_ORDER = ['DaZ', 'SekI', 'SekII', 'LK']

// makeCorpusAdapter ist nach ../corpusAdapter.js gewandert (von AP8 mitgenutzt);
// hier re-exportiert, damit AP5-Aufrufer (Tests/Skripte) stabil bleiben.
export { makeCorpusAdapter }

/**
 * Ist ein aufgelöstes corpus-template-Item inhaltsleer? (Korpus nicht verbunden
 * → leere candidates/variants/options/table → „Arbeitsblatt ohne Inhalt", AP21-QA.)
 * Nur sinnvoll für corpus-template; static-Items tragen ihren Inhalt selbst.
 */
function corpusItemIsEmpty(item) {
  const p = item.payload ?? {}
  // Payload-Form vor Format-Etikett (analog Renderer/Dispatcher):
  // Label-/Markier-Aufgaben tragen ihren Inhalt im Satz (auch wenn als F3 geführt).
  if (p.markTask) return !p.sentence
  if (Array.isArray(p.table) && Array.isArray(p.questions)) return p.table.length === 0
  switch (item.format) {
    case 'F1': return (p.candidates ?? []).length === 0
    case 'F2': return !p.sentence
    case 'F3': return (p.variants ?? []).length === 0
    case 'F4': return (p.options ?? []).length === 0
    case 'F5': return (p.table ?? []).length === 0
    default:   return false
  }
}

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
 * @param {object} [opts]
 * @param {number} [opts.stationNo]  Station-Nummer 1–5 (Shorthand; content/lesson überschreiben)
 * @param {object} [opts.content]    Expliziter Content (überschreibt stationNo-Lookup)
 * @param {object} [opts.lesson]     Explizites Lesson-Objekt (überschreibt stationNo-Lookup)
 * @param {object} [opts.corpus]     Korpus-Adapter (Default: echte DBs)
 * @param {string} [opts.lemma]      „Eigenes Lemma" (überschreibt corpusQuery.lemma)
 * @returns {Array<{ kind, level, filename, title, html }>}
 */
export function buildStationHtml({ stationNo = 1, content, lesson, corpus = makeCorpusAdapter(), lemma, strictCorpus = false } = {}) {
  const entry = STATION_MAP.get(stationNo) ?? STATION_MAP.get(1)
  if (content === undefined) content = entry.content
  if (lesson === undefined) lesson = entry.lesson
  const out = []
  const station = content.station
  const emptyCorpusItems = [] // {level, id, format} — leere Korpus-Items (Schutz)

  for (const [level, tasks] of groupByLevel(content.tasks)) {
    const items = resolveItems(tasks, { corpus, lemma })
    tasks.forEach((t, i) => {
      if (t.source === 'corpus-template' && corpusItemIsEmpty(items[i])) {
        emptyCorpusItems.push({ level, id: t.id, format: t.format })
      }
    })
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

  // Schutz gegen still leere Korpus-Arbeitsblätter (AP21-QA: Sek II/LK „keine
  // Inhalte", weil bei der Generierung die wortprofil.db nicht verbunden war).
  if (emptyCorpusItems.length) {
    const detail = emptyCorpusItems.map(e => `${e.level}/${e.id}(${e.format})`).join(', ')
    logger.warn({ stationNo: station.orderNo, emptyCorpusItems }, `course/pdf: ${emptyCorpusItems.length} Korpus-Item(s) ohne Inhalt — Korpus-DB verbunden?`)
    if (strictCorpus) {
      throw new Error(`Leere Korpus-Items beim PDF-Bau (Station ${station.orderNo}): ${detail}. wortprofil.db/belege.db verbunden? (WORTPROFIL_DB)`)
    }
  }
  return out
}

/**
 * Erzeugt + schreibt die PDFs einer Station (oder aller Stationen).
 *
 * @param {object} [opts]
 * @param {number|'all'} [opts.stationNo]  Station-Nummer 1–5 oder 'all'. Default: 1.
 * @param {string} [opts.outDir]           Zielordner (Default server/data/course-pdfs)
 * @param {string} [opts.lemma]            „Eigenes Lemma" (überschreibt corpusQuery.lemma)
 * @param {boolean} [opts.register]        course_materials-Zeilen anlegen (Default false)
 * @returns {Promise<Array<{ kind, level, filename, path, bytes }>>}
 */
export async function generateStationPdfs({ stationNo = 1, outDir = DEFAULT_OUT, lemma, register = false } = {}) {
  const stationNos = stationNo === 'all' ? [1, 2, 3, 4, 5] : [Number(stationNo)]
  mkdirSync(outDir, { recursive: true })

  const { createRenderer } = await import('./render.js')
  const renderer = await createRenderer()
  const allManifest = []
  try {
    for (const no of stationNos) {
      const entry = STATION_MAP.get(no)
      if (!entry) { logger.warn({ stationNo: no }, 'course/pdf: unbekannte Station, übersprungen'); continue }
      // strictCorpus nur für die Standard-Material-Generierung: bricht laut ab,
      // wenn ein Korpus-Item leer ist (DB nicht verbunden). „Eigenes Lemma" darf
      // einzelne leere Relationen haben → dort nur warnen.
      const docs = buildStationHtml({ stationNo: no, lemma, strictCorpus: !lemma })
      for (const doc of docs) {
        const pdf = await renderer.render(doc.html)
        const filePath = join(outDir, doc.filename)
        writeFileSync(filePath, pdf)
        allManifest.push({ kind: doc.kind, level: doc.level, filename: doc.filename, path: filePath, bytes: pdf.length, stationNo: no })
        logger.info({ filename: doc.filename, bytes: pdf.length }, 'course/pdf: geschrieben')
      }
      if (register) await registerMaterials(entry.content.station, allManifest.filter(m => m.stationNo === no))
    }
  } finally {
    await renderer.close()
  }

  return allManifest
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
