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
  { lemma: 'treffen',   frequency: 900, logDice: '11.5000' },
  { lemma: 'fällen',    frequency: 300, logDice: '8.6000' },
  { lemma: 'fordern',   frequency: 500, logDice: '6.0000' },
  { lemma: 'begründen', frequency: 200, logDice: '5.0000' },
  { lemma: 'kritisieren', frequency: 120, logDice: '4.0000' },
]
// Fremd-Lemma-Distraktoren (AP21-QA): abwegige „Lied"-Verben.
const LIED_POOL = [
  { lemma: 'singen',      frequency: 800, logDice: '12.3000' },
  { lemma: 'anstimmen',   frequency: 200, logDice: '8.8000' },
  { lemma: 'komponieren', frequency: 150, logDice: '8.1000' },
  { lemma: 'mitsingen',   frequency: 90,  logDice: '6.9000' },
  { lemma: 'intonieren',  frequency: 30,  logDice: '6.0000' },
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

describe('resolve – corpus-template F1 (Zuordnen + Fremd-Distraktoren)', () => {
  const resolved = resolveItem(getItem('s1-f1-entscheidung-verb-seki'), {
    corpus: fakeCorpus({ Entscheidung: ENTSCHEIDUNG_POOL, Lied: LIED_POOL }),
  })
  it('@from:bindings → Kandidaten alphabetisch, echte Antworten + abwegige Distraktoren', () => {
    const labels = resolved.payload.candidates.map(c => c.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'de')))
    const answers = resolved.payload.candidates.filter(c => c.isAnswer).map(c => c.label)
    // bindings.answer = [1..5] → die 5 echten Kollokatoren
    expect(answers).toHaveLength(5)
    expect(answers).toContain('treffen')
    // 5 abwegige Distraktoren aus „Lied" – nie Lösung
    const distractors = resolved.payload.candidates.filter(c => !c.isAnswer).map(c => c.label)
    expect(distractors).toContain('singen')
    expect(answers).not.toContain('singen')
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

describe('resolve – Fremd-Lemma-Distraktoren (AP21-QA)', () => {
  const TOR_POOL = [
    { lemma: 'schießen', frequency: 800, logDice: '12.0000' },
    { lemma: 'erzielen', frequency: 400, logDice: '10.0000' },
    { lemma: 'abwehren', frequency: 150, logDice: '9.0000' },
  ]
  const item = {
    id: 'x-distractor', station: 1, format: 'F1', level: 'SekI', source: 'corpus-template',
    prompt: 'Welche Verben passen zu „Entscheidung"?',
    corpusQuery: { lemma: 'Entscheidung', pos: 'Substantiv', relation: '~OBJA' },
    distractorQuery: { lemma: 'Tor', pos: 'Substantiv', relation: '~OBJA' },
    bindings: { answer: [1, 2], distractors: { rankRange: [1, 2] } },
    payload: { anchors: [{ id: 'a1', label: 'Entscheidung' }], candidates: '@from:bindings', multiplePerAnchor: true },
    display: { metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {},
  }
  const corpus = {
    queryRelation(q) {
      if (q.lemma === 'Entscheidung') return ENTSCHEIDUNG_POOL
      if (q.lemma === 'Tor') return TOR_POOL
      return []
    },
    fetchBeleg() { return null },
  }
  const resolved = resolveItem(item, { corpus })

  it('mischt abwegige Distraktoren des Fremd-Lemmas als Nicht-Antwort bei', () => {
    const cands = resolved.payload.candidates
    const labels = cands.map(c => c.label)
    expect(labels).toContain('treffen')  // echte Antwort (Entscheidung)
    expect(labels).toContain('schießen') // abwegiger Distraktor (Tor)
    expect(cands.find(c => c.label === 'schießen').isAnswer).toBe(false)
    expect(cands.find(c => c.label === 'treffen').isAnswer).toBe(true)
  })
  it('nur rankRange-viele Distraktoren (Tor: schießen+erzielen, nicht abwehren)', () => {
    const labels = resolved.payload.candidates.map(c => c.label)
    expect(labels).toContain('erzielen')
    expect(labels).not.toContain('abwehren') // außerhalb rankRange [1,2]
  })
  it('solution.map enthält nur die echten Antworten', () => {
    const ids = resolved.solution.map.a1
    const answerLabels = resolved.payload.candidates.filter(c => ids.includes(c.id)).map(c => c.label)
    expect(answerLabels.sort()).toEqual(['fällen', 'treffen'])
  })
})

describe('resolve – Eigenes Lemma override', () => {
  it('lemma überschreibt corpusQuery.lemma (Distraktor-Lemma bleibt fix)', () => {
    const seen = []
    const corpus = {
      queryRelation(q) {
        seen.push(q.lemma)
        if (q.lemma === 'Antwort') return ENTSCHEIDUNG_POOL
        if (q.lemma === 'Lied') return LIED_POOL
        return []
      },
      fetchBeleg() { return null },
    }
    const resolved = resolveItem(getItem('s1-f1-entscheidung-verb-seki'), { corpus, lemma: 'Antwort' })
    // Anker-Query wurde mit „Antwort" gestellt, das Distraktor-Lemma blieb „Lied".
    expect(seen).toContain('Antwort')
    expect(seen).toContain('Lied')
    expect(resolved.payload.candidates.map(c => c.label)).toContain('treffen')
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
