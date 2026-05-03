import { normalizeKalenderShape } from '../store-daily-content.js'

export function sanitizeBackupBundle(payload) {
  if (!payload || typeof payload !== 'object' || !payload.files || typeof payload.files !== 'object') {
    throw new Error('Ungültiges Backup-Format')
  }

  const files = payload.files
  const lemmata = Array.isArray(files['lemmata.json']) ? files['lemmata.json'] : []
  const rawKalender = files['kalender.json'] && typeof files['kalender.json'] === 'object' ? files['kalender.json'] : {}
  // Alte Backup-Formate (datum → id[]) auf neue Shape (datum → { ids, thema }) normalisieren
  const kalender = normalizeKalenderShape(rawKalender)
  const wortzwilling = files['wortzwilling.json'] && typeof files['wortzwilling.json'] === 'object' ? files['wortzwilling.json'] : {}
  const zeitenwende = files['zeitenwende.json'] && typeof files['zeitenwende.json'] === 'object' ? files['zeitenwende.json'] : {}

  const statsRows = Array.isArray(files['stats-rows.json'])
    ? files['stats-rows.json']
    : Array.isArray(files['stats.json']) ? files['stats.json'] : []

  return { lemmata, kalender, wortzwilling, zeitenwende, statsRows }
}
