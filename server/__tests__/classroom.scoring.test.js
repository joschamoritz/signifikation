import { describe, it, expect } from 'vitest'
import {
  scoreKollokationen,
  scoreWortzwilling,
  scoreZeitenwende,
  scoreLueckenfueller,
  scoreSubmission,
} from '../classroom/scoring/index.js'

/*
 * Server-autoritatives Scoring (D13).
 * Tests stehen bewusst vor der Implementierung – siehe Plan T-6.2
 * (vorgezogen). Erwartete Punktwerte stammen aus den bestehenden
 * Singleplayer-Pfaden (src/utils/gameLogic.js, WzResultsView,
 * Zeitenwende.jsx, Lueckenfueller.jsx) und sind dort durch
 * gameLogic.test.js bzw. die Komponenten-Tests bereits validiert.
 */

const kollokatorenSample = [
  { wort: 'stark',  rang: 1 },
  { wort: 'groß',   rang: 2 },
  { wort: 'klein',  rang: 3 },
  { wort: 'weit',   rang: 4 },
  { wort: 'hoch',   rang: 6 },
  { wort: 'tief',   rang: 8 },
  { wort: 'laut',   rang: 9 },
  { wort: 'leise',  rang: 10 },
  { wort: 'fern',   rang: 11 },
  { wort: 'nah',    rang: 12 },
]

describe('scoreKollokationen', () => {
  it('vergibt 10 Punkte bei perfekter Wahl (alle Top-3 + Bonus)', () => {
    const r = scoreKollokationen(
      { kollokatoren: kollokatorenSample },
      { selected: ['stark', 'groß', 'klein'] },
    )
    expect(r.score).toBe(10)
    expect(r.maxScore).toBe(10)
    expect(r.correct).toBe(3)
  })

  it('ignoriert Klick-Reihenfolge', () => {
    const r = scoreKollokationen(
      { kollokatoren: kollokatorenSample },
      { selected: ['klein', 'stark', 'groß'] },
    )
    expect(r.score).toBe(10)
  })

  it('vergibt 8 Punkte fuer 2x Top-3 + 1x Rang 4-7 (kein Bonus)', () => {
    const r = scoreKollokationen(
      { kollokatoren: kollokatorenSample },
      { selected: ['stark', 'groß', 'weit'] },
    )
    expect(r.score).toBe(8)
    expect(r.correct).toBe(2)
  })

  it('vergibt 7 Punkte fuer 2x Top-3 + 1x Rang 8-10', () => {
    const r = scoreKollokationen(
      { kollokatoren: kollokatorenSample },
      { selected: ['stark', 'groß', 'tief'] },
    )
    expect(r.score).toBe(7)
  })

  it('vergibt 6 Punkte wenn ein unbekanntes Wort dabei ist', () => {
    const r = scoreKollokationen(
      { kollokatoren: kollokatorenSample },
      { selected: ['unbekannt', 'stark', 'groß'] },
    )
    expect(r.score).toBe(6)
  })

  it('liefert 0 Punkte bei leerer Auswahl', () => {
    const r = scoreKollokationen(
      { kollokatoren: kollokatorenSample },
      { selected: [] },
    )
    expect(r.score).toBe(0)
    expect(r.correct).toBe(0)
  })

  it('haendelt fehlende kollokatoren-Liste defensiv', () => {
    const r = scoreKollokationen({}, { selected: ['a', 'b', 'c'] })
    expect(r.score).toBe(0)
    expect(r.maxScore).toBe(10)
  })

  it('akzeptiert maximal 3 Auswahlen, weitere werden ignoriert', () => {
    const r = scoreKollokationen(
      { kollokatoren: kollokatorenSample },
      { selected: ['stark', 'groß', 'klein', 'weit', 'tief'] },
    )
    expect(r.score).toBe(10) // nur die ersten 3 zaehlen
  })
})

