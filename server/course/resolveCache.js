/**
 * server/course/resolveCache.js
 *
 * In-Memory-Cache für aufgelöste, interaktive Kurs-Tasks (resolve=interactive).
 *
 * Warum: Der Resolve-Pfad (corpusAdapter → wortprofil.db/belege.db) macht pro
 * Stationsaufruf leicht 10–20 synchrone Korpus-/FTS5-Queries. Das Ergebnis ist
 * aber (a) nutzerunabhängig — Inhalte sind kuratiert, es gibt kein „Eigenes
 * Lemma" mehr in diesem Pfad — und (b) deterministisch (seededShuffle mit
 * stabilem task.id). Der Kurs-Content wird beim Serverstart einmalig geseedet
 * (seedCourseContent(), Code = Single Source) und ändert sich pro Prozess nicht.
 *
 * Damit ist ein einfacher Map-Cache pro (stationId, level, format) korrekt und
 * dauerhaft gültig — invalidiert wird nur beim Reseed (Test/Neustart).
 */

const cache = new Map()

/** Cache-Schlüssel aus Station, Niveau und Format-Filter. */
export function resolveCacheKey(stationId, level, format) {
  return `${stationId}|${level ?? ''}|${format ?? ''}`
}

export function getResolvedTasks(key) {
  return cache.get(key) ?? null
}

export function setResolvedTasks(key, value) {
  cache.set(key, value)
}

/** Nach einem Reseed aufrufen (seedCourseContent) — sonst würden alte Auflösungen weiterleben. */
export function clearResolveCache() {
  cache.clear()
}
