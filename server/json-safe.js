/**
 * server/json-safe.js
 *
 * Toleranter JSON-Parser für die TEXT-Felder der DB (settings_json, lemma_ids,
 * content_snapshot, detail_json, kalender, …): bei ungültigem JSON Fallback +
 * Warnung, statt zu werfen.
 *
 * EINE Quelle — vorher 4× parallel definiert (server/classroom/json-safe.js,
 * store-stats.js [als `parseJson`, OHNE null-Guard], store-daily-content.js,
 * store-lemmata.js). store-stats fehlte der Guard und hieß anders.
 *
 * Flexible Signatur, damit beide bestehenden Aufrufkonventionen OHNE Änderung
 * der Call-Sites funktionieren:
 *   parseJsonSafe(value, fallback, context)          ← classroom-Stil (Modul-Logger)
 *   parseJsonSafe(value, fallback, logger, context)  ← store-Stil (Logger injiziert)
 * Der Logger wird daran erkannt, dass das 3. Argument eine warn()-Methode hat.
 */

import defaultLogger from './logger.js'

export function parseJsonSafe(value, fallback = null, a, b) {
  const hasLogger = !!(a && typeof a.warn === 'function')
  const log       = hasLogger ? a : defaultLogger
  const context   = hasLogger ? b : a
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (err) {
    log?.warn?.({ err, context }, 'Ungueltiges JSON – Fallback verwendet')
    return fallback
  }
}
