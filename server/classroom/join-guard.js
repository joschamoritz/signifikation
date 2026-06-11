/**
 * server/classroom/join-guard.js
 *
 * Brute-Force-Schutz für POST /api/v1/classroom/join
 * (Security-Review H1 2026-06-10; pro-Code-Umbau S-M1 2026-06-11).
 *
 * Das per-IP-Limit (classroomJoinLimiter) bremst einzelne Clients, aber
 * nicht verteilte Code-Rateversuche über viele IPs. Dieser Guard zählt
 * FEHLGESCHLAGENE Joins (ungültiger Code):
 *
 *   1. PRO CODE (MAX_FAILURES_PER_CODE / Fenster): blockiert gezielte
 *      Rateversuche auf einen Code, ohne fremde Klassen zu treffen.
 *      Der frühere GLOBALE 40er-Zähler war ein DoS-Vektor: 40 falsche
 *      Codes (trivial verteilt) blockierten den Beitritt für ALLE
 *      Klassen. Legitime Tippfehler streuen über verschiedene falsche
 *      Codes und erreichen die Schwelle auf EINEM Code praktisch nie.
 *
 *   2. GLOBAL als hohe Backstop-Schwelle (MAX_FAILURES_GLOBAL / Fenster)
 *      gegen breite Enumeration über viele Codes: bei ~40.000 möglichen
 *      Codes (200 Wörter²) und 400 Versuchen/10 min bleibt der Suchraum
 *      während der Lebensdauer eines Codes (eine Schulstunde) praktisch
 *      nicht enumerierbar — und die Schwelle ist hoch genug, dass kein
 *      realistischer Legitim-Traffic sie erreicht.
 *
 * Beide Aktivierungen feuern einen Alert (reportAlert, 30-min-Cooldown).
 * Blockierte Versuche verlängern die Fenster NICHT (kein Block-DoS).
 *
 * Single-Node-Annahme (dokumentierte Grenze, P5): In-Memory reicht.
 */

import { reportAlert } from '../alerting.js'

const WINDOW_MS = 10 * 60_000
const MAX_FAILURES_PER_CODE = 10
const MAX_FAILURES_GLOBAL = 400

const perCode = new Map() // normalisierter Code → Fehlversuchs-Timestamps
let globalFailures = []

function normalizeCode(code) {
  return String(code || '').trim().toLowerCase()
}

function prunedCodeFailures(key, now) {
  const arr = (perCode.get(key) || []).filter((t) => now - t < WINDOW_MS)
  if (arr.length > 0) perCode.set(key, arr)
  else perCode.delete(key)
  return arr
}

export function isJoinBlocked(code, now = Date.now()) {
  globalFailures = globalFailures.filter((t) => now - t < WINDOW_MS)
  if (globalFailures.length >= MAX_FAILURES_GLOBAL) {
    reportAlert('join_guard_global',
      `Classroom-Join-Guard: globale Schwelle aktiv (${globalFailures.length} Fehlversuche/10min) — breiter Enumerationsversuch?`)
    return true
  }

  const failures = prunedCodeFailures(normalizeCode(code), now)
  if (failures.length >= MAX_FAILURES_PER_CODE) {
    reportAlert('join_guard_code',
      `Classroom-Join-Guard: Code-Schwelle aktiv (${failures.length} Fehlversuche/10min auf einen Code)`)
    return true
  }
  return false
}

export function recordJoinFailure(code, now = Date.now()) {
  const key = normalizeCode(code)
  const failures = prunedCodeFailures(key, now)
  if (failures.length < MAX_FAILURES_PER_CODE) {
    failures.push(now)
    perCode.set(key, failures)
  }

  globalFailures = globalFailures.filter((t) => now - t < WINDOW_MS)
  if (globalFailures.length < MAX_FAILURES_GLOBAL) globalFailures.push(now)
}

// Map-Hygiene: Eintraege komplett abgelaufener Codes entfernen
// (sonst waechst die Map mit jedem je versuchten Code).
export function pruneJoinGuard(now = Date.now()) {
  for (const key of perCode.keys()) prunedCodeFailures(key, now)
  globalFailures = globalFailures.filter((t) => now - t < WINDOW_MS)
}
setInterval(pruneJoinGuard, 10 * 60_000).unref()

// Nur für Tests
export function resetJoinGuard() {
  perCode.clear()
  globalFailures = []
}

export {
  WINDOW_MS as JOIN_GUARD_WINDOW_MS,
  MAX_FAILURES_PER_CODE as JOIN_GUARD_MAX_FAILURES_PER_CODE,
  MAX_FAILURES_GLOBAL as JOIN_GUARD_MAX_FAILURES_GLOBAL,
}
