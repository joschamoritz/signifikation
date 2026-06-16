/**
 * server/classroom/json-safe.js
 *
 * Re-Export des kanonischen JSON-Parsers (server/json-safe.js). Bleibt als
 * Modul unter diesem Pfad erhalten, weil die classroom-Modi + store.js ihn so
 * importieren; die Implementierung liegt jetzt zentral (vorher 4× dupliziert).
 */
export { parseJsonSafe } from '../json-safe.js'
