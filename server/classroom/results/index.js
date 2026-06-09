/**
 * server/classroom/results/index.js
 *
 * Reporting-/Auswertungs-Einstieg fuer den Klassenraum. Aus store.js
 * herausgezogen (P1) und seit der Modus-Registry (P2) ein duenner Delegations-
 * Layer: die modus-spezifische Logik liegt in ../modes/<mode>.js, hier bleiben
 * nur die mode-agnostischen Aspekte (denom-/detail-Guards, pickTopDistractor)
 * und die stabile (mode, ...)-Signatur, die store.js erwartet.
 *
 * Pseudonymitaet (D7): keine dieser Funktionen sieht display_name oder eine
 * Teilnehmer-Identitaet — sie arbeiten ausschliesslich auf der fachlichen
 * Bewertung (detail_json) bzw. dem Content-Snapshot.
 */

import { getMode } from '../modes/index.js'

// Distraktoren/Falschantworten je Submission (fuer das Distraktor-Ranking).
export function extractDistractors(mode, row) {
  return getMode(mode)?.extractDistractors(row) ?? []
}

// Alle gewaehlten Optionen einer Abgabe (Basis fuer die Options-Anteil-Verteilung).
export function extractPicks(mode, row) {
  return getMode(mode)?.extractPicks(row) ?? []
}

// Pro-Item-Korrektheit einer Abgabe (Basis fuer die Trefferquote-je-Item-Verteilung).
export function extractItems(mode, row) {
  return getMode(mode)?.extractItems(row) ?? []
}

// Antwortverteilung pro Lemma. denom = distinkte Teilnehmer (agg.participants.size).
// Bei denom <= 0 keine aussagekraeftige Verteilung — frueher die erste Zeile von
// buildDistribution, hier vor der Modus-Delegation.
export function buildDistribution(mode, snapshot, agg, denom) {
  if (denom <= 0) return null
  return getMode(mode)?.buildDistribution(snapshot, agg, denom) ?? null
}

// Haeufigsten Distraktor aus einer Label→Count-Map waehlen (mode-agnostisch).
// Deterministisch: hoechster Count, bei Gleichstand alphabetisch.
export function pickTopDistractor(distractorMap) {
  if (!distractorMap || distractorMap.size === 0) return null
  let best = null
  for (const [label, count] of distractorMap) {
    if (!best || count > best.count || (count === best.count && label.localeCompare(best.label) < 0)) {
      best = { label, count }
    }
  }
  return best
}

// Schueler-Aufloesung pro Submission (nach Freigabe, R1). detail ist bereits
// geparst; ohne detail gibt es nichts aufzuloesen.
export function buildRevealItems(mode, detail, snapshot) {
  if (!detail) return { items: [], solution: null }
  return getMode(mode)?.buildRevealItems(detail, snapshot) ?? { items: [], solution: null }
}
