/** Gibt rundenInfo zurück – aus dem Lemma-Objekt oder als Fallback für alte Substantiv-Einträge */
export function getRundInfo(lemma) {
  if (lemma?.rundenInfo?.length) return lemma.rundenInfo
  // Fallback für ältere Einträge ohne rundenInfo
  return [
    { key: 'nomen',     label: 'Nomen',     relCode: 'KON',  desc: 'ist koordiniert mit' },
    { key: 'verben',    label: 'Verben',    relCode: '~OBJ', desc: 'ist Objekt von' },
    { key: 'adjektive', label: 'Adjektive', relCode: 'ATTR', desc: 'hat Adjektivattribut' },
  ]
}

/** Fisher-Yates shuffle – returns a new shuffled array */
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Shuffle the 10 pre-selected options for a round.
 * (Top-3 and 7 distractors are already fixed in the data.)
 */
export function getRoundOptions(kollokatoren) {
  return shuffle(kollokatoren)
}

/**
 * Score for a single round:
 *   rang 1–3 → 1 pt each, all others → 0 pts
 * Max 3 pts per round, 9 pts for 3 rounds + 1 bonus = 10 total.
 */
export function calculateScore(selectedWords, kollokatoren) {
  return selectedWords.filter(word => {
    const k = kollokatoren.find(k => k.wort === word)
    return k && k.rang <= 3
  }).length
}

/** Einheitliche Medaille (prozentbasiert). */
export function getMedal(score, max) {
  const pct = score / (max || 1)
  if (pct >= 0.8) return { label: 'Gold',         emoji: '🥇' }
  if (pct >= 0.6) return { label: 'Silber',        emoji: '🥈' }
  if (pct >= 0.4) return { label: 'Bronze',        emoji: '🥉' }
  return                  { label: 'Teilgenommen', emoji: '🌱' }
}

/** Tagesmedaille nach allen 3 Spielen (max 30 Punkte). */
export function getDailyMedal(total) {
  return getMedal(total, 30)
}

