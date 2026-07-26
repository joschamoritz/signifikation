/**
 * server/classroom/modes/index.js
 *
 * Zentrale Modus-Registry (Code-Review P2). Frueher lag Modus-Wissen an ~8
 * Stellen verstreut (VALID_MODES, scoreSubmission, buildContentSnapshot,
 * buildSafePrompt, content.js resolve*, extract* + buildDistribution,
 * buildRevealItems). Jetzt definiert jede modes/[mode].js EIN Objekt mit allen
 * Pflicht-Funktionen; dieser Index buendelt sie und prueft beim Laden, dass
 * jeder Modus vollstaendig ist — ein unvollstaendig registrierter Modus laesst
 * den Prozess LAUT fehlschlagen (statt stiller Leerdaten zur Laufzeit).
 *
 * Bewusst NICHT hier: die Frontend-Komponentenauswahl (pickGameComponent) — sie
 * waehlt React-Komponenten und gehoert auf die Client-Seite. Und die Zod-Mode-
 * Enums (validate.js) bleiben eigenstaendige Validierungsgrenze.
 */

import kollokationen from './kollokationen.js'
import wortzwilling from './wortzwilling.js'
import zeitenwende from './zeitenwende.js'
import lueckenfueller from './lueckenfueller.js'

// Pflicht-Funktionen, die jeder Modus implementieren MUSS.
export const REQUIRED_FNS = [
  'score',              // Scoring (R6)
  'buildSnapshotEntry', // content_snapshot pro Lemma (D4)
  'buildSafePrompt',    // Schueler-Whitelist (R1)
  'extractDistractors', // Reporting: Distraktor-Ranking
  'extractPicks',       // Reporting: Options-Anteil
  'extractItems',       // Reporting: Trefferquote je Item
  'buildDistribution',  // Reporting: Antwortverteilung
  'buildRevealItems',   // Schueler-Aufloesung (R1, nach Freigabe)
]

const ALL_MODES = [kollokationen, wortzwilling, zeitenwende, lueckenfueller]

// Konsistenzpruefung: wirft LAUT, wenn ein Modus keine gueltige id hat oder
// eine Pflicht-Funktion fehlt. Beim Laden ueber alle registrierten Modi
// ausgefuehrt — ein unvollstaendiger Modus laesst den Prozess fehlschlagen,
// statt zur Laufzeit still Leerdaten zu liefern. Exportiert fuer Tests.
export function assertCompleteMode(mode) {
  if (!mode || typeof mode.id !== 'string' || !mode.id) {
    throw new Error('Modus-Registry: Modus ohne gueltige id registriert')
  }
  for (const fn of REQUIRED_FNS) {
    if (typeof mode[fn] !== 'function') {
      throw new Error(`Modus-Registry: Modus "${mode.id}" unvollstaendig – Funktion "${fn}" fehlt`)
    }
  }
  return mode
}

const registry = new Map()
for (const mode of ALL_MODES) {
  assertCompleteMode(mode)
  if (registry.has(mode.id)) {
    throw new Error(`Modus-Registry: doppelte id "${mode.id}"`)
  }
  registry.set(mode.id, mode)
}

// Liste aller registrierten Modus-IDs (ersetzt das frueher hartkodierte
// VALID_MODES-Array in store.js).
export const VALID_MODES = Array.from(registry.keys())

export function getMode(mode) {
  return registry.get(mode) || null
}

export function hasMode(mode) {
  return registry.has(mode)
}

// ── Scoring-Dispatcher (R6) ─────────────────────────────────────────
// Eine API fuer die Submit-Route (store.submitAnswer). Erwartet:
//   mode             – registrierter Modus
//   contentSnapshot  – das beim addAssignment eingefrorene JSON-Objekt (per lemma_id)
//   rawAnswer        – das vom Client gelieferte JSON (NIEMALS score)
//   roundIndex       – nur fuer lueckenfueller relevant (Index in rounds)
export function scoreSubmission({ mode, contentSnapshot, rawAnswer, roundIndex = 0 }) {
  const m = getMode(mode)
  if (!m) throw new Error(`scoreSubmission: unbekannter Modus "${mode}"`)
  return m.score(contentSnapshot, rawAnswer, roundIndex)
}

// ── Gueltige Rundenzahl pro Lemma ───────────────────────────────────
// Single-Round-Modi (Kollokationen/Wort-Zwilling/Zeitenwende) → 1.
// Nur lueckenfueller definiert ein eigenes roundCount (rounds[].length).
// Genutzt von store.submitAnswer zur round_index-Validierung (gegen
// Submission-Inflation: ohne Grenze waeren bis zu 100 Abgaben/Lemma moeglich).
export function roundCountFor({ mode, contentSnapshot }) {
  const m = getMode(mode)
  if (!m) return 0
  return typeof m.roundCount === 'function' ? m.roundCount(contentSnapshot) : 1
}
