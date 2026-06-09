/**
 * server/classroom/json-safe.js
 *
 * Geteilter JSON-Parser fuer die classroom_* TEXT-Felder (settings_json,
 * lemma_ids, content_snapshot, detail_json). Frueher modul-lokal in store.js;
 * ausgelagert, damit das results/-Modul (Auswertung/Reveal) denselben
 * tolerant-loggenden Parser nutzt, ohne store.js zu importieren.
 */

import logger from '../logger.js'

export function parseJsonSafe(value, fallback, context) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (err) {
    logger.warn({ err, context }, 'Ungueltiges JSON in classroom_* – Fallback verwendet')
    return fallback
  }
}
