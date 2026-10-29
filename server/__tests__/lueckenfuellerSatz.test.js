/**
 * Satzwahl im Lückenfüller: Makel erkennen (Fälle aus einer Probe über 30 Grundwörter vom
 * 29.10.2026) und saubere Sätze vor längeren mit Makeln wählen.
 */
import { describe, expect, it } from 'vitest'
import { satzMakel, satzMakelNamen, waehleSatz } from '../lueckenfuellerSatz.js'

describe('satzMakelNamen', () => {
  it.each([
    ['geklebt', 'Die Dreharbeiten für den Film begannen 1941. Die Publicity-Abteilung des Studios machte gewaltige Anstrengungen.'],
    ['geklebt', 'Märtens erklärte zu seinem Abschied: „Ich bin frohen Mutes.“ Auch Österreich will sich bewegen.'],
    ['auslassung', 'In seinem Zustandekommen war es sogar ein glücklicher Punkt für den … In seinem zweiten Programm nimmt er uns mit.'],
    ['seitenkopf', 'Bedenken Sie die Gefahr für unsere demokratische Geschichte und Kultur Scha- 18286 Deutscher Bundestag — 12. Wahlperiode — 211. Sitzung.'],
    ['ocr', 'Von Karl I)cTTcU Sagen und Geschichten des Rheintals von Mainz bis Cöln.'],
    ['fremdschrift', 'A Földközi-tenger térségében nyáron gyakoriak a száraz viharok, de kevés esőt hoznak.'],
    ['versalien', 'Der Giebelspruch lautet „DE MI NICH GVET IS VN IÄGERT MI“ und ist niederdeutsch.'],
    ['virgel', 'sondern immer frecherer / sicherer und verwägener wordē / so verhetzten sie die Römer.'],
    ['anfang', '14.4769 Aber vielleicht überlegt es sich Vereinsboss Roman Abramowitsch noch einmal.'],
  ])('erkennt %s', (makel, satz) => {
    expect(satzMakelNamen(satz)).toContain(makel)
  })

  it.each([
    'Am 1. April 1902 wurde Kornemann zum außerordentlichen Professor für Alte Geschichte an die Universität Tübingen ernannt.',
    'Die Schlacht war ein Zusammenstoß zwischen dem französischen König Ludwig VI. dem Dicken und dem englischen König.',
    'Bei dem gewaltigen Fortschreiten der Weltsprache des russischen Arztes Dr. L. L. Zamenhof dürfte die Frage nahe liegen.',
    'Das Interview führte Prof. Dr. Peter Schilling, der die Ergebnisse bzw. Die Folgen einordnete.',
    'Es wurde eine Licht- und Kraftanlage errichtet, die fünf-, sechs- und siebenmal so groß war.',
    'Die Männer, die das schnelle Internet bringen sollen, heißen Hans-Jürgen Bahde und Viktor Kostic.',
    'Alonso behauptet, McLaren-Mercedes habe kein Interesse, Hamilton eine weitere schnelle Runde zu ermöglichen.',
  ])('lässt saubere Sätze in Ruhe: %s', (satz) => {
    expect(satzMakelNamen(satz)).toEqual([])
  })
})

describe('satzMakel', () => {
  it('alte Drucke zählen als Makel, aber schwächer als ein zerstörter Satz', () => {
    const satz = 'Grosse Korridore bieten dem Publikum bei einer ausbrechenden Panik eine grosse Vertheilungsfläche.'
    expect(satzMakel(satz, 2010)).toBe(0)
    expect(satzMakel(satz, 1884)).toBe(1)
    expect(satzMakel(satz, 1666)).toBe(2)
    expect(satzMakel(satz, null)).toBe(0)
  })
})

describe('waehleSatz', () => {
  const sauber = { satz: 'Der katholische Glaube hat das Leben und die Geschichte dieses Kontinents deutlich geprägt.', jahr: 2012 }
  const lang = { satz: 'Die Managerin studierte in Stanford Geschichte. Sie erwarb danach ihren MBA an der University of Maryland und blieb dort viele Jahre.', jahr: 2001 }

  it('nimmt den sauberen Satz vor dem längeren mit Makeln', () => {
    expect(waehleSatz([lang, sauber])).toBe(sauber)
  })

  it('bei gleich vielen Makeln gewinnt der längere', () => {
    const laenger = { satz: `${sauber.satz.slice(0, -1)}, wie viele Historiker betonen.`, jahr: 2015 }
    expect(waehleSatz([sauber, laenger])).toBe(laenger)
  })

  it('bleibt im Längenfenster, solange es dort Sätze gibt', () => {
    const kurz = { satz: 'Ein kurzer Satz.', jahr: 2020 }
    expect(waehleSatz([kurz, lang])).toBe(lang)
    expect(waehleSatz([kurz])).toBe(kurz)
    expect(waehleSatz([])).toBeNull()
  })
})
