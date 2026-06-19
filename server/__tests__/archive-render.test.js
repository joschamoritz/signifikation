/**
 * server/__tests__/archive-render.test.js
 *
 * Reine Render-/Whitelist-Funktionen des SEO-Archivs (kein DB-Zugriff).
 * Schwerpunkt: R1/Datenschutz – interne Felder duerfen NIE im HTML landen.
 */
import { describe, it, expect } from 'vitest'
import {
  slugifyLemma,
  escapeHtml,
  toPublicEntry,
  formatGermanDate,
  renderWortPage,
  renderArchivIndex,
  renderSitemap,
} from '../archive/render.js'

describe('slugifyLemma', () => {
  it('transliteriert deutsche Umlaute und ß', () => {
    expect(slugifyLemma('Öl')).toBe('oel')
    expect(slugifyLemma('Größe')).toBe('groesse')
    expect(slugifyLemma('Über-Maß')).toBe('ueber-mass')
  })
  it('normalisiert Leerzeichen und Sonderzeichen', () => {
    expect(slugifyLemma('  Guten   Tag! ')).toBe('guten-tag')
    expect(slugifyLemma('C++')).toBe('c')
  })
})

describe('escapeHtml', () => {
  it('escaped alle gefaehrlichen Zeichen', () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;')
  })
})

describe('toPublicEntry – Whitelist', () => {
  const secretLemma = {
    id: 'x', lemma: 'Wasser', pos: 'Substantiv', wortart: 'Substantiv',
    ipa: 'ˈvasɐ', definition: 'H₂O', definitionen: ['H₂O'],
    runden: { kollokatoren: [{ wort: 'GEHEIMLOESUNG', rang: 1 }], notiz: 'GEHEIM-NOTIZ' },
    rundenInfo: ['INTERN-INFO'], notiz: 'INTERNE-NOTIZ', bonusFrage: { frage: 'LEAK-FRAGE' },
    link: 'https://intern.example', lueckenfueller: 'LF-INTERN',
  }
  it('uebernimmt nur oeffentliche Felder', () => {
    const e = toPublicEntry(secretLemma, ['2024-01-01'])
    expect(e).toEqual({
      slug: 'wasser', lemma: 'Wasser', wortart: 'Substantiv', ipa: 'ˈvasɐ',
      definitionen: ['H₂O'], dates: ['2024-01-01'],
    })
    expect(Object.keys(e)).not.toContain('runden')
    expect(Object.keys(e)).not.toContain('notiz')
    expect(Object.keys(e)).not.toContain('bonusFrage')
  })
  it('faellt auf definition zurueck, wenn definitionen leer', () => {
    const e = toPublicEntry({ lemma: 'Test', definition: 'Def', definitionen: [] })
    expect(e.definitionen).toEqual(['Def'])
  })
})

describe('renderWortPage', () => {
  const secretLemma = {
    id: 'x', lemma: 'Wasser', wortart: 'Substantiv', ipa: 'ˈvasɐ',
    definitionen: ['H₂O-Verbindung'],
    runden: { kollokatoren: [{ wort: 'GEHEIMLOESUNG' }], notiz: 'GEHEIM-NOTIZ' },
    notiz: 'INTERNE-NOTIZ', bonusFrage: { frage: 'LEAK-FRAGE' }, rundenInfo: ['X'], lueckenfueller: 'LF',
  }
  const html = renderWortPage(toPublicEntry(secretLemma, ['2024-01-01']), [{ slug: 'haus', lemma: 'Haus' }])

  it('enthaelt SEO-Kopf (title, canonical, robots, JSON-LD)', () => {
    expect(html).toContain('<title>Wasser, Substantiv – Bedeutung | Signifikation</title>')
    expect(html).toContain('<link rel="canonical" href="https://signifikation.de/wort/wasser" />')
    expect(html).toContain('"index, follow"')
    expect(html).toContain('"@type": "DefinedTerm"')
    expect(html).toContain('"name": "Wasser"')
  })
  it('rendert oeffentliche Inhalte + internen Link', () => {
    expect(html).toContain('H₂O-Verbindung')
    expect(html).toContain('[ˈvasɐ]')
    expect(html).toContain('/wort/haus')
    expect(html).toContain('/static.css')
  })
  it('LEAKT KEINE internen Felder', () => {
    for (const secret of ['GEHEIMLOESUNG', 'GEHEIM-NOTIZ', 'INTERNE-NOTIZ', 'LEAK-FRAGE',
      'kollokatoren', 'bonusFrage', 'rundenInfo', 'lueckenfueller', 'intern.example']) {
      expect(html).not.toContain(secret)
    }
  })
  it('enthaelt keinen inline <style>-Block (CSP style-src self)', () => {
    expect(html).not.toContain('<style>')
  })
  it('rendert die Kollokations-Erklaersektion (ohne Loesung) + Methodik-Link', () => {
    expect(html).toContain('Kollokationen')
    expect(html).toContain('logDice')
    expect(html).toContain('/ueber.html#kollokation')
  })
})

