/**
 * server/classroom/scoring/index.js
 *
 * Serverautoritatives Scoring (D13). Eine Funktion pro Modus:
 *   (contentSnapshot, rawAnswer) → { score, maxScore, correct, detail }
 *
 * Die Bewertungsregeln spiegeln die Singleplayer-Pfade
 * (src/utils/gameLogic.js, src/components/WzResultsView.jsx,
 * Zeitenwende.jsx, Lueckenfueller.jsx). Statt die UI-Komponenten
 * invasiv zu refaktorieren, sind die Regeln hier als pure Funktionen
 * dupliziert – Singleplayer bleibt unangetastet und durch
 * gameLogic.test.js abgedeckt; jede Aenderung hier muss zusaetzlich
 * in classroom.scoring.test.js abgesichert werden.
 *
 * Eine spaetere Konsolidierung (gemeinsames Modul aus
 * src/utils/gameLogic.js importieren) ist moeglich, sobald wir ein
 * shared Verzeichnis ohne Vite/React-Abhaengigkeiten haben.
 */

const KOLL_MAX_SCORE = 10
const WZ_MAX_SCORE = 10
const ZW_MAX_SCORE = 10
const KOLL_PICKS = 3

function clampInt(value, min, max) {
  const n = Number(value) || 0
  return Math.max(min, Math.min(max, n))
}

// ── Kollokationen ────────────────────────────────────────────────────
// 3 Picks aus 10 Optionen. Rang 1-3 = 3 Punkte, 4-7 = 2 Punkte,
// 8-10 = 1 Punkt. Bonus +1 wenn alle drei Picks in Top-3. Max 10.
export function scoreKollokationen(contentSnapshot, rawAnswer) {
  const kollokatoren = Array.isArray(contentSnapshot?.kollokatoren)
    ? contentSnapshot.kollokatoren
    : []
  const selectedRaw = Array.isArray(rawAnswer?.selected) ? rawAnswer.selected : []
  const selected = selectedRaw.slice(0, KOLL_PICKS)

  let score = 0
  let top3Count = 0
  let correct = 0
  const hits = []
  for (const word of selected) {
    const k = kollokatoren.find((entry) => entry.wort === word)
    if (!k) { hits.push({ word, rang: null, points: 0 }); continue }
    const rang = Number(k.rang) || 99
    let points = 0
    if (rang <= 3) { points = 3; top3Count += 1; correct += 1 }
    else if (rang <= 7) { points = 2 }
    else if (rang <= 10) { points = 1 }
    score += points
    hits.push({ word, rang, points })
  }
  if (top3Count === KOLL_PICKS) score += 1

  return {
    score: clampInt(score, 0, KOLL_MAX_SCORE),
    maxScore: KOLL_MAX_SCORE,
    correct,
    detail: { hits, bonus: top3Count === KOLL_PICKS },
  }
}

// ── Wort-Zwilling ────────────────────────────────────────────────────
// 10 Kollokatoren werden auf zwei Zonen (A/B) verteilt. Pro korrekter
// Zuordnung 1 Punkt, Max 10.
export function scoreWortzwilling(contentSnapshot, rawAnswer) {
  const kollokatoren = Array.isArray(contentSnapshot?.kollokatoren)
    ? contentSnapshot.kollokatoren
    : []
  const zuordnung = new Map(
    kollokatoren.map((k) => [String(k.wort), String(k.zuordnung)]),
  )
  // Client-Arrays auf die Anzahl gültiger Optionen clampen — verhindert
  // ungebundene Iteration/aufgeblähtes detail_json (Security M2).
  const cap = kollokatoren.length
  const zoneA = (Array.isArray(rawAnswer?.zoneA) ? rawAnswer.zoneA : []).slice(0, cap)
  const zoneB = (Array.isArray(rawAnswer?.zoneB) ? rawAnswer.zoneB : []).slice(0, cap)

  let score = 0
  const detail = { zoneA: [], zoneB: [] }
  for (const w of zoneA) {
    const expected = zuordnung.get(String(w))
    const correctPlacement = expected === 'A'
    if (correctPlacement) score += 1
    detail.zoneA.push({ word: w, expected: expected ?? null, correct: correctPlacement })
  }
  for (const w of zoneB) {
    const expected = zuordnung.get(String(w))
    const correctPlacement = expected === 'B'
    if (correctPlacement) score += 1
    detail.zoneB.push({ word: w, expected: expected ?? null, correct: correctPlacement })
  }

  return {
    score: clampInt(score, 0, WZ_MAX_SCORE),
    maxScore: WZ_MAX_SCORE,
    correct: clampInt(score, 0, WZ_MAX_SCORE),
    detail,
  }
}

