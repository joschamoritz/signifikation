import { cleanupExpiredSessions } from '../classroom-store.js'
import logger from '../logger.js'
import { existsSync, unlinkSync } from 'fs'

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000

function deleteExportFiles(fileRefs = []) {
  let deletedFiles = 0
  for (const fileRef of fileRefs) {
    if (!fileRef) continue
    try {
      if (existsSync(fileRef)) {
        unlinkSync(fileRef)
        deletedFiles += 1
      }
    } catch (err) {
      logger.warn({ err, fileRef }, 'Retention: Export-Datei konnte nicht geloescht werden')
    }
  }
  return deletedFiles
}

export function runClassroomRetention() {
  const result = cleanupExpiredSessions()
  const deletedFiles = deleteExportFiles(result.fileRefs)
  if ((result.archivedSessions || 0) > 0 || result.deletedSessions > 0 || deletedFiles > 0) {
    logger.info(
      {
        archivedSessions: result.archivedSessions || 0,
        deletedSessions: result.deletedSessions,
        deletedFiles,
      },
      'Classroom-Retention ausgefuehrt',
    )
  }
  return { ...result, deletedFiles }
}

function delayToNext3am(now = new Date()) {
  const next = new Date(now)
  next.setHours(3, 0, 0, 0)
  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }
  return next.getTime() - now.getTime()
}

export function startClassroomRetentionJob(intervalMs = DEFAULT_INTERVAL_MS, runAt3am = true) {
  const run = () => {
    try {
      runClassroomRetention()
    } catch (err) {
      logger.error({ err }, 'Classroom-Retention Job fehlgeschlagen')
    }
  }

  if (!runAt3am) {
    const timer = setInterval(run, intervalMs)
    timer.unref()
    logger.info({ intervalMs }, 'Classroom-Retention Job gestartet')
    return timer
  }

  let dailyTimer = null
  let firstRunTimer = null

  const scheduleDaily = () => {
    dailyTimer = setInterval(run, 24 * 60 * 60 * 1000)
    dailyTimer.unref()
  }

  const firstDelay = delayToNext3am()
  run()
  firstRunTimer = setTimeout(() => {
    run()
    scheduleDaily()
  }, firstDelay)
  firstRunTimer.unref()

  logger.info({ cron: '0 3 * * *', firstRunInMs: firstDelay }, 'Classroom-Retention Job geplant')

  return {
    clear() {
      if (firstRunTimer) clearTimeout(firstRunTimer)
      if (dailyTimer) clearInterval(dailyTimer)
    },
  }
}
