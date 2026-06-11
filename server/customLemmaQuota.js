/**
 * customLemmaQuota.js – Tageskontingent fürs „Eigenes Lemma"-Feature.
 *
 * Modell (Phase 4):
 *   - Premium (Rolle premium/admin): unbegrenzt.
 *   - Basic (eingeloggt): BASE_ALLOWANCE (1) + Admin-Bonus des Tages (free_days.bonus_count).
 *   - Nicht eingeloggt: kein Kontingent (Login nötig, weil pro Account gezählt wird).
 *
 * Verbraucht wird pro erfolgreichem /custom-lemma/play (nicht beim Validieren).
 */

import db from './db.js'

export const BASE_ALLOWANCE = 1
const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'

const getBonusStmt = db.prepare('SELECT bonus_count FROM free_days WHERE date = ?')
const getUsageStmt = db.prepare('SELECT count FROM custom_lemma_usage WHERE user_id = ? AND date = ?')
const incrUsageStmt = db.prepare(`
  INSERT INTO custom_lemma_usage (user_id, date, count) VALUES (?, ?, 1)
  ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
`)

export function todayBerlin() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date())
}

/** Admin-Bonus für ein Datum (0, wenn kein Eintrag). */
export function getTodayBonus(date = todayBerlin()) {
  const row = getBonusStmt.get(date)
  return row?.bonus_count ?? 0
}

/** Bereits heute verbrauchte Eigene-Lemma-Spiele eines Accounts. */
export function getUsageToday(userId, date = todayBerlin()) {
  const row = getUsageStmt.get(userId, date)
  return row?.count ?? 0
}

/** Verbrauch um 1 erhöhen (Upsert). */
export function incrementUsage(userId, date = todayBerlin()) {
  incrUsageStmt.run(userId, date)
}

const isPremiumRole = (role) => role === 'premium' || role === 'admin'

// Atomar zaehlen+pruefen in EINEM Statement: das fruehere Muster
// getQuota() → ... → incrementUsage() war ein Read-Check-Write-Race —
// zwei parallele Requests bei remaining=1 bekamen beide ein Spiel.
// DO UPDATE ... WHERE count < allowance: verliert der zweite Request,
// ist changes === 0. Der INSERT-Pfad (erste Nutzung des Tages) ist safe,
// weil allowance >= BASE_ALLOWANCE (1).
const consumeStmt = db.prepare(`
  INSERT INTO custom_lemma_usage (user_id, date, count) VALUES (?, ?, 1)
  ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1
  WHERE count < ?
`)

/**
 * Verbraucht atomar 1 Spiel, wenn das Kontingent es hergibt.
 * @returns {{ consumed:boolean, unlimited:boolean, allowance:number, remaining:number }}
 */
export function tryConsume({ userId, role, date = todayBerlin() }) {
  if (isPremiumRole(role)) {
    return { consumed: true, unlimited: true, allowance: Infinity, remaining: Infinity }
  }
  const allowance = BASE_ALLOWANCE + getTodayBonus(date)
  const info = consumeStmt.run(userId, date, allowance)
  if (info.changes === 0) {
    return { consumed: false, unlimited: false, allowance, remaining: 0 }
  }
  const used = getUsageToday(userId, date)
  return { consumed: true, unlimited: false, allowance, remaining: Math.max(0, allowance - used) }
}

/**
 * Kontingent-Status eines Subjekts.
 * @returns {{ unlimited:boolean, allowance:number, used:number, remaining:number }}
 */
export function getQuota({ userId, role, date = todayBerlin() }) {
  if (isPremiumRole(role)) {
    return { unlimited: true, allowance: Infinity, used: 0, remaining: Infinity }
  }
  const allowance = BASE_ALLOWANCE + getTodayBonus(date)
  const used = getUsageToday(userId, date)
  return { unlimited: false, allowance, used, remaining: Math.max(0, allowance - used) }
}
