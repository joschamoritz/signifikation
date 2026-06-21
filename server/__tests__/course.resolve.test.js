/**
 * server/__tests__/course.resolve.test.js
 *
 * Reine Tests der Druck-Auflösung (server/course/resolve.js): Korpus-Direktiven
 * (@from:bindings…), Platzhalter ({{top.lemma}} …), Frequenz-/logDice-Sortierung
 * und der „selected ist interaktiv-only"-Pfad. KEIN DB-Zugriff – der Korpus wird
 * als deterministischer Fake hereingereicht.
 */

import { describe, expect, it } from 'vitest'
import { resolveItem, fmtLogDice, fmtFrequency, fillString } from '../course/resolve.js'
import station1 from '../course/content/station-1.js'

// Fake-Pool für „Fehler"/ATTR: schwer = typischster (logDice hoch), groß = häufigster (freq hoch).
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
  { lemma: 'kritisieren', frequency: 120, logDice: '4.0000' },
]

function fakeCorpus(poolByLemma, beleg) {
  return {
    queryRelation(q) { return poolByLemma[q.lemma] ?? [] },
    fetchBeleg() { return beleg ?? null },
  }
}

const getItem = id => station1.tasks.find(t => t.id === id)

describe('resolve – Formatierung', () => {
  it('logDice deutsches Komma, 1 Nachkommastelle', () => {
    expect(fmtLogDice('8.5000')).toBe('8,5')
    expect(fmtLogDice(11.54)).toBe('11,5')
    expect(fmtLogDice(undefined)).toBe('—')
  })
  it('Frequenz mit Tausenderpunkt', () => {
    expect(fmtFrequency(2047)).toBe('2.047')
    expect(fmtFrequency(19)).toBe('19')
  })
})

describe('resolve – static Item (DaZ)', () => {
  const resolved = resolveItem(getItem('s1-f1-alltag-daz'), { corpus: fakeCorpus({}) })
  it('reicht payload unverändert durch', () => {
    expect(resolved.payload.anchors).toHaveLength(3)
    expect(resolved.payload.candidates.map(c => c.label)).toContain('treffen')
  })
  it('liefert onCorrect-Feedback fürs Item-Niveau', () => {
    expect(resolved.feedback.onCorrect).toMatch(/Entscheidung treffen/)
  })
})

describe('resolve – corpus-template F1 (Zuordnen)', () => {
  const resolved = resolveItem(getItem('s1-f1-entscheidung-verb-seki'), {
    corpus: fakeCorpus({ Entscheidung: ENTSCHEIDUNG_POOL }),
  })
  it('@from:bindings → Kandidaten alphabetisch, Antworten markiert', () => {
    const labels = resolved.payload.candidates.map(c => c.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'de')))
    const answers = resolved.payload.candidates.filter(c => c.isAnswer).map(c => c.label)
    // bindings.answer = [1,2] → logDice-Rang 1+2 = treffen, fällen
    expect(answers.sort()).toEqual(['fällen', 'treffen'])
  })
  it('solution.map → korrekte candidate-Ids', () => {
    const ids = resolved.solution.map.a1
    const answerIds = resolved.payload.candidates.filter(c => c.isAnswer).map(c => c.id)
    expect(ids.sort()).toEqual(answerIds.sort())
  })
  it('Platzhalter {{top.lemma}} im Feedback gefüllt (= treffen)', () => {
    expect(resolved.feedback.onCorrect).toMatch(/treffen/)
    expect(resolved.feedback.onCorrect).not.toMatch(/\{\{/)
  })
})

describe('resolve – corpus-template F3 (contrastPair, häufig≠typisch)', () => {
  const resolved = resolveItem(getItem('s1-f3-fehler-vergleich-sek2'), {
    corpus: fakeCorpus({ Fehler: FEHLER_POOL }),
  })
  it('contrastPair = [freq:1, logDice:1] → groß (häufig) + schwer (typisch)', () => {
    const labels = resolved.payload.variants.map(v => v.label)
    expect(labels).toContain('groß')
    expect(labels).toContain('schwer')
  })
  it('typische Variante (logDice:1) ist als typical markiert', () => {
    const typical = resolved.payload.variants.filter(v => v.typical).map(v => v.label)
    expect(typical).toEqual(['schwer'])
  })
  it('Erwartungshorizont-Platzhalter gefüllt (logDice:1 = schwer, freq:1 = groß)', () => {
    const s = JSON.stringify(resolved.solution)
    expect(s).toMatch(/schwer/)
    expect(s).toMatch(/groß/)
    expect(s).not.toMatch(/\{\{/)
  })
})

describe('resolve – corpus-template F5 (Datentabelle)', () => {
  const resolved = resolveItem(getItem('s1-f5-fehler-datenblick-sek2'), {
    corpus: fakeCorpus({ Fehler: FEHLER_POOL }),
  })
  it('tableRows aufgelöst mit Frequenz + logDice', () => {
    expect(resolved.payload.table.length).toBeGreaterThanOrEqual(3)
    const row = resolved.payload.table.find(r => r.verbindung === 'schwer')
    expect(row.frequency).toBe(1177)
    expect(Number(row.logDice)).toBeCloseTo(8.5)
  })
  it('q1 (am häufigsten) = groß, q2 (am typischsten) = schwer', () => {
    expect(resolved.solution.answers.q1).toBe('groß')
    expect(resolved.solution.answers.q2).toBe('schwer')
  })
})

describe('resolve – F2 Belegsatz', () => {
  it('belegQuery → echter Satz + Quelle, belegQuery entfernt', () => {
    const resolved = resolveItem(getItem('s1-f2-entscheidung-markieren-seki'), {
      corpus: fakeCorpus({ Entscheidung: ENTSCHEIDUNG_POOL }, { satz: 'Wir müssen eine Entscheidung treffen.', quelle: 'Korpus · 2019' }),
    })
    expect(resolved.payload.sentence).toMatch(/Entscheidung treffen/)
    expect(resolved.beleghinweis).toBe('Korpus · 2019')
    expect(resolved.payload.belegQuery).toBeUndefined()
  })
})

describe('resolve – Eigenes Lemma override', () => {
  it('lemma überschreibt corpusQuery.lemma', () => {
    const corpus = {
      queryRelation(q) { expect(q.lemma).toBe('Antwort'); return ENTSCHEIDUNG_POOL },
      fetchBeleg() { return null },
    }
    const resolved = resolveItem(getItem('s1-f1-entscheidung-verb-seki'), { corpus, lemma: 'Antwort' })
    expect(resolved.payload.candidates.length).toBeGreaterThan(0)
  })
})

describe('fillString – selected ist interaktiv-only', () => {
  it('verwirft Strings mit {{selected.*}} (→ null)', () => {
    const ctx = { byLogDice: FEHLER_POOL, byFreq: FEHLER_POOL, lemma: 'Fehler' }
    expect(fillString('{{selected.lemma}} hat logDice {{selected.logDice}}', ctx)).toBeNull()
  })
  it('füllt top/logDice/freq korrekt', () => {
    const ctx = { byLogDice: FEHLER_POOL, byFreq: [...FEHLER_POOL].sort((a, b) => b.frequency - a.frequency), lemma: 'Fehler' }
    expect(fillString('{{top.lemma}}', ctx)).toBe('schwer')
    expect(fillString('{{freq:1.lemma}}', ctx)).toBe('groß')
    expect(fillString('{{logDice:1.logDice}}', ctx)).toBe('8,5')
  })
})
