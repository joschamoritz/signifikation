/**
 * shared/scoring.test.js
 *
 * Direkte Unit-Tests für die Low-Level-Bausteine in shared/scoring.js.
 * Die Server-Tests (classroom.scoring.test.js) prüfen den zusammengesetzten
 * Modus-Dispatcher; hier testen wir die atomaren Helfer isoliert, damit
 * Regressionen in einzelnen Rechenregeln sofort sichtbar werden.
 */
import { describe, it, expect } from 'vitest'
import {
  clampInt,
  collocationPointsForRang,
  evaluateCollocationPicks,
  calculateMixedScore,
  matchesFree,
  scoreLueckenfueller,
  FREE_ANSWER_MAX_LEN,
  KOLL_MAX_SCORE,
  KOLL_PICKS,
  WZ_MAX_SCORE,
  ZW_MAX_SCORE,
} from './scoring.js'

// ── Exportierte Konstanten ───────────────────────────────────────────────────
describe('Konstanten', () => {
  it('KOLL_MAX_SCORE ist 10', () => {
    expect(KOLL_MAX_SCORE).toBe(10)
  })

  it('KOLL_PICKS ist 3', () => {
    expect(KOLL_PICKS).toBe(3)
  })

  it('WZ_MAX_SCORE und ZW_MAX_SCORE sind jeweils 10', () => {
    expect(WZ_MAX_SCORE).toBe(10)
    expect(ZW_MAX_SCORE).toBe(10)
  })
})

// ── clampInt ─────────────────────────────────────────────────────────────────
describe('clampInt', () => {
  it('gibt den Wert unverändert zurück, wenn er im Bereich liegt', () => {
    expect(clampInt(5, 0, 10)).toBe(5)
    expect(clampInt(0, 0, 10)).toBe(0)
    expect(clampInt(10, 0, 10)).toBe(10)
  })

  it('klemmt auf das Minimum', () => {
    expect(clampInt(-3, 0, 10)).toBe(0)
    expect(clampInt(-999, 0, 10)).toBe(0)
  })

  it('klemmt auf das Maximum', () => {
    expect(clampInt(15, 0, 10)).toBe(10)
    expect(clampInt(999, 0, 10)).toBe(10)
  })

  it('konvertiert Strings zu Zahlen', () => {
    expect(clampInt('7', 0, 10)).toBe(7)
  })

  it('behandelt NaN / null / undefined als 0', () => {
    expect(clampInt(NaN, 0, 10)).toBe(0)
    expect(clampInt(null, 0, 10)).toBe(0)
    expect(clampInt(undefined, 0, 10)).toBe(0)
  })
})

// ── collocationPointsForRang ─────────────────────────────────────────────────
describe('collocationPointsForRang', () => {
  it('Rang 1 → 3 Punkte', () => {
    expect(collocationPointsForRang(1)).toBe(3)
  })

  it('Rang 3 → 3 Punkte (Top-3-Grenze)', () => {
    expect(collocationPointsForRang(3)).toBe(3)
  })

  it('Rang 4 → 2 Punkte (nearPool-Anfang)', () => {
    expect(collocationPointsForRang(4)).toBe(2)
  })

  it('Rang 7 → 2 Punkte (nearPool-Ende)', () => {
    expect(collocationPointsForRang(7)).toBe(2)
  })

  it('Rang 8 → 1 Punkt (midPool-Anfang)', () => {
    expect(collocationPointsForRang(8)).toBe(1)
  })

  it('Rang 10 → 1 Punkt (midPool-Ende)', () => {
    expect(collocationPointsForRang(10)).toBe(1)
  })

  it('Rang 11 → 0 Punkte (außerhalb aller Pools)', () => {
    expect(collocationPointsForRang(11)).toBe(0)
  })

  it('Rang 99 → 0 Punkte', () => {
    expect(collocationPointsForRang(99)).toBe(0)
  })

  it('behandelt NaN / null als Rang 99 (→ 0 Punkte)', () => {
    expect(collocationPointsForRang(NaN)).toBe(0)
    expect(collocationPointsForRang(null)).toBe(0)
    expect(collocationPointsForRang(undefined)).toBe(0)
  })
})

// ── evaluateCollocationPicks ─────────────────────────────────────────────────
const koll10 = [
  { wort: 'stark',  rang: 1 },
  { wort: 'groß',   rang: 2 },
  { wort: 'klein',  rang: 3 },
  { wort: 'weit',   rang: 4 },
  { wort: 'hoch',   rang: 5 },
  { wort: 'tief',   rang: 7 },
  { wort: 'laut',   rang: 8 },
  { wort: 'leise',  rang: 9 },
  { wort: 'fern',   rang: 10 },
  { wort: 'nah',    rang: 11 },
]

