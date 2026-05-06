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

  const statsRows = normalizeStatsRows(
    Array.isArray(files['stats-rows.json'])
      ? files['stats-rows.json']
      : Array.isArray(files['stats.json']) ? files['stats.json'] : []
  )

  return { lemmata, kalender, wortzwilling, zeitenwende, statsRows }
}
