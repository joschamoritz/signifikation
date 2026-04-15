import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import {
  listQueuedExports,
  markExportRunning,
  markExportDone,
  markExportFailed,
  getExportRowsForSession,
} from '../classroom-store.js'
import logger from '../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = join(__dirname, '..', 'data', 'classroom-exports')

mkdirSync(EXPORT_DIR, { recursive: true })

function buildPdfFilename(sessionId, exportId) {
  return `classroom-${sessionId}-${exportId}.pdf.txt`
}

function buildSummary(rows) {
  const participantSet = new Set(rows.map(r => r.participant_id))
  const submittedRows = rows.filter(r => r.round_no != null)
  const avgScore = submittedRows.length
    ? submittedRows.reduce((acc, r) => acc + Number(r.score || 0), 0) / submittedRows.length
    : 0
  return {
    participantCount: participantSet.size,
    submissionRows: submittedRows.length,
    avgScore: Number(avgScore.toFixed(2)),
  }
}

function toPseudoPdfContent(sessionId, rows) {
  const summary = buildSummary(rows)
  const lines = [
    `Klassenraum-Session: ${sessionId}`,
    `Teilnehmende: ${summary.participantCount}`,
    `Submission-Zeilen: ${summary.submissionRows}`,
    `Durchschnittsscore: ${summary.avgScore}`,
    '',
    'Hinweis: Platzhalter-Ausgabe fuer PDF-Phase 1.',
    'Echte PDF-Generierung folgt in naechster Iteration.',
  ]
  return lines.join('\n')
}

function processOneJob(job) {
  try {
    markExportRunning({ sessionId: job.sessionId, exportId: job.id })
    const rows = getExportRowsForSession({ sessionId: job.sessionId })
    const content = toPseudoPdfContent(job.sessionId, rows)
    const filename = buildPdfFilename(job.sessionId, job.id)
    const fullPath = join(EXPORT_DIR, filename)
    writeFileSync(fullPath, content, 'utf8')
    markExportDone({ sessionId: job.sessionId, exportId: job.id, fileRef: fullPath })
    logger.info({ sessionId: job.sessionId, exportId: job.id }, 'PDF-Export (Platzhalter) erstellt')
  } catch (err) {
    logger.error({ err, sessionId: job.sessionId, exportId: job.id }, 'PDF-Export fehlgeschlagen')
    markExportFailed({ sessionId: job.sessionId, exportId: job.id, errorMessage: err.message })
  }
}

export function processQueuedPdfExports(limit = 10) {
  const jobs = listQueuedExports(limit).filter(job => job.type === 'pdf')
  for (const job of jobs) processOneJob(job)
  return { processed: jobs.length }
}