describe('evaluateCollocationPicks', () => {
  it('alle drei Top-3 → Score 9 + Bonus 1 = 10, correct=3, bonus=true', () => {
    const r = evaluateCollocationPicks(['stark', 'groß', 'klein'], koll10)
    expect(r.score).toBe(10)
    expect(r.correct).toBe(3)
    expect(r.top3Count).toBe(3)
    expect(r.bonus).toBe(true)
  })

  it('kein Bonus wenn nicht alle drei in Top-3', () => {
    // stark(3) + groß(3) + weit(2) = 8, kein Bonus
    const r = evaluateCollocationPicks(['stark', 'groß', 'weit'], koll10)
    expect(r.score).toBe(8)
    expect(r.bonus).toBe(false)
  })

  it('unbekanntes Wort → 0 Punkte, erscheint mit rang:null im hits-Array', () => {
    const r = evaluateCollocationPicks(['stark', 'groß', 'fremd'], koll10)
    expect(r.score).toBe(6) // 3+3+0, kein Bonus
    const fremdHit = r.hits.find(h => h.word === 'fremd')
    expect(fremdHit?.rang).toBeNull()
    expect(fremdHit?.points).toBe(0)
  })

  it('leere Auswahl → Score 0, keine Treffer', () => {
    const r = evaluateCollocationPicks([], koll10)
    expect(r.score).toBe(0)
    expect(r.correct).toBe(0)
    expect(r.hits).toHaveLength(0)
  })

  it('leere kollokatoren-Liste → alles 0', () => {
    const r = evaluateCollocationPicks(['stark', 'groß'], [])
    expect(r.score).toBe(0)
    expect(r.correct).toBe(0)
  })

  it('null/undefined als kollokatoren → defensiv 0', () => {
    expect(evaluateCollocationPicks(['stark'], null).score).toBe(0)
    expect(evaluateCollocationPicks(['stark'], undefined).score).toBe(0)
  })

  it('hits-Array enthält einen Eintrag pro Wort in der Auswahl', () => {
    const r = evaluateCollocationPicks(['stark', 'groß', 'klein'], koll10)
    expect(r.hits).toHaveLength(3)
    expect(r.hits[0].word).toBe('stark')
    expect(r.hits[0].rang).toBe(1)
    expect(r.hits[0].points).toBe(3)
  })

  it('mittlerer Pool Rang 8 → 1 Punkt je Treffer', () => {
    const r = evaluateCollocationPicks(['laut'], koll10)
    expect(r.hits[0].points).toBe(1)
  })

  it('Rang 11 (außerhalb) → 0 Punkte, kein correct-Zähler', () => {
    const r = evaluateCollocationPicks(['nah'], koll10)
    expect(r.hits[0].points).toBe(0)
    expect(r.correct).toBe(0)
  })

  it('Klon-Sicherheit: Original-Array wird nicht verändert', () => {
    const selected = ['stark', 'groß', 'klein']
    const copy = [...selected]
    evaluateCollocationPicks(selected, koll10)
    expect(selected).toEqual(copy)
  })
})

// ── calculateMixedScore ───────────────────────────────────────────────────────
describe('calculateMixedScore (Frontend-Singleplayer)', () => {
  it('ist eine direkte Wrapper-Funktion über evaluateCollocationPicks', () => {
    const score = calculateMixedScore(['stark', 'groß', 'klein'], koll10)
    expect(score).toBe(evaluateCollocationPicks(['stark', 'groß', 'klein'], koll10).score)
  })

  it('gibt eine Zahl zurück, kein Objekt', () => {
    expect(typeof calculateMixedScore(['stark'], koll10)).toBe('number')
  })

  it('leere Auswahl → 0', () => {
    expect(calculateMixedScore([], koll10)).toBe(0)
  })
})