// ── Zeitenwende ──────────────────────────────────────────────────────
// 10 Woerter, je 'pre'/'post' raten. 1 Punkt pro Treffer, max 10.
export function scoreZeitenwende(contentSnapshot, rawAnswer) {
  const words = Array.isArray(contentSnapshot?.words) ? contentSnapshot.words : []
  const answers = Array.isArray(rawAnswer?.answers) ? rawAnswer.answers : []
  let score = 0
  const detail = []
  for (let i = 0; i < words.length; i += 1) {
    const expected = words[i]?.periode
    const given = answers[i] ?? null
    const correctPick = given !== null && given === expected
    if (correctPick) score += 1
    detail.push({ index: i, wort: words[i]?.wort, expected, given, correct: correctPick })
  }
  return {
    score: clampInt(score, 0, ZW_MAX_SCORE),
    maxScore: ZW_MAX_SCORE,
    correct: clampInt(score, 0, ZW_MAX_SCORE),
    detail,
  }
}

// ── Lueckenfueller ───────────────────────────────────────────────────
// Pro Sub-Runde (round_index zeigt auf die jeweilige Runde im
// content_snapshot.rounds-Array). Drei Typen:
//   choice   – Multiple-Choice, all-or-nothing punkte
//   double   – zwei Slots, je 1 Punkt, max 2
//   free     – Texteingabe, Match wie Singleplayer
function matchesFree(val, kollokator, token) {
  const v = String(val ?? '').trim().toLowerCase()
  if (!v) return false
  const k = String(kollokator ?? '').toLowerCase()
  const t = String(token ?? '').toLowerCase()
  if (v === k || (t && v === t)) return true
  if (k.length >= 4 && (v.startsWith(k) || k.startsWith(v))) return true
  if (t.length >= 4 && (v.startsWith(t) || t.startsWith(v))) return true
  return false
}

export function scoreLueckenfueller(round, rawAnswer) {
  if (!round || typeof round !== 'object') {
    return { score: 0, maxScore: 0, correct: 0, detail: { reason: 'no-round' } }
  }
  if (round.type === 'choice') {
    const punkte = Number(round.punkte) || 0
    const hit = String(rawAnswer?.selected ?? '') === String(round.kollokator ?? '')
    return {
      score: hit ? punkte : 0,
      maxScore: punkte,
      correct: hit ? 1 : 0,
      detail: { type: 'choice', selected: rawAnswer?.selected ?? null, kollokator: round.kollokator },
    }
  }
  if (round.type === 'double') {
    const sentences = Array.isArray(round.sentences) ? round.sentences : []
    const answers = Array.isArray(rawAnswer?.answers) ? rawAnswer.answers : []
    let score = 0
    const slots = []
    for (let i = 0; i < sentences.length; i += 1) {
      const expected = String(sentences[i]?.kollokator ?? '')
      const given = String(answers[i] ?? '')
      const ok = expected !== '' && expected === given
      if (ok) score += 1
      slots.push({ index: i, expected, given: answers[i] ?? null, correct: ok })
    }
    return {
      score,
      maxScore: sentences.length,
      correct: score,
      detail: { type: 'double', slots },
    }
  }
  if (round.type === 'free') {
    const punkte = Number(round.punkte) || 0
    const hit = matchesFree(rawAnswer?.value, round.kollokator, round.token)
    return {
      score: hit ? punkte : 0,
      maxScore: punkte,
      correct: hit ? 1 : 0,
      detail: { type: 'free', value: rawAnswer?.value ?? null, kollokator: round.kollokator },
    }
  }
  return { score: 0, maxScore: 0, correct: 0, detail: { type: round.type, reason: 'unknown-type' } }
}

// ── Dispatcher ───────────────────────────────────────────────────────
// Eine API fuer die Submit-Route. Erwartet:
//   mode             – 'kollokationen' | 'wortzwilling' | 'zeitenwende' | 'lueckenfueller'
//   contentSnapshot  – das beim addAssignment eingefrorene JSON-Objekt
//                      (per lemma_id; siehe Plan §4)
//   rawAnswer        – das vom Client gelieferte JSON (NIEMALS score)
//   roundIndex       – nur fuer lueckenfueller relevant (Index in rounds)
export function scoreSubmission({ mode, contentSnapshot, rawAnswer, roundIndex = 0 }) {
  switch (mode) {
    case 'kollokationen':
      return scoreKollokationen(contentSnapshot, rawAnswer)
    case 'wortzwilling':
      return scoreWortzwilling(contentSnapshot, rawAnswer)
    case 'zeitenwende':
      return scoreZeitenwende(contentSnapshot, rawAnswer)
    case 'lueckenfueller': {
      const rounds = Array.isArray(contentSnapshot?.rounds) ? contentSnapshot.rounds : []
      const round = rounds[roundIndex]
      return scoreLueckenfueller(round, rawAnswer)
    }
    default:
      throw new Error(`scoreSubmission: unbekannter Modus "${mode}"`)
  }
}
