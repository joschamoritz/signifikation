export const ROUND_KEYS   = ['nomen', 'verben', 'adjektive']
export const ROUND_LABELS = ['Nomen', 'Verben', 'Adjektive']

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

/** Fisher-Yates shuffle – mutates and returns the array */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Pick `count` random items from `arr` without mutation */
export function getRandomItems(arr, count) {
  return shuffle([...arr]).slice(0, count)
}

/**
 * Shuffle the 10 pre-selected options for a round.
 * (Top-3 and 7 distractors are already fixed in the data.)
 */
export function getRoundOptions(kollokatoren) {
  return shuffle([...kollokatoren])
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

/** Feedback für ein einzelnes Spiel (max 10 Punkte). */
export function getMedal(total) {
  if (total >= 10) return { label: 'Perfekt!',    min: 10 }
  if (total >= 8)  return { label: 'Sehr gut!',   min: 8  }
  if (total >= 6)  return { label: 'Gut!',        min: 6  }
  if (total >= 4)  return { label: 'Solide!',     min: 4  }
  return                   { label: 'Weiter üben!', min: 0 }
}

/** Tagesmedaille nach allen 3 Spielen (max 30 Punkte). */
export function getDailyMedal(total) {
  if (total >= 27) return { label: 'Gold',         min: 27 }
  if (total >= 21) return { label: 'Silber',        min: 21 }
  if (total >= 15) return { label: 'Bronze',        min: 15 }
  return                   { label: 'Weiter üben!', min: 0  }
}