describe('renderWortPage – Zusatzinhalt (Thema + Belege + Kollokationen)', () => {
  const entry = toPublicEntry({ lemma: 'Wasser', wortart: 'Substantiv', definitionen: ['H₂O'] }, ['2024-01-01'])
  const html = renderWortPage(entry, [], {
    thema: { datum: '2025-03-22', text: 'Weltwassertag – warum Wasser knapp wird.', quelle: 'https://example.org/wasser' },
    belege: [
      { satz: 'Das Wasser des Sees war klar.', quelle: 'Beispielkorpus 2019 · CC BY-SA' },
      { satz: 'Ohne Wasser kein Leben.', quelle: 'Beispielkorpus 2020' },
    ],
    kollokationen: ['fließend', 'klar', 'sauber'],
  })
  it('rendert das Tagesthema mit Datum, langer Beschreibung und Quelle', () => {
    expect(html).toContain('Thema des Tages')
    expect(html).toContain('22. März 2025')
    expect(html).toContain('Weltwassertag – warum Wasser knapp wird.')
    expect(html).toContain('href="https://example.org/wasser"')
  })
  it('rendert die Kollokations-Stichprobe als Wörter ohne Werte/Rang', () => {
    expect(html).toContain('verbindet sich')
    for (const w of ['fließend', 'klar', 'sauber']) expect(html).toContain(`<li>${w}</li>`)
    // Die Chips selbst duerfen keine Zahlen (logDice/Rang) enthalten.
    const chips = html.match(/<ul class="arc-koll-words">.*?<\/ul>/s)[0]
    expect(chips).not.toMatch(/\d/)
  })
  it('rendert Korpus-Belege mit Quelle', () => {
    expect(html).toContain('Aus dem Korpus')
    expect(html).toContain('Das Wasser des Sees war klar.')
    expect(html).toContain('Beispielkorpus 2019 · CC BY-SA')
  })
  it('escaped Beleg-Inhalt (kein HTML-Durchschlag)', () => {
    const evil = renderWortPage(entry, [], { belege: [{ satz: '<img src=x onerror=alert(1)>', quelle: '<b>x</b>' }] })
    expect(evil).not.toContain('<img src=x')
    expect(evil).toContain('&lt;img src=x')
  })
  it('laesst Thema/Belege/Kollokationen weg, wenn nicht vorhanden', () => {
    const bare = renderWortPage(entry)
    expect(bare).not.toContain('Thema des Tages')
    expect(bare).not.toContain('Aus dem Korpus')
    expect(bare).not.toContain('verbindet sich')
  })
})

describe('renderArchivIndex', () => {
  const entries = [
    toPublicEntry({ lemma: 'Apfel', wortart: 'Substantiv', definitionen: ['Obst'] }),
    toPublicEntry({ lemma: 'Birne', wortart: 'Substantiv', definitionen: ['Obst'] }),
  ]
  const html = renderArchivIndex(entries)
  it('listet Eintraege mit Buchstabengruppen', () => {
    expect(html).toContain('/wort/apfel')
    expect(html).toContain('/wort/birne')
    expect(html).toContain('arc-group-letter')
    expect(html).toContain('"@type": "CollectionPage"')
  })
})

describe('renderSitemap', () => {
  const xml = renderSitemap(['apfel', 'birne'], '2026-06-18')
  it('enthaelt statische Pfade und Wort-URLs', () => {
    expect(xml).toContain('<loc>https://signifikation.de/</loc>')
    expect(xml).toContain('<loc>https://signifikation.de/archiv</loc>')
    expect(xml).toContain('<loc>https://signifikation.de/wort/apfel</loc>')
    expect(xml).toContain('<loc>https://signifikation.de/wort/birne</loc>')
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
  })
})

describe('formatGermanDate', () => {
  it('formatiert ISO zu deutschem Langdatum', () => {
    expect(formatGermanDate('2026-06-09')).toBe('9. Juni 2026')
  })
  it('gibt leeren String bei ungueltigem Input', () => {
    expect(formatGermanDate('quatsch')).toBe('')
  })
})
