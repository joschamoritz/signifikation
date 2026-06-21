/**
 * server/__tests__/beamer.strecken.test.js
 *
 * Reine Tests des Beamer-HTML-Builders (server/course/beamer/strecken.js). Kein
 * Browser/PDF, kein DB-Zugriff: ein handgebautes Daten-Objekt (wie es
 * corpus.js aus wortprofil.db liefert) → HTML-Deck, dann Assertions auf
 * Stations-Zuordnung, Querformat (16:9), eingespielte Live-Werte und
 * HTML-Escaping.
 */

import { describe, expect, it } from 'vitest'
import { buildDeckHtml } from '../course/beamer/strecken.js'

// Form wie getCorpusData(lemma) sie zurückgibt – hier ohne DB.
const DATA = {
  lemma: 'Haar',
  ok: true,
  db: { bytes: 2_291_564_544, path: '/x/wortprofil.db' },
  strong: { adj: 'blond', word: 'blondes Haar', val: 10.6, freq: 530, pct: 76 },
  mid: { adj: 'gefärbt', word: 'gefärbtes Haar', val: 8.6, freq: 129, pct: 61 },
  weak: { adj: 'gescheitelt', word: 'gescheiteltes Haar', val: 6.4, freq: 18, pct: 46 },
  scale: [
    { adj: 'gescheitelt', word: 'gescheiteltes Haar', val: 6.4, pct: 46, qual: 'schwach' },
    { adj: 'gefärbt', word: 'gefärbtes Haar', val: 8.6, pct: 61, qual: 'erkennbar' },
    { adj: 'blond', word: 'blondes Haar', val: 10.6, pct: 76, qual: 'typisch' },
  ],
}
const DB_SIZE = '2,29 GB'

describe('Beamer-Strecken-Builder', () => {
  it('Station ① bündelt Spektrum + Übersetzen (7 Folien)', () => {
    const { html, filename } = buildDeckHtml('1', DATA, DB_SIZE)
    expect(filename).toBe('beamer-station-1-kollokationen.pdf')
    expect((html.match(/class="slide"/g) ?? []).length).toBe(7)
    expect(html).toContain('Was ist eine Kollokation?')   // Spektrum
    expect(html).toContain('Konventionen wechseln.')      // Übersetzen
    expect(html).toContain('7 / 7')                        // Seitenzahlen
  })

  it('Station ④ bündelt logDice + Daten (7 Folien)', () => {
    const { html, filename } = buildDeckHtml('4', DATA, DB_SIZE)
    expect(filename).toBe('beamer-station-4-korpus.pdf')
    expect((html.match(/class="slide"/g) ?? []).length).toBe(7)
    expect(html).toContain('Was logDice misst')           // logDice
    expect(html).toContain('Von Text zu Wortprofil')      // Daten
  })

  it('Querformat 16:9: @page quer + Folienmaße', () => {
    const { html } = buildDeckHtml('4', DATA, DB_SIZE)
    expect(html).toContain('@page{size:297mm 167mm')
    expect(html).toMatch(/\.slide\{[^}]*width:297mm;height:167mm/)
  })

  it('spielt Live-Werte ein (logDice-Zahlen, DB-Größe), nicht hartcodiert', () => {
    const { html } = buildDeckHtml('4', DATA, DB_SIZE)
    expect(html).toContain('10,6')        // strong logDice, deutsches Komma
    expect(html).toContain('6,4')         // weak logDice
    expect(html).toContain('blondes Haar')
    expect(html).toContain('2,29 GB')     // reale DB-Größe durchgereicht
    // Skala-Position aus pct (kein hartcodierter left-Wert der Vorlage)
    expect(html).toContain('left:76%')
  })

  it('escapt HTML-Sonderzeichen in eingespielten Werten', () => {
    const evil = { ...DATA, strong: { ...DATA.strong, word: 'a<b>&"c"' } }
    const { html } = buildDeckHtml('1', evil, DB_SIZE)
    expect(html).toContain('a&lt;b&gt;&amp;&quot;c&quot;')
    expect(html).not.toContain('a<b>&"c"')
  })
})
