/**
 * relGlossar.js – die Erklärungen unter der Muster-Tabelle im Archiv.
 *
 * Kritisch seit der kasusgenauen Objekt-Beschriftung (2026-08-06): Das Etikett
 * in der Tabelle kann „Akkusativobjekt", „Dativobjekt", „Genitivobjekt" oder
 * „Objekt" lauten, obwohl der Relationscode in allen Fällen `OBJA` ist. Die
 * Erklärung muss dem Etikett folgen — sonst steht neben „Dativobjekt" die
 * Erklärung „… im 4. Fall (wen oder was?)".
 */
import { describe, expect, it } from 'vitest'
import { glossaryForPatterns } from '../archive/relGlossar.js'

const p = (relation, muster) => ({ relation, muster })

describe('glossaryForPatterns – Objekt-Relationen folgen dem Etikett', () => {
  it('erklärt „Dativobjekt" mit dem 3. Fall, nicht mit dem 4.', () => {
    const [eintrag] = glossaryForPatterns([p('OBJA', 'Dativobjekt')], 'folgen')
    expect(eintrag.label).toBe('Dativobjekt')
    expect(eintrag.text).toContain('3. Fall')
    expect(eintrag.text).not.toContain('4. Fall')
  })

  it('erklärt „Akkusativobjekt" weiterhin mit dem 4. Fall', () => {
    const [eintrag] = glossaryForPatterns([p('OBJA', 'Akkusativobjekt')], 'trinken')
    expect(eintrag.text).toContain('4. Fall')
  })

  it('erklärt „Genitivobjekt" mit dem 2. Fall', () => {
    const [eintrag] = glossaryForPatterns([p('OBJA', 'Genitivobjekt')], 'gedenken')
    expect(eintrag.text).toContain('2. Fall')
  })

  it('behauptet beim neutralen „Objekt" keinen Fall', () => {
    const [eintrag] = glossaryForPatterns([p('OBJA', 'Objekt')], 'danken')
    expect(eintrag.text).not.toMatch(/[234]\. Fall/)
    expect(eintrag.text).toContain('nicht eindeutig')
  })

  it('setzt das Lemma überall ein', () => {
    const [eintrag] = glossaryForPatterns([p('OBJA', 'Objekt')], 'danken')
    expect(eintrag.text).toContain('danken')
    expect(eintrag.text).not.toContain('%lemma%')
  })
})

describe('glossaryForPatterns – Deduplizierung', () => {
  // Ein Substantiv kann an mehreren Verben mit verschiedener Rektion hängen:
  // „Hilfe leisten" (Akkusativ) neben „Hilfe rufen" (unbestimmt).
  it('führt beide Etiketten auf, wenn eine Objekt-Relation gemischt vorkommt', () => {
    const items = glossaryForPatterns([
      p('~OBJA', 'ist Akkusativobjekt von'),
      p('~OBJA', 'ist Objekt von'),
      p('~OBJA', 'ist Akkusativobjekt von'),
    ], 'Hilfe')
    expect(items.map(i => i.label)).toEqual(['ist Akkusativobjekt von', 'ist Objekt von'])
  })

  // Regressionsschutz: `PP` trägt die Präposition im Etikett. Würde nach Etikett
  // dedupliziert, bekäme jede Präposition einen eigenen Absatz.
  it('fasst Nicht-Objekt-Relationen weiterhin je Code zusammen', () => {
    const items = glossaryForPatterns([
      p('PP', 'Präpositionalphrase (in)'),
      p('PP', 'Präpositionalphrase (für)'),
      p('KON', 'ist koordiniert mit'),
    ], 'Not')
    expect(items).toHaveLength(2)
    expect(items[0].label).toBe('Präpositionalphrase (in)')
  })

  it('überspringt Relationen ohne Erklärung', () => {
    expect(glossaryForPatterns([p('GIBTESNICHT', 'X')], 'Wort')).toEqual([])
  })
})
