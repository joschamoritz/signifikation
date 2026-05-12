import { fileURLToPath } from 'url'
import logger from '../logger.js'
import { processQueuedCsvExports } from '../export/csvExport.js'
import { processQueuedPdfExports } from '../export/pdfExport.js'
import { startClassroomRetentionJob } from '../jobs/classroomRetention.js'

const EXPORT_INTERVAL_MS = Number(process.env.CLASSROOM_EXPORT_WORKER_INTERVAL_MS || 10000)
const RETENTION_SCHEDULE_3AM = process.env.CLASSROOM_RETENTION_AT_3AM !== 'false'
const RETENTION_INTERVAL_MS = Number(process.env.CLASSROOM_RETENTION_INTERVAL_MS || 10 * 60 * 1000)

let exportTimer = null
let retentionHandle = null

function isStandaloneWorkerProcess() {
  return process.argv[1] === fileURLToPath(import.meta.url)
}

async function runExportCycle() {
  try {
    await Promise.all([
      processQueuedCsvExports(10),
      processQueuedPdfExports(10),
    ])
  } catch (err) {
    logger.error({ err }, 'Classroom-Export-Worker Zyklus fehlgeschlagen')
  }
}

export function startClassroomWorker({ keepProcessAlive = false } = {}) {
  if (!exportTimer) {
    exportTimer = setInterval(runExportCycle, EXPORT_INTERVAL_MS)
    if (!keepProcessAlive) exportTimer.unref()
  }

  if (!retentionHandle) {
    retentionHandle = startClassroomRetentionJob(RETENTION_INTERVAL_MS, RETENTION_SCHEDULE_3AM, keepProcessAlive)
  }

  logger.info({ exportIntervalMs: EXPORT_INTERVAL_MS, retentionAt3am: RETENTION_SCHEDULE_3AM }, 'Classroom-Worker gestartet')

  return {
    clear() {
      if (exportTimer) {
        clearInterval(exportTimer)
        exportTimer = null
      }
      if (retentionHandle?.clear) retentionHandle.clear()
      else if (retentionHandle) clearInterval(retentionHandle)
      retentionHandle = null
    },
  }
}

if (isStandaloneWorkerProcess()) {
  const workerHandle = startClassroomWorker({ keepProcessAlive: true })

  const shutdown = (signal) => {
    logger.info({ signal }, 'Classroom-Worker faehrt herunter')
    workerHandle.clear()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