const wzKollokatoren = [
  { wort: 'apfel',   zuordnung: 'A' },
  { wort: 'birne',   zuordnung: 'A' },
  { wort: 'kirsche', zuordnung: 'A' },
  { wort: 'banane',  zuordnung: 'A' },
  { wort: 'mango',   zuordnung: 'A' },
  { wort: 'tomate',  zuordnung: 'B' },
  { wort: 'gurke',   zuordnung: 'B' },
  { wort: 'paprika', zuordnung: 'B' },
  { wort: 'salat',   zuordnung: 'B' },
  { wort: 'zwiebel', zuordnung: 'B' },
]

describe('scoreWortzwilling', () => {
  it('zaehlt 10 bei perfekter Zuordnung', () => {
    const r = scoreWortzwilling(
      { kollokatoren: wzKollokatoren },
      {
        zoneA: ['apfel', 'birne', 'kirsche', 'banane', 'mango'],
        zoneB: ['tomate', 'gurke', 'paprika', 'salat', 'zwiebel'],
      },
    )
    expect(r.score).toBe(10)
    expect(r.maxScore).toBe(10)
    expect(r.correct).toBe(10)
  })

  it('zaehlt nur korrekt platzierte Woerter', () => {
    const r = scoreWortzwilling(
      { kollokatoren: wzKollokatoren },
      {
        // 3 in A korrekt, 2 in A falsch
        zoneA: ['apfel', 'birne', 'kirsche', 'tomate', 'gurke'],
        // 3 in B korrekt, 2 in B falsch
        zoneB: ['paprika', 'salat', 'zwiebel', 'banane', 'mango'],
      },
    )
    expect(r.score).toBe(6)
    expect(r.correct).toBe(6)
  })

  it('ignoriert Wörter, die nicht im Snapshot stehen (kein Crash)', () => {
    const r = scoreWortzwilling(
      { kollokatoren: wzKollokatoren },
      { zoneA: ['apfel', 'fremd'], zoneB: ['tomate'] },
    )
    expect(r.score).toBe(2)
  })

  it('haendelt fehlenden Snapshot defensiv', () => {
    const r = scoreWortzwilling({}, { zoneA: [], zoneB: [] })
    expect(r.score).toBe(0)
    expect(r.maxScore).toBe(10)
  })
})

describe('scoreZeitenwende', () => {
  const words = [
    { wort: 'a', periode: 'pre' },
    { wort: 'b', periode: 'post' },
    { wort: 'c', periode: 'pre' },
    { wort: 'd', periode: 'pre' },
    { wort: 'e', periode: 'post' },
    { wort: 'f', periode: 'post' },
    { wort: 'g', periode: 'pre' },
    { wort: 'h', periode: 'pre' },
    { wort: 'i', periode: 'post' },
    { wort: 'j', periode: 'pre' },
  ]

  it('zaehlt richtige Periode-Treffer', () => {
    const r = scoreZeitenwende(
      { words },
      { answers: ['pre','post','pre','pre','post','post','pre','pre','post','pre'] },
    )
    expect(r.score).toBe(10)
    expect(r.maxScore).toBe(10)
    expect(r.correct).toBe(10)
  })

  it('zaehlt teilweise korrekte Antworten', () => {
    const r = scoreZeitenwende(
      { words },
      { answers: ['post','post','pre','pre','pre','post','pre','post','post','pre'] },
    )
    // pos 0: pre/post → falsch
    // pos 1: post/post → richtig
    // pos 2-3: pre/pre → richtig
    // pos 4: pre/post → falsch
    // pos 5: post/post → richtig
    // pos 6: pre/pre → richtig
    // pos 7: post/pre → falsch
    // pos 8: post/post → richtig
    // pos 9: pre/pre → richtig
    expect(r.score).toBe(7)
  })

  it('toleriert kuerzere Antwort-Arrays (fehlende = falsch)', () => {
    const r = scoreZeitenwende(
      { words },
      { answers: ['pre', 'post'] },
    )
    expect(r.score).toBe(2)
  })

  it('haendelt fehlenden Snapshot defensiv', () => {
    const r = scoreZeitenwende({}, { answers: ['pre'] })
    expect(r.score).toBe(0)
    expect(r.maxScore).toBe(10)
  })
})

