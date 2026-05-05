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
  getSessionById,
} from '../classroom-store.js'
import logger from '../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = join(__dirname, '..', 'data', 'classroom-exports')

mkdirSync(EXPORT_DIR, { recursive: true })

function buildPdfFilename(sessionId, exportId) {
  return `classroom-${sessionId}-${exportId}.pdf`
}

function escapePdfText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function aggregateParticipants(rows) {
  const byParticipant = new Map()
  for (const row of rows) {
    const id = row.participant_id
    if (!byParticipant.has(id)) {
      byParticipant.set(id, {
        participantId: id,
        joinedAt: Number(row.joined_at || 0),
        totalScore: 0,
        totalMax: 0,
        rounds: 0,
      })
    }
    const item = byParticipant.get(id)
    if (row.round_no != null) {
      item.totalScore += Number(row.score || 0)
      item.totalMax += Number(row.max_score || 0)
      item.rounds += 1
    }
  }
  return [...byParticipant.values()].sort((a, b) => a.joinedAt - b.joinedAt)
}

function buildDistribution(participants) {
  const buckets = Array(11).fill(0)
  for (const p of participants) {
    const pct = p.totalMax > 0 ? (p.totalScore / p.totalMax) * 100 : 0
    const idx = clamp(Math.round(pct / 10), 0, 10)
    buckets[idx] += 1
  }
  return buckets
}

function buildReportLines(sessionId, rows) {
  const session = getSessionById({ sessionId })
  const participants = aggregateParticipants(rows)
  const withScores = participants.filter(p => p.totalMax > 0)
  const avgPercent = withScores.length
    ? withScores.reduce((acc, p) => acc + (p.totalScore / p.totalMax) * 100, 0) / withScores.length
    : 0
  const distribution = buildDistribution(participants)

  const lines = [
    'Signifikation Klassenraum Report',
    `Session ID: ${sessionId}`,
    `Datum/Lemma: ${session?.datum || '-'} / ${session?.year || '-'}`,
    `Teilnehmende (anonym): ${participants.length}`,
    `Durchschnitt: ${avgPercent.toFixed(1)}%`,
    '',
    'Ergebnistabelle (anonymisiert)',
  ]

  for (let i = 0; i < participants.length; i += 1) {
    const p = participants[i]
    const pct = p.totalMax > 0 ? (p.totalScore / p.totalMax) * 100 : 0
    lines.push(
      `Teilnehmer ${i + 1}: Runden=${p.rounds}, Score=${p.totalScore}/${p.totalMax}, ${pct.toFixed(1)}%`,
    )
  }

  lines.push('')
  lines.push('Score-Verteilung (Histogramm)')
  for (let i = 0; i < distribution.length; i += 1) {
    const from = i * 10
    const to = i === 10 ? 100 : (i * 10 + 9)
    const count = distribution[i]
    const bar = '#'.repeat(clamp(count, 0, 40))
    lines.push(`${String(from).padStart(3, ' ')}-${String(to).padStart(3, ' ')}: ${bar} (${count})`)
  }

  if (!participants.length) {
    lines.push('Keine Teilnehmenden vorhanden.')
  }

  return lines
}

function buildPdfDocument(lines) {
  const textLines = lines.length ? lines : ['Keine Daten']
  const streamLines = ['BT', '/F1 11 Tf', '72 800 Td']
  for (let i = 0; i < textLines.length; i += 1) {
    const text = escapePdfText(textLines[i])
    if (i > 0) streamLines.push('0 -14 Td')
    streamLines.push(`(${text}) Tj`)
  }
  streamLines.push('ET')
  const stream = `${streamLines.join('\n')}\n`

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}endstream\nendobj\n`,
  ]

  let offset = Buffer.byteLength('%PDF-1.4\n', 'utf8')
  const xref = ['0000000000 65535 f ']
  for (const obj of objects) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n `)
    offset += Buffer.byteLength(obj, 'utf8')
  }

  const xrefOffset = offset
  const body = objects.join('')
  const trailer = [
    `xref\n0 ${objects.length + 1}`,
    ...xref,
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
  ].join('\n')

  return Buffer.from(`%PDF-1.4\n${body}${trailer}\n`, 'utf8')
}

function buildSummary(rows) {
  const participants = aggregateParticipants(rows)
  const withScores = participants.filter(p => p.totalMax > 0)
  const avgPercent = withScores.length
    ? withScores.reduce((acc, p) => acc + (p.totalScore / p.totalMax) * 100, 0) / withScores.length
    : 0
  return {
    participantCount: participants.length,
    submissionRows: rows.filter(r => r.round_no != null).length,
    avgPercent: Number(avgPercent.toFixed(2)),
  }
}

function processOneJob(job) {
  try {
    markExportRunning({ sessionId: job.sessionId, exportId: job.id })
    const rows = getExportRowsForSession({ sessionId: job.sessionId })
    const lines = buildReportLines(job.sessionId, rows)
    const pdf = buildPdfDocument(lines)
    const filename = buildPdfFilename(job.sessionId, job.id)
    const fullPath = join(EXPORT_DIR, filename)
    writeFileSync(fullPath, pdf)
    markExportDone({ sessionId: job.sessionId, exportId: job.id, fileRef: fullPath })
    const summary = buildSummary(rows)
    logger.info({ sessionId: job.sessionId, exportId: job.id, summary }, 'PDF-Export erfolgreich erstellt')
  } catch (err) {
    logger.error({ err, sessionId: job.sessionId, exportId: job.id }, 'PDF-Export fehlgeschlagen')
    markExportFailed({ sessionId: job.sessionId, exportId: job.id, errorMessage: err.message })
  }
}

export function processQueuedPdfExports(limit = 10) {
  const jobs = listQueuedExports({ type: 'pdf', limit })
  for (const job of jobs) processOneJob(job)
  return { processed: jobs.length }
}
