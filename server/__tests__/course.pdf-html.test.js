/**
 * server/__tests__/course.pdf-html.test.js
 *
 * Reine Tests der HTML-Builder (server/course/pdf/html.js) + Theme. Kein
 * Browser/PDF, kein DB-Zugriff: aufgelöste Items (Fake-Korpus) → HTML-String,
 * dann Assertions auf Didaktik-Standards §5 (DM Sans ≥12 pt, Worked Example
 * zuerst, Fußnoten, keine geleakten Direktiven/Platzhalter, CD dezent) und §2
 * (Entwurf: Dreiklang + Verlauf) sowie Querformat-Beamer.
 */

import { describe, expect, it } from 'vitest'
import {
  renderArbeitsblattHtml,
  renderLoesungHtml,
  renderUnterrichtsentwurfHtml,
  renderBeamerHtml,
} from '../course/pdf/html.js'
import { buildStationHtml } from '../course/pdf/generate.js'
import { resolveItems } from '../course/resolve.js'
import station1 from '../course/content/station-1.js'
import lesson1 from '../course/lesson/station-1.js'

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
]
const corpus = {
  queryRelation(q) {
    if (q.lemma === 'Fehler') return FEHLER_POOL
    if (q.lemma === 'Entscheidung') return ENTSCHEIDUNG_POOL
    return []
  },
  fetchBeleg(lemma, partner) {
    return { satz: `Wir müssen eine ${lemma} ${partner}.`, quelle: 'Korpus · 2019' }
  },
}

const station = station1.station
const byLevel = level => station1.tasks.filter(t => t.level === level)
const resolvedSekII = resolveItems(byLevel('SekII'), { corpus })
const resolvedDaZ = resolveItems(byLevel('DaZ'), { corpus })

