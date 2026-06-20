// Tests fuer die Demo-Inhalte der login-freien Lehrer-Vorschau.
// Validierung (Zod), Persistenz (app_state), Default-/Fallback-Verhalten.

import { describe, it, expect, afterEach } from 'vitest'
import db from '../db.js'
import { loadDemoContent, saveDemoContent, DEMO_CONTENT_DEFAULT } from '../classroom/demoContent.js'

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
})
