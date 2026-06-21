/**
 * server/__tests__/course.resolve-interactive.test.js
 *
 * Tests der INTERAKTIVEN Auflösung (server/course/resolve.js#resolveItemInteractive,
 * AP8). Anders als der Druck: onWrong/onChoice werden mitgeliefert und
 * {{selected.*}} bleibt als Platzhalter erhalten (der Client füllt die Auswahl).
 * Alle übrigen Korpus-Platzhalter (top/logDice/freq) sind serverseitig gefüllt.
 * KEIN DB-Zugriff – deterministischer Fake-Korpus.
 */

import { describe, expect, it } from 'vitest'
import { resolveItemInteractive, fillStringInteractive } from '../course/resolve.js'
import station1 from '../course/content/station-1.js'

const FEHLER_POOL = [
  { lemma: 'schwer', frequency: 1177, logDice: '8.5000' },
  { lemma: 'grob',   frequency: 200,  logDice: '7.8000' },
  { lemma: 'klein',  frequency: 400,  logDice: '7.0000' },
  { lemma: 'groß',   frequency: 2047, logDice: '6.5000' },
  { lemma: 'dick',   frequency: 19,   logDice: '4.6000' },
]
const ENTSCHEIDUNG_POOL = [
  { lemma: 'treffen', frequency: 900, logDice: '11.5000' },
  { lemma: 'fällen',  frequency: 300, logDice: '8.6000' },
  { lemma: 'fordern', frequency: 500, logDice: '6.0000' },
  { lemma: 'üben',    frequency: 120, logDice: '4.0000' },
]

function fakeCorpus(poolByLemma, beleg) {
  return {
    queryRelation(q) { return poolByLemma[q.lemma] ?? [] },
    fetchBeleg() { return beleg ?? null },
  }
}
const getItem = id => station1.tasks.find(t => t.id === id)

describe('resolveItemInteractive – static Item (DaZ)', () => {
  const r = resolveItemInteractive(getItem('s1-f1-alltag-daz'), { corpus: fakeCorpus({}) })
  it('reicht payload durch', () => {
    expect(r.payload.anchors).toHaveLength(3)
  })
  it('liefert onCorrect UND onWrong (interaktiv)', () => {
    expect(r.feedback.onCorrect).toBeTruthy()
    expect(r.feedback.onWrong).toBeTruthy()
  })
})

describe('resolveItemInteractive – corpus F1 (Zuordnen)', () => {
  const r = resolveItemInteractive(getItem('s1-f1-entscheidung-verb-seki'), {
    corpus: fakeCorpus({ Entscheidung: ENTSCHEIDUNG_POOL }),
  })
  it('Kandidaten + Antwort-Ids aufgelöst', () => {
    const answers = r.payload.candidates.filter(c => c.isAnswer).map(c => c.label).sort()
    expect(answers).toEqual(['fällen', 'treffen'])
    expect(r.solution.map.a1.length).toBe(2)
  })
  it('onCorrect: {{top.lemma}} gefüllt (treffen), keine Platzhalter', () => {
    expect(r.feedback.onCorrect).toMatch(/treffen/)
    expect(r.feedback.onCorrect).not.toMatch(/\{\{/)
  })
  it('onWrong: {{selected.lemma}} bleibt erhalten, {{top.lemma}} gefüllt', () => {
    expect(r.feedback.onWrong).toMatch(/\{\{selected\.lemma\}\}/)
    expect(r.feedback.onWrong).toMatch(/treffen/)
  })
})

describe('resolveItemInteractive – corpus F3 (onChoice + selected)', () => {
  const r = resolveItemInteractive(getItem('s1-f3-fehler-vergleich-sek2'), {
    corpus: fakeCorpus({ Fehler: FEHLER_POOL }),
  })
  it('Varianten = contrastPair (groß + schwer), typical markiert', () => {
    const labels = r.payload.variants.map(v => v.label)
    expect(labels).toContain('groß')
    expect(labels).toContain('schwer')
    expect(r.payload.variants.filter(v => v.typical).map(v => v.label)).toEqual(['schwer'])
  })
  it('onChoice[@selected] vorhanden: selected erhalten, logDice:1 gefüllt (8,5)', () => {
    const text = r.feedback.onChoice?.['@selected']
    expect(text).toBeTruthy()
    expect(text).toMatch(/\{\{selected\.(lemma|logDice)\}\}/)
    expect(text).toMatch(/8,5/)
    expect(text).not.toMatch(/\{\{(top|logDice:1)/)
  })
})

describe('resolveItemInteractive – F2 Zielwörter', () => {
  const r = resolveItemInteractive(getItem('s1-f2-entscheidung-markieren-seki'), {
    corpus: fakeCorpus({ Entscheidung: ENTSCHEIDUNG_POOL }, { satz: 'Wir müssen eine Entscheidung treffen.', quelle: 'Korpus' }),
  })
  it('targetWords = [Anker, stärkster Partner], belegQuery entfernt', () => {
    expect(r.payload.targetWords).toEqual(['Entscheidung', 'treffen'])
    expect(r.payload.belegQuery).toBeUndefined()
    expect(r.payload.sentence).toMatch(/Entscheidung treffen/)
  })
})

describe('resolveItemInteractive – F5 (Datenblick)', () => {
  const r = resolveItemInteractive(getItem('s1-f5-fehler-datenblick-sek2'), {
    corpus: fakeCorpus({ Fehler: FEHLER_POOL }),
  })
  it('Tabelle + geschlossene Antworten (q1 groß, q2 schwer)', () => {
    expect(r.payload.table.length).toBeGreaterThanOrEqual(3)
    expect(r.solution.answers.q1).toBe('groß')
    expect(r.solution.answers.q2).toBe('schwer')
  })
})

describe('fillStringInteractive', () => {
  const ctx = {
    byLogDice: FEHLER_POOL.map(r => ({ ...r, logDice: Number(r.logDice) })),
    byFreq: [...FEHLER_POOL].map(r => ({ ...r, logDice: Number(r.logDice) })).sort((a, b) => b.frequency - a.frequency),
    lemma: 'Fehler',
  }
  it('füllt top, behält selected', () => {
    const out = fillStringInteractive('{{top.lemma}} vs {{selected.lemma}}', ctx)
    expect(out).toBe('schwer vs {{selected.lemma}}')
  })
})
