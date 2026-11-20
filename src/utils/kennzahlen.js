// Kennzahlen eines Kollokators nach der Auswertung (Kollokationen-Spiel und
// Klassenraum). Seit der neuen Rangfolge (Häufigkeit × logDice, Blindvergleich
// 2026-11-19) stehen logDice und Belege nebeneinander: logDice allein passte
// nicht mehr zur Reihenfolge, sollte als fachlicher Kern aber sichtbar bleiben.

const DICE = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const ZAHL = new Intl.NumberFormat('de-DE')

/** Erklärzeile unter der Auflösung (nur, wenn der Spieltag Belege mitliefert). */
export const RANG_LEGENDE = 'Oben stehen Verbindungen, die zugleich fest und häufig sind (Häufigkeit × logDice).'

/**
 * „7,4 · 8.594 Belege“, bei älteren Spieltagen ohne Häufigkeit nur „7,4“.
 * @param {number|string|null|undefined} logDice
 * @param {number|null|undefined} [frequenz]
 * @returns {string|null} null, wenn es kein logDice gibt
 */
export function kennzahlText(logDice, frequenz) {
  const d = Number(logDice)
  if (logDice == null || logDice === '' || !Number.isFinite(d)) return null
  const f = Number(frequenz)
  return frequenz != null && Number.isFinite(f) ? `${DICE.format(d)} · ${ZAHL.format(f)} Belege` : DICE.format(d)
}

/** Liefert der Spieltag Belege? Dann gilt die neue Rangfolge und die Erklärzeile passt. */
export const hatBelege = (kollokatoren) => Array.isArray(kollokatoren) && kollokatoren.some((k) => k?.frequenz != null)
