/**
 * streak.js – Streak-Saver-Push (abendliche Serien-Rettung)
 *
 * Zweck: eingeloggte Push-Abonnenten mit aktiver Tages-Serie stupsen, BEVOR
 * die Serie reißt – einmal abends um 19:00 Europe/Berlin, zusätzlich zum
 * 08:00-Broadcast (scheduler.js). Zielgruppe (alle Bedingungen):
 *   1. eingeloggt (stats.user_id != '')
 *   2. hat GESTERN (Berlin) gespielt  → Serie ist „lebendig“
 *   3. hat HEUTE (Berlin) noch NICHT gespielt → Serie in Gefahr
 *   4. hat mindestens ein Push-Gerät registriert
 *   5. aktuelle Serienlänge >= MIN_STREAK
 *
 * Streak-Definition (deckungsgleich mit dem Client, src/utils/homeUtils.js
 * computeStreak): die Menge der Spieltage sind die distinkten `stats.datum`
 * des Users; beide Seiten verwenden DENSELBEN Datums-Key (den serverDatum des
 * Tagesinhalts). Der Streak ist die Zahl aufeinanderfolgender Tage, die in
 * Berlin-heute oder Berlin-gestern endet. Reichweite ehrlich: nur eingeloggte
 * Abonnenten – anonyme Spieler haben keinen Server-Streak.
 *
 * Catch-up wie scheduler.js: app_state.streak_push_last_sent merkt sich den
 * letzten Versandtag (Berlin-Datum); ein verpasster 19:00-Lauf wird beim Boot
 * nachgeholt – aber NUR innerhalb eines Abendfensters (19–22 Uhr), damit kein
 * „Serie endet heute“-Push mitten in der Nacht des Folgetags rausgeht.
 * Idempotent über das Berlin-Datum.
 */
import cron from 'node-cron'
import db from '../db.js'
import logger from '../logger.js'
import { reportAlert } from '../alerting.js'
import { sendPushToUser } from './sender.js'
import { buildStreakPayload } from './templates.js'

const TIMEZONE = 'Europe/Berlin'
const SEND_HOUR = 19
const LATEST_CATCHUP_HOUR = 22 // nach 22 Uhr keinen Streak-Push mehr nachholen
const MIN_STREAK = 3
// Compaction (store-stats.js) faltet per-User-Zeilen älter als 180 Tage in die
// anonyme Zeile – ältere Spieltage sind serverseitig nicht mehr sichtbar.
// Das Fenster bestimmt nur die Query-Breite; der Streak-Walk endet ohnehin am
// ersten Lücken-Tag. 200 deckt den vollen sichtbaren Bereich ab.
const STREAK_LOOKBACK_DAYS = 200
const STATE_KEY = 'streak_push_last_sent'

// ── Datums-Helfer (Europe/Berlin) ────────────────────────────────
export function berlinDateStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now)
}

function berlinHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hour12: false }).format(now)
  )
}

/** Verschiebt einen YYYY-MM-DD-String um deltaDays (UTC-Arithmetik, DST-fest). */
export function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

// ── Catch-up-Marker (app_state) ──────────────────────────────────
const getStateStmt = db.prepare('SELECT value FROM app_state WHERE key = ?')
const setStateStmt = db.prepare(`
  INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`)

export function hasSentToday(now = new Date()) {
  return getStateStmt.get(STATE_KEY)?.value === berlinDateStr(now)
}

function markSent(now = new Date()) {
  setStateStmt.run(STATE_KEY, berlinDateStr(now), Date.now())
}

// ── Streak-Ableitung aus stats ───────────────────────────────────
const getUserPlayDatesStmt = db.prepare(`
  SELECT DISTINCT datum
  FROM stats
  WHERE user_id = ? AND datum >= ?
  ORDER BY datum DESC
`)

// Kandidaten: gestern gespielt, heute NICHT, mit mindestens einem Push-Gerät.
// JOIN auf push_subscriptions.user_id (nullable) schließt anonyme Subs (NULL)
// automatisch aus, da s.user_id != ''.
const getStreakCandidatesStmt = db.prepare(`
  SELECT DISTINCT s.user_id AS userId
  FROM stats s
  JOIN push_subscriptions p ON p.user_id = s.user_id
  WHERE s.user_id != ''
    AND s.datum = @yesterday
    AND NOT EXISTS (
      SELECT 1 FROM stats t
      WHERE t.user_id = s.user_id AND t.datum = @today
    )
`)

