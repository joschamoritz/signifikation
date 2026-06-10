/**
 * server/classroom/join-guard.js
 *
 * Globaler Brute-Force-Schutz für POST /api/v1/classroom/join
 * (Security-Review H1, 2026-06-10).
 *
 * Das per-IP-Limit (classroomJoinLimiter) bremst einzelne Clients, aber
 * nicht verteilte Code-Rateversuche über viele IPs. Dieser Guard zählt
 * FEHLGESCHLAGENE Joins (ungültiger Code) global über alle IPs: über der
 * Schwelle werden alle Join-Versuche abgelehnt, bis das Fenster abkühlt —
 * bewusst auch solche mit gültigem Code, sonst bliebe der Endpoint ein
 * Code-Orakel und der Schutz wirkungslos.
 *
 * Dimensionierung: legitime Tippfehler liegen weit unter der Schwelle
 * (eine Klasse produziert vielleicht 5–10 Vertipper pro Stunde). Bei
 * MAX_FAILURES/Fenster ist der Suchraum (~200 Wörter² ≈ 40.000 Codes)
 * während der Lebensdauer eines Codes (eine Schulstunde) praktisch
 * nicht enumerierbar.
 *
 * Blockierte Versuche verlängern das Fenster NICHT — sonst könnte ein
 * Dauerangreifer legitime Joins unbegrenzt blockieren (DoS).
 *
 * Single-Node-Annahme (dokumentierte Grenze, P5): In-Memory reicht.
 */

const WINDOW_MS = 10 * 60_000
const MAX_FAILURES = 40

let failures = []

function prune(now) {
  // failures ist durch MAX_FAILURES + kurze Spitzen begrenzt — der Filter
  // läuft also immer über ein kleines Array.
  failures = failures.filter(t => now - t < WINDOW_MS)
}

export function isJoinBlocked(now = Date.now()) {
  prune(now)
  return failures.length >= MAX_FAILURES
}

export function recordJoinFailure(now = Date.now()) {
  prune(now)
  if (failures.length < MAX_FAILURES) failures.push(now)
}

// Nur für Tests
export function resetJoinGuard() {
  failures = []
}

export { WINDOW_MS as JOIN_GUARD_WINDOW_MS, MAX_FAILURES as JOIN_GUARD_MAX_FAILURES }
