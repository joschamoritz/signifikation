/**
 * shared/scoring.js
 *
 * Framework-freie, reine Bewertungsregeln — die SINGLE SOURCE fuer beide Seiten:
 *   - Frontend (src/utils/gameLogic.js, Singleplayer) via Vite-Alias '@shared'
 *   - Server   (server/classroom/scoring/index.js, Klassenraum) via relativem Import
 *
 * KEINE Vite-/React-/Node-spezifischen Imports — damit dieselbe Datei in beiden
 * Welten laeuft. Frueher waren die Kollokationen-Regeln dupliziert
 * (calculateMixedScore im Frontend ↔ scoreKollokationen im Server, Code-Review
 * P6); jetzt teilen sich beide dieselbe evaluateCollocationPicks-Funktion, sodass
 * die Regel nicht mehr auseinanderdriften kann.
 */

export const KOLL_MAX_SCORE = 10
export const WZ_MAX_SCORE = 10
export const ZW_MAX_SCORE = 10
export const KOLL_PICKS = 3

// Maximale Laenge einer Freitext-Antwort, die persistiert wird. Deckt sich mit
// dem maxLength des Eingabefeldes (ClassroomGameLueckenfueller.jsx).
export const FREE_ANSWER_MAX_LEN = 60

// Das 60-Zeichen-Limit der Eingabefelder ist rein clientseitig; rawAnswer ist
// ein opakes Objekt und darf bis 8000 Zeichen JSON gross sein. Beide
// Freitext-Runden (`free` und `double`) kappen deshalb hier, bevor der Wert
// persistiert und spaeter in der Ergebnisansicht (ggf. am Beamer) gezeigt wird.
function capFreeAnswer(raw) {
  return typeof raw === 'string' ? raw.slice(0, FREE_ANSWER_MAX_LEN) : raw ?? null
}

export function clampInt(value, min, max) {
  const n = Number(value) || 0
  return Math.max(min, Math.min(max, n))
}

// ── Kollokationen: kanonische Punkte-pro-Rang-Regel ──────────────────
// Rang 1-3 = 3 Punkte, 4-7 = 2, 8-10 = 1, sonst 0. Single Source.
export function collocationPointsForRang(rang) {
  const r = Number(rang) || 99
  if (r <= 3) return 3
  if (r <= 7) return 2
  if (r <= 10) return 1
  return 0
}

// Kanonische Auswertung einer Kollokationen-Auswahl (Single Source fuer
// Frontend + Server). Liefert die Roh-Bewertung inkl. Top-3-Bonus, plus die
// Detail-Treffer fuer das server-seitige detail_json. KEIN Clamp, KEIN Slice —
// das machen die Aufrufer (Frontend wertet die volle Auswahl, der Server slict
// vorher auf KOLL_PICKS).
export function evaluateCollocationPicks(selectedWords, kollokatoren) {
  const koll = Array.isArray(kollokatoren) ? kollokatoren : []
  const selected = Array.isArray(selectedWords) ? selectedWords : []
  let score = 0
  let top3Count = 0
  let correct = 0
  const hits = []
  for (const word of selected) {
    const k = koll.find((entry) => entry.wort === word)
    if (!k) { hits.push({ word, rang: null, points: 0 }); continue }
    const rang = Number(k.rang) || 99
    const points = collocationPointsForRang(rang)
    if (rang <= 3) { top3Count += 1; correct += 1 }
    score += points
    hits.push({ word, rang, points })
  }
  const bonus = top3Count === KOLL_PICKS
  if (bonus) score += 1
  return { score, top3Count, correct, hits, bonus }
}

/**
 * Frontend-Singleplayer: Score der gemischten Einzelrunde (nur die Zahl).
 *   Top-3 (Rang 1-3): 3 Punkte · Naher Treffer (4-7): 2 · Schwacher (8-10): 1
 *   +1 Bonus wenn alle 3 Picks in Top-3. Klick-Reihenfolge irrelevant.
 */
export function calculateMixedScore(selectedWords, kollokatoren) {
  return evaluateCollocationPicks(selectedWords, kollokatoren).score
}

// ── Server-Scoring (R6, server-autoritativ) ──────────────────────────
// Dieselben Regeln wie der jeweilige Singleplayer-Pfad, hier als reine
// Funktionen mit dem reichhaltigen { score, maxScore, correct, detail }-Shape,
// den der Klassenraum fuer Persistenz + Auswertung braucht.

// Kollokationen: 3 Picks aus 10 Optionen, Bonus +1 bei allen drei in Top-3.
export function scoreKollokationen(contentSnapshot, rawAnswer) {
  const kollokatoren = Array.isArray(contentSnapshot?.kollokatoren)
    ? contentSnapshot.kollokatoren
    : []
  const selectedRaw = Array.isArray(rawAnswer?.selected) ? rawAnswer.selected : []
  const selected = selectedRaw.slice(0, KOLL_PICKS)

  const { score, correct, hits, bonus } = evaluateCollocationPicks(selected, kollokatoren)

  return {
    score: clampInt(score, 0, KOLL_MAX_SCORE),
    maxScore: KOLL_MAX_SCORE,
    correct,
    detail: { hits, bonus },
  }
}

// Wort-Zwilling: 10 Kollokatoren auf zwei Zonen (A/B). 1 Punkt pro korrekter
// Zuordnung, Max 10.
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

// Zeitenwende: 10 Woerter, je 'pre'/'post' raten. 1 Punkt pro Treffer, max 10.
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

// Lueckenfueller: freie Texteingabe — Match wie Singleplayer.
export function matchesFree(val, kollokator, token) {
  const v = String(val ?? '').trim().toLowerCase()
  if (!v) return false
  const k = String(kollokator ?? '').toLowerCase()
  const t = String(token ?? '').toLowerCase()
  if (v === k || (t && v === t)) return true
  if (k.length >= 4 && (v.startsWith(k) || k.startsWith(v))) return true
  if (t.length >= 4 && (v.startsWith(t) || t.startsWith(v))) return true
  return false
}

// Lueckenfueller: pro Sub-Runde. Drei Typen: choice (all-or-nothing),
// double (zwei Slots, je 1 Punkt), free (Texteingabe).
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
      slots.push({ index: i, expected, given: capFreeAnswer(answers[i]), correct: ok })
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
    const value = capFreeAnswer(rawAnswer?.value)
    return {
      score: hit ? punkte : 0,
      maxScore: punkte,
      correct: hit ? 1 : 0,
      detail: { type: 'free', value, kollokator: round.kollokator },
    }
  }
  return { score: 0, maxScore: 0, correct: 0, detail: { type: round.type, reason: 'unknown-type' } }
}
