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
 *   Top-3 (Rang 1–3):                 3 Punkte
 *   Naher Treffer (Rang 4–7):         2 Punkte
 *   Schwacher Treffer (Rang 8–10):    1 Punkt
 *   +1 Bonus wenn alle 3 Picks in Top-3
 * Max 10 Punkte (3×3 + 1 Bonus)
 *
 * Die Klick-Reihenfolge spielt keine Rolle mehr – die Top-3
 * unterscheiden sich linguistisch kaum, und die echten Korpus-Ränge
 * der Distraktoren (Plätze 4–12 = nearPool, 13–25 = midPool) werden
 * konsistent belohnt statt vom Shuffle-Index abhängig zu sein.
 */
export function calculateMixedScore(selectedWords, kollokatoren) {
  let score = 0
  let top3Count = 0
  selectedWords.forEach((word) => {
    const k = kollokatoren.find(k => k.wort === word)
    if (!k) return
    if (k.rang <= 3) {
      top3Count++
      score += 3
    } else if (k.rang <= 7) {
      score += 2
    } else if (k.rang <= 10) {
      score += 1
    }
  })
  if (top3Count === 3) score += 1
  return score
}

/** Einheitliche Medaille (prozentbasiert). */
export function getMedal(score, max) {
  const pct = score / (max || 1)
  if (pct >= 0.7) return { label: 'Gold',         emoji: '🥇' }
  if (pct >= 0.5) return { label: 'Silber',        emoji: '🥈' }
  if (pct >= 0.3) return { label: 'Bronze',        emoji: '🥉' }
  return                  { label: 'Teilgenommen', emoji: '🌱' }
}

/** Tagesmedaille nach allen 3 Spielen (max 30 Punkte). */
export function getDailyMedal(total) {
  return getMedal(total, 30)
}

