/**
 * server/course/seed.js
 *
 * Idempotentes Seeding des kuratierten Kurs-Contents (course_stations,
 * course_tasks) aus den Content-Modulen unter ./content/.
 *
 * Der Code ist Single Source of Truth für Kurs-Inhalte (anders als Spieldaten,
 * die übers Admin-Panel kommen): es gibt keine Admin-Bearbeitung der Stationen.
 * Daher voller Resync pro Station — bei jedem Aufruf werden die Tasks der
 * Station gelöscht und aus dem Content neu eingespielt. course_progress
 * referenziert nur die Station (nicht die Tasks) und bleibt unberührt.
 *
 * Mapping Item → Spalten (Engine-Spec §10):
 *   content_json  (static)          = { prompt, metasprache, payload, display, beleg }
 *   template_json (corpus-template) = + corpusQuery, bindings
 *   rubric_json                     = { solution, feedback }
 *
 * Eager Prepared Statements sind sicher: db.js wendet die SQL-Migrationen
 * synchron beim Import an (migrate-sync.js).
 */

import db from '../db.js'
import logger from '../logger.js'
import { clearResolveCache } from './resolveCache.js'
import station1 from './content/station-1.js'
import station2 from './content/station-2.js'
import station3 from './content/station-3.js'
import station4 from './content/station-4.js'
import station5 from './content/station-5.js'

// Alle Stationen, die aus Code geseedet werden (Lernpfad ①–⑤, AP4 + AP10).
const STATIONS = [station1, station2, station3, station4, station5]

const upsertStation = db.prepare(`
  INSERT INTO course_stations (id, order_no, title, ipa, category, beamer_config_json, created_at, updated_at)
  VALUES (@id, @order_no, @title, @ipa, @category, @beamer_config_json, @now, @now)
  ON CONFLICT(id) DO UPDATE SET
    order_no           = excluded.order_no,
    title              = excluded.title,
    ipa                = excluded.ipa,
    category           = excluded.category,
    beamer_config_json = excluded.beamer_config_json,
    updated_at         = excluded.updated_at
`)

const deleteStationTasks = db.prepare('DELETE FROM course_tasks WHERE station_id = ?')

const insertTask = db.prepare(`
  INSERT INTO course_tasks
    (id, station_id, format, level, source, kern, content_json, template_json, rubric_json, position, created_at, updated_at)
  VALUES
    (@id, @station_id, @format, @level, @source, @kern, @content_json, @template_json, @rubric_json, @position, @now, @now)
`)

/** Item (Engine-Spec-Shape) → course_tasks-Spaltenwerte. */
export function itemToColumns(item, stationId, position, now) {
  const base = {
    prompt:      item.prompt,
    metasprache: item.metasprache ?? [],
    payload:     item.payload,
    display:     item.display ?? {},
    beleg:       item.beleg ?? [],
  }
  const isStatic = item.source === 'static'
  const contentBlob  = isStatic ? base : null
  const templateBlob = isStatic ? null : {
    ...base,
    corpusQuery: item.corpusQuery,
    bindings: item.bindings ?? {},
    // Fremd-Lemma-Distraktoren (optional) mit persistieren.
    ...(item.distractorQuery ? { distractorQuery: item.distractorQuery } : {}),
  }
  return {
    id:            item.id,
    station_id:    stationId,
    format:        item.format,
    level:         item.level,
    source:        item.source,
    kern:          item.kern ?? null,
    content_json:  contentBlob  ? JSON.stringify(contentBlob)  : null,
    template_json: templateBlob ? JSON.stringify(templateBlob) : null,
    rubric_json:   JSON.stringify({ solution: item.solution ?? null, feedback: item.feedback ?? null }),
    position,
    now,
  }
}

/**
 * Seedt alle Code-Stationen idempotent. Gibt { stations, tasks } zurück.
 */
export function seedCourseContent() {
  const now = Date.now()
  let stations = 0
  let tasks = 0
  const run = db.transaction(() => {
    for (const { station, tasks: items } of STATIONS) {
      upsertStation.run({
        id:                 station.id,
        order_no:           station.orderNo,
        title:              station.title,
        ipa:                station.ipa ?? null,
        category:           station.category ?? null,
        beamer_config_json: JSON.stringify(station.beamerConfig ?? {}),
        now,
      })
      stations += 1
      deleteStationTasks.run(station.id) // voller Resync (Code = Single Source)
      items.forEach((item, i) => {
        insertTask.run(itemToColumns(item, station.id, i, now))
        tasks += 1
      })
    }
  })
  run()
  clearResolveCache() // Tasks neu eingespielt → alte Auflösungen verwerfen
  logger.info({ stations, tasks }, 'Kurs-Content geseedet')
  return { stations, tasks }
}

export default seedCourseContent
