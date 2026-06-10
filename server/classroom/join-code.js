/**
 * server/classroom/join-code.js
 *
 * Generiert kollisionsfreie Join-Codes fuer classroom_session.
 * Default-Strategie (siehe Plan Decision D16): die bestehende Wortliste
 * aus server/classroom/join-codes.js. Zum Umstellen (z.B. 6-stellig)
 * reicht es, generateCandidate auszutauschen, alles andere
 * (Kollisionsschutz, Retry-Budget) bleibt identisch.
 *
 * Kollisionsfenster: idx_classroom_session_code_active ist ein partial
 * unique index auf classroom_session(code) WHERE status IN ('lobby','running').
 * Wir matchen explizit auf diesen Filter, damit Codes nach Session-Ende
 * sofort wiederverwendbar sind.
 *
 * Max 40 Versuche – empirisch ausreichend bei ~230 Woertern
 * (≈ 50.000 moegliche Wort-Paare nach Laengenfilter).
 */

import db from '../db.js'
import { generateJoinCode, normalizeJoinCode } from './join-codes.js'

const MAX_ATTEMPTS = 40

const countActiveByCodeStmt = db.prepare(`
  SELECT COUNT(1) AS c
  FROM classroom_session
  WHERE code = ?
    AND status IN ('lobby','running')
`)

// Eigene Funktion in Tests injizierbar (Determinismus + Kollisions-
// Stress-Test). Default delegiert an die bestehende, geprueft-stilkonforme
// Wortliste – auch nach D16-Entscheid bleibt diese Hilfsfunktion stabil,
// es aendert sich nur die uebergebene Strategie.
export function generateUniqueJoinCode({
  generate = generateJoinCode,
  maxAttempts = MAX_ATTEMPTS,
} = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = normalizeJoinCode(generate())
    if (!candidate) continue
    const row = countActiveByCodeStmt.get(candidate)
    if (!row || row.c === 0) return candidate
  }
  throw new Error('Join-Code konnte nach maximaler Anzahl Versuche nicht eindeutig erzeugt werden')
}

export { normalizeJoinCode }
