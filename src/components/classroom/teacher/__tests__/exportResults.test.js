import { describe, it, expect } from 'vitest'
import { buildResultsCsv, resultsCsvFilename } from '../exportResults'

const RESULTS = {
  session: { id: 's1', title: 'Klasse 8b', finishedAt: 1718351400000 },
  totals:  { participants: 23, submissions: 115 },
  byLemma: [
    { mode: 'kollokationen', lemma: 'Lärm',  participants: 23, avgScore: 7, maxScore: 10, hitRatePct: 72, topDistractor: { label: 'leise', count: 5 } },
    { mode: 'zeitenwende',   lemma: 'Handy', participants: 22, avgScore: 8, maxScore: 10, hitRatePct: 80, topDistractor: null },
  ],
}

describe('buildResultsCsv', () => {
  it('enthält Kopf, Spaltenüberschrift und eine Zeile je Lemma (Modus übersetzt)', () => {
    const csv = buildResultsCsv(RESULTS)
    expect(csv).toMatch(/Sitzung;Klasse 8b/)
    expect(csv).toMatch(/Teilnehmer;23/)
    expect(csv).toMatch(/Modus;Lemma;Teilnehmer/)
    expect(csv).toMatch(/Kollokationen;Lärm;23;7;10;72;leise;5/)
    // fehlender Distraktor → zwei leere Felder am Ende
    expect(csv).toMatch(/Zeitenwende;Handy;22;8;10;80;;/)
  })

  it('quotet Felder mit Semikolon (RFC-4180)', () => {
    const csv = buildResultsCsv({ session: { title: 'A;B' }, totals: {}, byLemma: [] })
    expect(csv).toMatch(/Sitzung;"A;B"/)
  })

  it('resultsCsvFilename baut einen sicheren Dateinamen', () => {
    expect(resultsCsvFilename(RESULTS)).toMatch(/^Auswertung_Klasse_8b_\d{4}-\d{2}-\d{2}\.csv$/)
  })
})