// ── matchesFree ───────────────────────────────────────────────────────────────
describe('matchesFree', () => {
  it('exakter Treffer (Groß-/Kleinschreibung egal)', () => {
    expect(matchesFree('arbeiten', 'arbeiten', '')).toBe(true)
    expect(matchesFree('Arbeiten', 'arbeiten', '')).toBe(true)
    expect(matchesFree('ARBEITEN', 'arbeiten', '')).toBe(true)
  })

  it('token-Treffer wird akzeptiert', () => {
    expect(matchesFree('arbeitete', 'arbeiten', 'arbeitete')).toBe(true)
  })

  it('Leerzeichen am Rand werden abgeschnitten', () => {
    expect(matchesFree('  arbeiten  ', 'arbeiten', '')).toBe(true)
  })

  it('Präfix-Toleranz (Eingabe ist Präfix des Kollokators, >= 4 Zeichen)', () => {
    // 'arbeite' (7 Zeichen) ist Präfix von 'arbeiten'
    expect(matchesFree('arbeite', 'arbeiten', '')).toBe(true)
  })

  it('Kollokator ist Präfix der Eingabe (>= 4 Zeichen)', () => {
    // 'arbeiten' ist Präfix von 'arbeitend'
    expect(matchesFree('arbeitend', 'arbeiten', '')).toBe(true)
  })

  it('Präfix-Toleranz greift nur wenn der Kollokator >= 4 Zeichen hat', () => {
    // Kollokator 'ab' (2 Zeichen) → k.length >= 4 ist false → kein Präfix-Match
    expect(matchesFree('ab', 'ab', '')).toBe(true)  // exakter Treffer bleibt gültig
    expect(matchesFree('abc', 'ab', '')).toBe(false) // kein exakter Treffer, k.length < 4
    // Kollokator 'abgehen' (7 Zeichen) → k.length >= 4 → Präfix-Match greift
    expect(matchesFree('ab', 'abgehen', '')).toBe(true)  // 'abgehen'.startsWith('ab') → true
  })

  it('komplett falsches Wort → false', () => {
    expect(matchesFree('spielen', 'arbeiten', '')).toBe(false)
  })

  it('leere Eingabe → false', () => {
    expect(matchesFree('', 'arbeiten', '')).toBe(false)
    expect(matchesFree('   ', 'arbeiten', '')).toBe(false)
  })

  it('null / undefined als Eingabe → false (kein Crash)', () => {
    expect(matchesFree(null, 'arbeiten', '')).toBe(false)
    expect(matchesFree(undefined, 'arbeiten', '')).toBe(false)
  })

  it('null / undefined als Kollokator → false (kein Crash)', () => {
    expect(matchesFree('arbeiten', null, '')).toBe(false)
    expect(matchesFree('arbeiten', undefined, '')).toBe(false)
  })

  it('Vorrang: exakter Kollokator-Match schlägt Präfix', () => {
    // 'ab' würde via Präfix nicht passen, aber exakt schon
    expect(matchesFree('ab', 'ab', '')).toBe(true)
  })

  it('Token-Präfix wird ebenfalls respektiert', () => {
    // token 'arbeitete' ist >= 4 Zeichen → Präfix-Toleranz greift auch
    expect(matchesFree('arbeitet', 'arbeiten', 'arbeitete')).toBe(true)
  })
})

// ── Freitext-Kappung ─────────────────────────────────────────────────────────
// Das maxLength der Eingabefelder ist rein clientseitig; rawAnswer darf bis
// 8000 Zeichen JSON gross sein. Beide Freitext-Runden muessen serverseitig
// kappen, bevor der Wert in der Ergebnisansicht (ggf. am Beamer) landet.
describe('scoreLueckenfueller: Freitext wird auf FREE_ANSWER_MAX_LEN gekappt', () => {
  const LANG = 'x'.repeat(500)

  it('free: value wird gekappt', () => {
    const res = scoreLueckenfueller(
      { type: 'free', punkte: 2, kollokator: 'stellen' },
      { value: LANG },
    )
    expect(res.detail.value).toHaveLength(FREE_ANSWER_MAX_LEN)
  })

  it('double: given wird in jedem Slot gekappt', () => {
    const res = scoreLueckenfueller(
      { type: 'double', sentences: [{ kollokator: 'stellen' }, { kollokator: 'treffen' }] },
      { answers: [LANG, LANG] },
    )
    for (const slot of res.detail.slots) {
      expect(slot.given).toHaveLength(FREE_ANSWER_MAX_LEN)
    }
  })

  it('double: korrekte Antwort bleibt unveraendert und zaehlt weiter', () => {
    const res = scoreLueckenfueller(
      { type: 'double', sentences: [{ kollokator: 'stellen' }, { kollokator: 'treffen' }] },
      { answers: ['stellen', 'treffen'] },
    )
    expect(res.score).toBe(2)
    expect(res.detail.slots.map((s) => s.given)).toEqual(['stellen', 'treffen'])
  })

  it('double: fehlende Antwort bleibt null (kein "null"-String)', () => {
    const res = scoreLueckenfueller(
      { type: 'double', sentences: [{ kollokator: 'stellen' }] },
      { answers: [] },
    )
    expect(res.detail.slots[0].given).toBeNull()
  })
})
