// Tests fuer die Demo-Inhalte der login-freien Lehrer-Vorschau.
// Validierung (Zod), Persistenz (app_state), Default-/Fallback-Verhalten.

import { describe, it, expect, afterEach } from 'vitest'
import db from '../db.js'
import { loadDemoContent, loadDemoContentMitStand, saveDemoContent, DEMO_CONTENT_DEFAULT } from '../classroom/demoContent.js'

const KEY = 'classroom_demo_content'
const clearKey = () => db.prepare('DELETE FROM app_state WHERE key = ?').run(KEY)

describe('classroom demo content', () => {
  afterEach(() => clearKey())

  it('liefert Default, wenn nichts gespeichert ist', () => {
    clearKey()
    expect(loadDemoContent()).toEqual(DEMO_CONTENT_DEFAULT)
  })

  it('speichert und laedt validierte Inhalte (round-trip)', () => {
    const c = structuredClone(DEMO_CONTENT_DEFAULT)
    c.zeitenwende.words = ['alpha', 'beta', 'gamma']
    expect(saveDemoContent(c).ok).toBe(true)
    expect(loadDemoContent().zeitenwende.words).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('lehnt einen Lueckenfueller-Satz ohne Luecke (_____) ab', () => {
    const c = structuredClone(DEMO_CONTENT_DEFAULT)
    c.lueckenfueller.sentence = 'Dieser Satz hat keine Luecke.'
    const res = saveDemoContent(c)
    expect(res.error).toBe('INVALID')
    // Alter Stand bleibt: nichts wurde geschrieben.
    expect(loadDemoContent()).toEqual(DEMO_CONTENT_DEFAULT)
  })

  it('lehnt zu wenige Kollokationen-Woerter ab', () => {
    const c = structuredClone(DEMO_CONTENT_DEFAULT)
    c.kollokationen.words = ['nur', 'zwei']
    expect(saveDemoContent(c).error).toBe('INVALID')
  })

  it('faellt bei ungueltig gespeicherten Inhalten auf Default zurueck', () => {
    db.prepare(`
      INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(KEY, JSON.stringify({ kollokationen: { words: [] } }), Date.now())
    expect(loadDemoContent()).toEqual(DEMO_CONTENT_DEFAULT)
  })

  // Fehlertexte auf Deutsch, je Regel und mit dem Pfad des Feldes (Werkzeuge › Klassenraum-Demo, Schritt 7b)
  describe('deutsche Fehlermeldungen je Feld', () => {
    const fehler = (aendern) => {
      const c = structuredClone(DEMO_CONTENT_DEFAULT)
      aendern(c)
      const res = saveDemoContent(c)
      expect(res.error).toBe('INVALID')
      return res.issues.map((i) => [i.path.join('.'), i.message])
    }

    it('zu wenige und zu viele Wörter nennen die Zahlen und das passende Nomen', () => {
      expect(fehler((c) => { c.wortzwilling.words = ['a', 'b', 'c'] })).toEqual([['wortzwilling.words', 'Mindestens 4 Wörter (jetzt 3).']])
      expect(fehler((c) => { c.kollokationen.words = Array.from({ length: 14 }, (_, i) => `w${i}`) })).toEqual([['kollokationen.words', 'Höchstens 12 Kollokatoren (jetzt 14).']])
      expect(fehler((c) => { c.lueckenfueller.options = ['nur'] })).toEqual([['lueckenfueller.options', 'Mindestens 2 Antworten (jetzt 1).']])
      expect(fehler((c) => { c.zeitenwende.words = ['eins'] })).toEqual([['zeitenwende.words', 'Mindestens 2 Kollokatoren (jetzt 1).']])
    })

    it('fehlende Pflichtfelder: Basis, Wort A, Wort B, Wort', () => {
      expect(fehler((c) => { c.kollokationen.lemma.lemma = '' })).toEqual([['kollokationen.lemma.lemma', 'Bitte eine Basis eintragen.']])
      expect(fehler((c) => { c.wortzwilling.wortA = ''; c.wortzwilling.wortB = '' })).toEqual([
        ['wortzwilling.wortA', 'Bitte Wort A eintragen.'],
        ['wortzwilling.wortB', 'Bitte Wort B eintragen.'],
      ])
      expect(fehler((c) => { c.zeitenwende.lemma.lemma = '' })).toEqual([['zeitenwende.lemma.lemma', 'Bitte ein Wort eintragen.']])
    })

    it('Lückenfüller-Satz ohne fünf Unterstriche, zu langer Eintrag', () => {
      expect(fehler((c) => { c.lueckenfueller.sentence = 'Dieser Satz hat keine Luecke.' })).toEqual([['lueckenfueller.sentence', 'Der Satz braucht eine Lücke aus fünf Unterstrichen (_____).']])
      expect(fehler((c) => { c.kollokationen.words = ['hitzig', 'kontrovers', 'x'.repeat(61)] })[0][1]).toBe('Ein Eintrag ist länger als 60 Zeichen.')
    })

    it('enthalten keine englischen Zod-Texte', () => {
      const alle = fehler((c) => {
        c.kollokationen.lemma.lemma = ''
        c.kollokationen.words = []
        c.wortzwilling.words = []
        c.zeitenwende.words = []
        c.lueckenfueller.sentence = ''
        c.lueckenfueller.options = []
      })
      for (const [, text] of alle) expect(text).not.toMatch(/Array|element|String|expected|Too (small|big)/i)
    })
  })

  describe('loadDemoContentMitStand', () => {
    it('ohne gespeicherte Inhalte: Standard, ohne Zeitpunkt', () => {
      clearKey()
      expect(loadDemoContentMitStand()).toEqual({ content: DEMO_CONTENT_DEFAULT, istStandard: true, gespeichertAm: null })
    })

    it('nach dem Speichern: eigene Inhalte mit Zeitpunkt (ISO)', () => {
      const c = structuredClone(DEMO_CONTENT_DEFAULT)
      c.zeitenwende.words = ['alpha', 'beta']
      saveDemoContent(c)
      const stand = loadDemoContentMitStand()
      expect(stand.istStandard).toBe(false)
      expect(stand.content.zeitenwende.words).toEqual(['alpha', 'beta'])
      expect(stand.gespeichertAm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('ungültig gespeichert: Standard (die Demo bricht nie)', () => {
      db.prepare('INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(KEY, '{"kaputt":true}', Date.now())
      expect(loadDemoContentMitStand()).toMatchObject({ istStandard: true, gespeichertAm: null })
    })
  })
})