describe('scoreLueckenfueller', () => {
  it('choice: volle Punkte bei korrekter Auswahl', () => {
    const r = scoreLueckenfueller(
      { type: 'choice', kollokator: 'sehen', punkte: 3 },
      { selected: 'sehen' },
    )
    expect(r.score).toBe(3)
    expect(r.maxScore).toBe(3)
    expect(r.correct).toBe(1)
  })

  it('choice: 0 Punkte bei falscher Auswahl', () => {
    const r = scoreLueckenfueller(
      { type: 'choice', kollokator: 'sehen', punkte: 3 },
      { selected: 'horen' },
    )
    expect(r.score).toBe(0)
    expect(r.maxScore).toBe(3)
    expect(r.correct).toBe(0)
  })

  it('double: 1 Punkt pro korrektem Slot (max 2)', () => {
    const round = {
      type: 'double',
      sentences: [
        { kollokator: 'gehen' },
        { kollokator: 'kommen' },
      ],
    }
    const r = scoreLueckenfueller(round, { answers: ['gehen', 'kommen'] })
    expect(r.score).toBe(2)
    expect(r.maxScore).toBe(2)
    expect(r.correct).toBe(2)
  })

  it('double: teilweise richtig', () => {
    const round = {
      type: 'double',
      sentences: [
        { kollokator: 'gehen' },
        { kollokator: 'kommen' },
      ],
    }
    const r = scoreLueckenfueller(round, { answers: ['kommen', 'kommen'] })
    expect(r.score).toBe(1)
  })

  it('free: matchesFree akzeptiert exakte und Praefix-Treffer (>=4 Zeichen)', () => {
    const round = { type: 'free', kollokator: 'arbeiten', punkte: 3 }
    expect(scoreLueckenfueller(round, { value: 'arbeiten' }).score).toBe(3)
    // Praefix-Toleranz: 'arbeite' ist Praefix von 'arbeiten'
    expect(scoreLueckenfueller(round, { value: 'arbeite' }).score).toBe(3)
    // 'arbeitet' ist KEIN Praefix und 'arbeiten' kein Praefix davon → falsch
    expect(scoreLueckenfueller(round, { value: 'arbeitet' }).score).toBe(0)
    expect(scoreLueckenfueller(round, { value: 'spielen' }).score).toBe(0)
  })

  it('free: token-Variante wird akzeptiert', () => {
    const round = { type: 'free', kollokator: 'arbeiten', token: 'arbeitete', punkte: 3 }
    expect(scoreLueckenfueller(round, { value: 'arbeitete' }).score).toBe(3)
  })

  it('haendelt unbekannten Typ als 0/0', () => {
    const r = scoreLueckenfueller({ type: 'mystery' }, {})
    expect(r.score).toBe(0)
    expect(r.maxScore).toBe(0)
  })
})

describe('scoreSubmission Dispatcher', () => {
  it('dispatcht auf den richtigen Modus', () => {
    const r = scoreSubmission({
      mode: 'kollokationen',
      contentSnapshot: { kollokatoren: kollokatorenSample },
      rawAnswer: { selected: ['stark', 'groß', 'klein'] },
    })
    expect(r.score).toBe(10)
  })

  it('wirft bei unbekanntem Modus', () => {
    expect(() => scoreSubmission({
      mode: 'mystery-mode',
      contentSnapshot: {},
      rawAnswer: {},
    })).toThrow(/unbekannter Modus/i)
  })

  it('lueckenfueller dispatcht ueber roundIndex', () => {
    const contentSnapshot = {
      rounds: [
        { type: 'choice', kollokator: 'a', punkte: 1 },
        { type: 'choice', kollokator: 'b', punkte: 2 },
      ],
    }
    const r = scoreSubmission({
      mode: 'lueckenfueller',
      contentSnapshot,
      rawAnswer: { selected: 'b' },
      roundIndex: 1,
    })
    expect(r.score).toBe(2)
  })
})
