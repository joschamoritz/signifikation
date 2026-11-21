/**
 * Lemmata-Index im Server-Prozess: Schreibt ein Skript in einem anderen Prozess (z. B.
 * scripts/kollokationen-neubau.mjs), darf der Server das nicht mit seinem alten Index
 * überschreiben (Vorfall 2026-11-21: Lückenfüller-Neubau setzte „Alphabet“ zurück).
 */
import { describe, expect, it } from 'vitest'
import { createLemmataIndexStore } from '../store-lemmata.js'
import db from '../db.js'
import { getLemmataIndex, lemmaToRow, stmts } from '../store.js'

describe('createLemmataIndexStore', () => {
  it('baut den Index nach dem Höchstalter neu auf', () => {
    let t = 0
    let stand = [{ id: 'a', lemma: 'A' }]
    const store = createLemmataIndexStore(() => stand, null, { maxAgeMs: 1000, now: () => t })
    expect(store.get().byId.has('a')).toBe(true)
    stand = [{ id: 'b', lemma: 'B' }]
    t = 999
    expect(store.get().byId.has('b')).toBe(false)
    t = 1000
    expect(store.get().byId.has('b')).toBe(true)
  })

  it('hält den Index ohne Höchstalter, bis er invalidiert wird', () => {
    let stand = [{ id: 'a', lemma: 'A' }]
    const store = createLemmataIndexStore(() => stand, null)
    store.get()
    stand = [{ id: 'b', lemma: 'B' }]
    expect(store.get().byId.has('b')).toBe(false)
    store.invalidate()
    expect(store.get().byId.has('b')).toBe(true)
  })
})

describe('stmts.setLueckenfueller', () => {
  it('ändert nur die Lückenfüller-Runden und lässt extern neu gebaute Kollokatoren stehen', () => {
    stmts.upsertLemma.run(lemmaToRow({ id: 'index-test-alphabet', lemma: 'Alphabet', pos: 'Substantiv', runden: { kollokatoren: [{ wort: 'phönizisch' }] } }))
    getLemmataIndex() // Server hält jetzt den alten Stand im Speicher

    // anderer Prozess baut die Kollokatoren neu
    db.prepare('UPDATE lemmata SET runden = ? WHERE id = ?').run(JSON.stringify({ kollokatoren: [{ wort: 'griechisch' }] }), 'index-test-alphabet')

    stmts.setLueckenfueller.run({ id: 'index-test-alphabet', lueckenfueller: JSON.stringify([{ type: 'single', kollokator: 'Schrift' }]) })
    const row = db.prepare('SELECT runden, lueckenfueller FROM lemmata WHERE id = ?').get('index-test-alphabet')
    expect(JSON.parse(row.runden).kollokatoren[0].wort).toBe('griechisch')
    expect(JSON.parse(row.lueckenfueller)[0].kollokator).toBe('Schrift')
  })
})