/**
 * Reine Streak-Berechnung aus einer Menge von Spieltagen (YYYY-MM-DD).
 * Spiegelt computeStreak im Client: Anker ist heute, sonst gestern; von dort
 * werden aufeinanderfolgende Tage rückwärts gezählt.
 *
 * @param {Iterable<string>} playedDates
 * @param {string} todayStr  Berlin-Datum „heute“ (YYYY-MM-DD)
 * @returns {number}
 */
export function computeStreakFromDates(playedDates, todayStr) {
  const set = playedDates instanceof Set ? playedDates : new Set(playedDates)
  if (!set.size) return 0
  const yesterdayStr = shiftDate(todayStr, -1)
  if (!set.has(todayStr) && !set.has(yesterdayStr)) return 0
  let cursor = set.has(todayStr) ? todayStr : yesterdayStr
  let streak = 0
  while (set.has(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }
  return streak
}

/**
 * Server-Streak eines Users (geräteübergreifend) zum Zeitpunkt `now`.
 * @returns {number}
 */
export function computeServerStreak(userId, now = new Date()) {
  const today = berlinDateStr(now)
  const since = shiftDate(today, -STREAK_LOOKBACK_DAYS)
  const rows = getUserPlayDatesStmt.all(String(userId), since)
  return computeStreakFromDates(rows.map((r) => r.datum), today)
}

/**
 * Liefert die Empfänger des Streak-Savers für `now`: eingeloggte Abonnenten,
 * die gestern (nicht heute) gespielt haben und deren Serie >= minStreak ist.
 *
 * @returns {Array<{ userId: string, streak: number }>}
 */
export function eligibleStreakSavers(now = new Date(), { minStreak = MIN_STREAK } = {}) {
  const today = berlinDateStr(now)
  const yesterday = shiftDate(today, -1)
  const candidates = getStreakCandidatesStmt.all({ today, yesterday })

  const result = []
  for (const { userId } of candidates) {
    const streak = computeServerStreak(userId, now)
    if (streak >= minStreak) result.push({ userId, streak })
  }
  return result
}

// ── Job ──────────────────────────────────────────────────────────
/**
 * Führt den Streak-Saver-Versand durch und persistiert den Versandtag.
 * @returns {Promise<{ candidates: number, recipients: number, sent: number, failed: number }>}
 */
export async function runStreakSaverJob(now = new Date()) {
  const savers = eligibleStreakSavers(now)
  logger.info({ candidates: savers.length }, 'Streak-Saver-Job gestartet')

  let sent = 0
  let failed = 0
  let recipients = 0
  for (const { userId, streak } of savers) {
    const payload = buildStreakPayload(now, streak)
    const r = await sendPushToUser(userId, payload)
    sent += r.sent
    failed += r.failed
    if (r.sent > 0) recipients += 1
  }

  markSent(now)
  logger.info({ candidates: savers.length, recipients, sent, failed }, 'Streak-Saver-Job abgeschlossen')
  return { candidates: savers.length, recipients, sent, failed }
}

/**
 * Boot-Catch-up: holt den 19:00-Versand nach, falls er verpasst wurde –
 * aber nur im Abendfenster (19–22 Uhr Berlin), nie nachts.
 * @returns {Promise<boolean>} true, wenn nachgesendet wurde
 */
export async function maybeCatchUpStreakSaver(now = new Date()) {
  const h = berlinHour(now)
  if (h < SEND_HOUR || h > LATEST_CATCHUP_HOUR) return false
  if (hasSentToday(now)) return false
  logger.info('Streak-Saver-Catch-up: 19:00-Versand wurde verpasst, hole nach')
  await runStreakSaverJob(now)
  return true
}

/**
 * Startet den abendlichen Streak-Saver-Scheduler (19:00 Europe/Berlin) inkl.
 * Boot-Catch-up. Gibt das cron-Task-Objekt zurück.
 */
export function startStreakSaverScheduler() {
  const task = cron.schedule(`0 ${SEND_HOUR} * * *`, () => {
    runStreakSaverJob().catch((err) => {
      logger.error({ err }, 'Streak-Saver-Job unerwarteter Fehler')
      reportAlert('streak_push_failed', `Streak-Saver-Job fehlgeschlagen: ${err?.message || err}`)
    })
  }, {
    timezone: TIMEZONE,
  })

  maybeCatchUpStreakSaver().catch((err) => {
    logger.error({ err }, 'Streak-Saver-Catch-up fehlgeschlagen')
    reportAlert('streak_push_failed', `Streak-Saver-Catch-up fehlgeschlagen: ${err?.message || err}`)
  })

  logger.info('Streak-Saver-Scheduler gestartet (täglich 19:00 Europe/Berlin, mit Boot-Catch-up)')
  return task
}
