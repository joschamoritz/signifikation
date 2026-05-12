import { mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import {
  listQueuedExports,
  claimExportJob,
  markExportDone,
  markExportFailed,
  getExportRowsForSession,
} from '../classroom-store.js'
import logger from '../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = join(__dirname, '..', 'data', 'classroom-exports')

mkdirSync(EXPORT_DIR, { recursive: true })

function escapeCsv(value) {
  const s = value == null ? '' : String(value)
  if (!s.includes(',') && !s.includes('"') && !s.includes('\n')) return s
  return `"${s.replace(/"/g, '""')}"`
}

function toCsv(rows) {
  const header = [
    'participant_id',
    'joined_at',
    'last_seen_at',
    'left_at',
    'round_no',
    'score',
    'max_score',
    'submitted_at',
  ]
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push([
      escapeCsv(row.participant_id),
      escapeCsv(row.joined_at),
      escapeCsv(row.last_seen_at),
      escapeCsv(row.left_at),
      escapeCsv(row.round_no),
      escapeCsv(row.score),
      escapeCsv(row.max_score),
      escapeCsv(row.submitted_at),
    ].join(','))
  }
  return lines.join('\n')
}

function buildCsvFilename(sessionId, exportId) {
  return `classroom-${sessionId}-${exportId}.csv`
}

async function processOneJob(job) {
  const claimed = claimExportJob({ sessionId: job.sessionId, exportId: job.id })
  if (!claimed) {
    logger.debug({ exportId: job.id }, 'CSV-Export bereits vergeben, übersprungen')
    return
  }
  try {
    const rows = getExportRowsForSession({ sessionId: job.sessionId })
    const csv = toCsv(rows)
    const filename = buildCsvFilename(job.sessionId, job.id)
    const fullPath = join(EXPORT_DIR, filename)
    await writeFile(fullPath, csv, 'utf8')
    markExportDone({ sessionId: job.sessionId, exportId: job.id, fileRef: fullPath })
    logger.info({ sessionId: job.sessionId, exportId: job.id }, 'CSV-Export erfolgreich erstellt')
  } catch (err) {
    logger.error({ err, sessionId: job.sessionId, exportId: job.id }, 'CSV-Export fehlgeschlagen')
    markExportFailed({ sessionId: job.sessionId, exportId: job.id, errorMessage: err.message })
  }
}

export async function processQueuedCsvExports(limit = 10) {
  const jobs = listQueuedExports({ type: 'csv', limit })
  await Promise.all(jobs.map(processOneJob))
  return { processed: jobs.length }
}