// keine geleakten Engine-Direktiven oder Roh-Platzhalter im fertigen HTML
function assertClean(html) {
  expect(html).not.toMatch(/@from:bindings/)
  expect(html).not.toMatch(/\{\{/)
}

describe('Arbeitsblatt', () => {
  const html = renderArbeitsblattHtml({ station, level: 'SekII', items: resolvedSekII })

  it('ist ein vollständiges HTML-Dokument', () => {
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toMatch(/<\/html>$/)
  })
  it('§5: DM Sans als Body-Font, ≥ 12 pt', () => {
    expect(html).toMatch(/font-family:\s*'DM Sans'/)
    expect(html).toMatch(/font-size:\s*12pt/)
  })
  it('§5: Worked Example steht VOR der ersten nummerierten Aufgabe', () => {
    const worked = html.indexOf('worked-label')
    const firstTask = html.indexOf('class="task-no"')
    expect(worked).toBeGreaterThan(-1)
    expect(firstTask).toBeGreaterThan(-1)
    expect(worked).toBeLessThan(firstTask)
  })
  it('zeigt Korpuswerte (Frequenz/logDice) im SekII-Material', () => {
    expect(html).toMatch(/logDice/)
    expect(html).toMatch(/8,5/)        // schwer
    expect(html).toMatch(/2\.047/)     // groß, Frequenz
  })
  it('Belege als nummerierte Fußnoten + Marker', () => {
    expect(html).toMatch(/class="footnotes"/)
    expect(html).toMatch(/class="sup"/)
    expect(html).toMatch(/Steyer, Kathrin|Bubenhofer, Noah/)
  })
  it('keine geleakten Direktiven/Platzhalter', () => assertClean(html))
  it('Name-/Klasse-/Datum-Felder vorhanden', () => {
    expect(html).toMatch(/Name:/)
    expect(html).toMatch(/Datum:/)
  })
})

describe('Arbeitsblatt – DaZ (keine Zahlen, §5/Differenzierung)', () => {
  const html = renderArbeitsblattHtml({ station, level: 'DaZ', items: resolvedDaZ })
  it('zeigt keine logDice-Werte', () => {
    expect(html).not.toMatch(/logDice/)
  })
  it('rendert Wortpartner-Chips', () => {
    expect(html).toMatch(/class="chip"/)
    assertClean(html)
  })
})

describe('Lösung / Erwartungshorizont', () => {
  const html = renderLoesungHtml({ station, level: 'SekII', items: resolvedSekII })
  it('nennt die Lösung (schwer) und Erwartungshorizont-Kriterien', () => {
    expect(html).toMatch(/Lösung/)
    expect(html).toMatch(/schwer/)
    expect(html).toMatch(/class="rubric"/)
  })
  it('enthält einen Merksatz', () => {
    expect(html).toMatch(/Merksatz/)
  })
  it('keine geleakten Direktiven/Platzhalter', () => assertClean(html))
})

describe('Unterrichtsentwurf (§2: Dreiklang + Verlauf)', () => {
  const html = renderUnterrichtsentwurfHtml({ entwurf: lesson1.entwurf })
  it('enthält den Dreiklang (Gegenstand/Thema/SpLz)', () => {
    expect(html).toMatch(/Gegenstand/)
    expect(html).toMatch(/Schwerpunktlernziel/)
    expect(html).toMatch(/indem sie/) // SpLz operationalisiert
  })
  it('Verlauf mit Spalten Arbeitsschritt/Kommentar/Interaktion/Medien', () => {
    expect(html).toMatch(/Arbeitsschritt/)
    expect(html).toMatch(/Interaktion/)
    expect(html).toMatch(/Medien/)
  })
  it('von-Brand-Phasen vorhanden (Plateaubildung)', () => {
    expect(html).toMatch(/Plateaubildung/)
    expect(html).toMatch(/Erarbeitung/)
    expect(html).toMatch(/Ergebnissicherung/)
  })
  it('KLP-Bezug + Fußnoten', () => {
    expect(html).toMatch(/KLP/)
    expect(html).toMatch(/class="footnotes"/)
  })
})

describe('Beamer-Folien (Querformat)', () => {
  const html = renderBeamerHtml({ slides: lesson1.beamer.slides })
  it('Querformat via @page (A4 quer)', () => {
    expect(html).toMatch(/@page\s*\{\s*size:\s*297mm 167mm/)
  })
  it('hat eine Titelfolie + Merksatzfolie', () => {
    expect(html).toMatch(/Wortpartner &amp; Kollokationen/)
    expect(html).toMatch(/Korpora übersetzen Konventionen/)
  })
  it('große Type (h1 ≥ 40pt)', () => {
    expect(html).toMatch(/font-size:\s*40pt/)
  })
})

describe('buildStationHtml – Schutz gegen leere Korpus-Items (AP21-QA)', () => {
  const emptyCorpus = { queryRelation() { return [] }, fetchBeleg() { return null } }
  const fullCorpus = {
    queryRelation(q) {
      // genug Zeilen für alle Korpus-Items (Antworten + Distraktoren + Tabellen)
      return Array.from({ length: 12 }, (_, i) => ({
        lemma: `${q.lemma}-p${i + 1}`, frequency: 100 - i, logDice: `${(12 - i)}.0000`,
      }))
    },
    fetchBeleg(lemma, partner) { return { satz: `Ein Satz mit ${lemma} ${partner}.`, quelle: 'Korpus' } },
  }

  it('strictCorpus + leerer Korpus → wirft (statt still leere Arbeitsblätter)', () => {
    expect(() => buildStationHtml({ stationNo: 1, corpus: emptyCorpus, strictCorpus: true }))
      .toThrow(/Leere Korpus-Items/)
  })
  it('ohne strictCorpus → kein Wurf (Tests/Vorschau bleiben nutzbar)', () => {
    expect(() => buildStationHtml({ stationNo: 1, corpus: emptyCorpus })).not.toThrow()
  })
  it('voller Korpus → strictCorpus wirft nicht', () => {
    expect(() => buildStationHtml({ stationNo: 1, corpus: fullCorpus, strictCorpus: true })).not.toThrow()
  })
})
