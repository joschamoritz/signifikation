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

/**
 * Score for the mixed single round:
 *   Richtiges Wort + richtiger Rang:  3 Punkte
 *   Richtiges Wort + falscher Rang:   2 Punkte
 *   Rang 4–5 (naher Treffer):         1 Punkt
 *   Rang 6+:                          0 Punkte
 *   +1 Bonus wenn alle 3 Picks in Top-3
 * Max 10 Punkte (3×3 + 1 Bonus)
 */
export function calculateMixedScore(selectedWords, kollokatoren) {
  let score = 0
  let top3Count = 0
  selectedWords.forEach((word, pickIndex) => {
    const k = kollokatoren.find(k => k.wort === word)
    if (!k) return
    if (k.rang <= 3) {
      top3Count++
      score += (k.rang === pickIndex + 1) ? 3 : 2
    } else if (k.rang <= 5) {
      score += 1
    }
  })
  if (top3Count === 3) score += 1
  return score
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

