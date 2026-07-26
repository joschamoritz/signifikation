/**
 * server/__tests__/course.content.station1.test.js
 *
 * Validiert den kuratierten Station-①-Content (AP4) gegen die Engine-Spec
 * (planning/Kurs-Engine-Spec.md, Lint-Regeln §10) und prüft den DB-Round-Trip
 * über den Seeder + Store. Zusätzlich (falls verfügbar) ein Check, dass die
 * Anker-Lemmata real in wortprofil.db existieren.
 */

import { afterAll, describe, expect, it } from 'vitest'
import db from '../db.js'
import station1 from '../course/content/station-1.js'
import { seedCourseContent } from '../course/seed.js'
import * as courseStore from '../course/store.js'
import { lemmaExistsInWortprofil } from '../wortprofil.js'

const LEVELS  = ['DaZ', 'SekI', 'SekII', 'LK']
const FORMATS = ['F1', 'F2', 'F3', 'F4', 'F5']
const items = station1.tasks

// Hilfsfunktion: gibt es im JSON eines Items irgendwo eine logDice-Zahl/-Platzhalter?
function mentionsLogDice(obj) {
  const s = JSON.stringify(obj)
  return /logDice/i.test(s)
}

describe('Station-① Content – Struktur (Engine-Spec)', () => {
  it('jedes Item erfüllt Envelope + Lint-Regeln', () => {
    for (const item of items) {
      expect(item.id, item.id).toMatch(/^s1-f[1-5]-[a-z0-9-]+$/)
      expect(item.station).toBe(1)
      expect(FORMATS).toContain(item.format)
      expect(LEVELS).toContain(item.level)
      expect(['static', 'corpus-template']).toContain(item.source)
      expect(item.prompt, `${item.id} prompt`).toBeTruthy()
      expect(item.payload, `${item.id} payload`).toBeTruthy()
      expect(item.solution, `${item.id} solution`).toBeTruthy()

      // Lint 1+2: Quellmodus-Konsistenz
      if (item.source === 'corpus-template') {
        expect(item.corpusQuery, `${item.id} corpusQuery`).toBeTruthy()
        expect(item.bindings, `${item.id} bindings`).toBeTruthy()
        expect(['Substantiv', 'Verb', 'Adjektiv', 'Adverb']).toContain(item.corpusQuery.pos)
        expect(['ATTR', '~OBJA', '~SUBJA', 'KON', 'PRED', 'PRED_REV', 'OBJA', 'GMOD', 'ADV', 'PP'])
          .toContain(item.corpusQuery.relation)
      } else {
        expect(item.corpusQuery, `${item.id} darf keine corpusQuery haben`).toBeUndefined()
      }

      // Lint 3: feedback.byLevel enthält das Item-Level
      expect(item.feedback?.byLevel?.[item.level], `${item.id} feedback[${item.level}]`).toBeTruthy()

      // Lint 4: DaZ/SekI ohne logDice-Zahlen/-Platzhalter
      if (item.level === 'DaZ' || item.level === 'SekI') {
        expect(['none', 'frequency', undefined]).toContain(item.display?.metric)
        expect(item.display?.showMetrics ?? false, `${item.id} showMetrics`).toBe(false)
        expect(mentionsLogDice(item.feedback), `${item.id} feedback ohne logDice`).toBe(false)
        expect(mentionsLogDice(item.payload), `${item.id} payload ohne logDice`).toBe(false)
      }

      // Belegpflicht (Station ①): mindestens eine Quelle
      expect(item.beleg?.length, `${item.id} beleg`).toBeGreaterThan(0)
    }
  })

  it('deckt alle 4 Niveaustufen ab', () => {
    const present = new Set(items.map(i => i.level))
    for (const l of LEVELS) expect(present, `Level ${l}`).toContain(l)
  })

  it('Formate je Stufe folgen der Differenzierung (Zeile Station ①)', () => {
    const byLevel = (lvl) => new Set(items.filter(i => i.level === lvl).map(i => i.format))
    // DaZ: F1,F2 (+kontrastiv F3) · SekI: F1–F3 · SekII: F3–F5 · LK: F5
    expect([...byLevel('DaZ')].sort()).toEqual(['F1', 'F2', 'F3'])
    expect([...byLevel('SekI')].sort()).toEqual(['F1', 'F2', 'F3'])
    expect([...byLevel('SekII')].sort()).toEqual(['F3', 'F4', 'F5'])
    expect(byLevel('LK').has('F5')).toBe(true)
  })

  it('IDs sind eindeutig', () => {
    const ids = items.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Station-① Content – DB-Round-Trip (Seeder + Store)', () => {
  afterAll(() => {
    // Aufräumen: geseedete Station entfernen (Cascade räumt Tasks).
    db.prepare("DELETE FROM course_stations WHERE id = 's1'").run()
  })

  it('seedt Station + Tasks und liefert sie über den Store zurück', () => {
    const res = seedCourseContent()
    expect(res.stations).toBeGreaterThanOrEqual(1)
    // Seeder spielt inzwischen alle Stationen ein (AP4 + AP10) → Gesamtzahl ≥ ①.
    expect(res.tasks).toBeGreaterThanOrEqual(items.length)

    const station = courseStore.getStation('s1')
    expect(station).toMatchObject({ id: 's1', orderNo: 1, title: 'Wortpartner' })
    expect(courseStore.getStationLevels('s1')).toEqual(['DaZ', 'SekI', 'SekII', 'LK'])

    const all = courseStore.listTasks('s1')
    expect(all).toHaveLength(items.length)

    // CHECK-Constraint-Konsistenz im Round-Trip: static→content, corpus→template
    const tmpl = all.find(t => t.source === 'corpus-template')
    expect(tmpl.content).toBeNull()
    expect(tmpl.template.corpusQuery).toBeTruthy()
    expect(tmpl.rubric).toBeTruthy()

    const stat = all.find(t => t.source === 'static')
    expect(stat.template).toBeNull()
    expect(stat.content.payload).toBeTruthy()
    expect(stat.rubric).toBeTruthy()
  })

  it('idempotent: zweites Seeding ergibt gleiche Task-Zahl (kein Duplikat)', () => {
    seedCourseContent()
    seedCourseContent()
    expect(courseStore.listTasks('s1')).toHaveLength(items.length)
  })

  it('Niveau-Filter liefert nur die Stufe', () => {
    seedCourseContent()
    const sek2 = courseStore.listTasks('s1', { level: 'SekII' })
    expect(sek2.length).toBeGreaterThan(0)
    expect(sek2.every(t => t.level === 'SekII')).toBe(true)
  })
})

describe('Station-① Content – echte Korpusdaten (falls wortprofil.db verfügbar)', () => {
  it('Anker-Lemmata existieren in wortprofil.db', () => {
    const anchors = [...new Set(
      items.filter(i => i.source === 'corpus-template').map(i => i.corpusQuery.lemma),
    )]
    // Falls die Korpus-DB im Testlauf nicht verfügbar ist, nicht hart scheitern.
    if (!lemmaExistsInWortprofil('Entscheidung')) return
    for (const lemma of anchors) {
      expect(lemmaExistsInWortprofil(lemma), `Anker „${lemma}“`).toBe(true)
    }
  })
})
