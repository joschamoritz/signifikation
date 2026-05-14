import { normalizeKalenderShape } from '../store-daily-content.js'
import { normalizeDatumToIso } from '../date-utils.js'

function normalizeDateKeyedMap(raw) {
  const result = {}
  for (const [datum, value] of Object.entries(raw || {})) {
    const isoDatum = normalizeDatumToIso(datum)
    if (!isoDatum) continue
    result[isoDatum] = value
  }
  return result
}

/**
 * Konvertiert das alte aggregierte stats.json-Format (datum → spiel → {plays,...})
 * in das aktuelle Zeilen-Array-Format, falls nötig.
 */
function flattenLegacyStatsFormat(statsObj) {
  const rows = []
  for (const [datum, games] of Object.entries(statsObj)) {
    if (!games || typeof games !== 'object') continue
    for (const [spiel, v] of Object.entries(games)) {
      if (!v || typeof v !== 'object') continue
      rows.push({
        datum,
        spiel,
        user_id:  v.user_id  ?? '',
        plays:    v.plays    ?? 0,
        scoreSum: v.scoreSum ?? 0,
        maxSum:   v.maxSum   ?? 0,
        dist:     Array.isArray(v.dist) ? v.dist : [],
      })
    }
  }
  return rows
}

function normalizeStatsRows(rows) {
  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      throw new Error('Ungueltige Stats-Zeile im Backup')
    }

    const isoDatum = normalizeDatumToIso(row.datum)
    if (!isoDatum) {
      throw new Error('Stats-Zeile mit ungueltigem datum im Backup')
    }

    return { ...row, datum: isoDatum }
  })
}

export function sanitizeBackupBundle(payload) {
  if (!payload || typeof payload !== 'object' || !payload.files || typeof payload.files !== 'object') {
    throw new Error('Ungültiges Backup-Format')
  }

  const files = payload.files
  const lemmata = Array.isArray(files['lemmata.json']) ? files['lemmata.json'] : []
  const rawKalender = files['kalender.json'] && typeof files['kalender.json'] === 'object' ? files['kalender.json'] : {}
  // Alte Backup-Formate (datum → id[]) auf neue Shape (datum → { ids, thema }) normalisieren
  const kalender = normalizeDateKeyedMap(normalizeKalenderShape(rawKalender))
  const wortzwilling = normalizeDateKeyedMap(files['wortzwilling.json'] && typeof files['wortzwilling.json'] === 'object' ? files['wortzwilling.json'] : {})
  const zeitenwende = normalizeDateKeyedMap(files['zeitenwende.json'] && typeof files['zeitenwende.json'] === 'object' ? files['zeitenwende.json'] : {})

  const rawStatsRows = (() => {
    if (Array.isArray(files['stats-rows.json'])) return files['stats-rows.json']
    if (Array.isArray(files['stats.json'])) return files['stats.json']
    // Altes Format: { datum: { spiel: { plays, ... } } } → in Zeilen-Array konvertieren
    if (files['stats.json'] && typeof files['stats.json'] === 'object') {
      return flattenLegacyStatsFormat(files['stats.json'])
    }
    return []
  })()
  const statsRows = normalizeStatsRows(rawStatsRows)

  return { lemmata, kalender, wortzwilling, zeitenwende, statsRows }
}
