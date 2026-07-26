/**
 * server/__tests__/course.content.stations.test.js
 *
 * Validiert den Content der Stationen ②–⑤ (AP10) gegen die Engine-Spec
 * (Lint-Regeln §10) + die Differenzierungs-Matrix (Format-Abdeckung je Stufe),
 * prüft den DB-Round-Trip über den Seeder und die echte Korpus-Auflösung
 * (resolveItemInteractive gegen wortprofil.db, falls verfügbar).
 *
 * Station ① wird separat in course.content.station1.test.js geprüft.
 */

import { afterAll, describe, expect, it } from 'vitest'
import db from '../db.js'
import station2 from '../course/content/station-2.js'
import station3 from '../course/content/station-3.js'
import station4 from '../course/content/station-4.js'
import station5 from '../course/content/station-5.js'
import { seedCourseContent } from '../course/seed.js'
import * as courseStore from '../course/store.js'
import { makeCorpusAdapter } from '../course/corpusAdapter.js'
import { resolveItemInteractive } from '../course/resolve.js'
import { lemmaExistsInWortprofil } from '../wortprofil.js'

const LEVELS  = ['DaZ', 'SekI', 'SekII', 'LK']
const FORMATS = ['F1', 'F2', 'F3', 'F4', 'F5']
const RELATIONS = ['ATTR', '~OBJA', '~SUBJA', 'KON', 'PRED', 'PRED_REV', 'OBJA', 'GMOD', 'ADV', 'PP']
const POS = ['Substantiv', 'Verb', 'Adjektiv', 'Adverb']

// Erwartete Format-Abdeckung je Stufe (aus planning/Kurs-Differenzierung.md).
const STATIONS = {
  s2: {
    mod: station2, num: 2,
    expect: { DaZ: ['F1', 'F2'], SekI: ['F1', 'F2', 'F3'], SekII: ['F3', 'F4', 'F5'], LK: ['F4', 'F5'] },
  },
  s3: {
    mod: station3, num: 3,
    expect: { DaZ: ['F1', 'F2'], SekI: ['F1', 'F2'], SekII: ['F3', 'F4', 'F5'], LK: ['F4', 'F5'] },
  },
  s4: {
    mod: station4, num: 4,
    expect: { DaZ: ['F1', 'F2'], SekI: ['F1', 'F2'], SekII: ['F2', 'F3', 'F4', 'F5'], LK: ['F4', 'F5'] },
  },
  s5: {
    mod: station5, num: 5,
    expect: { DaZ: ['F2'], SekI: ['F1', 'F2', 'F3'], SekII: ['F1', 'F2', 'F3', 'F4'], LK: ['F4', 'F5'] },
  },
}

const mentionsLogDice = (obj) => /logDice/i.test(JSON.stringify(obj))

describe.each(Object.entries(STATIONS))('Station %s – Content (Engine-Spec + Differenzierung)', (sid, { mod, num, expect: expectedFormats }) => {
  const items = mod.tasks

  it('Station-Metadaten korrekt', () => {
    expect(mod.station.id).toBe(sid)
    expect(mod.station.orderNo).toBe(num)
    expect(mod.station.title).toBeTruthy()
  })

  it('jedes Item erfüllt Envelope + Lint-Regeln', () => {
    for (const item of items) {
      expect(item.id, item.id).toMatch(new RegExp(`^${sid}-f[1-5]-[a-z0-9-]+$`))
      expect(item.station).toBe(num)
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
        expect(POS).toContain(item.corpusQuery.pos)
        expect(RELATIONS).toContain(item.corpusQuery.relation)
      } else {
        expect(item.corpusQuery, `${item.id} darf keine corpusQuery haben`).toBeUndefined()
      }

      // Lint 3: feedback.byLevel enthält das Item-Level
      expect(item.feedback?.byLevel?.[item.level], `${item.id} feedback[${item.level}]`).toBeTruthy()

      // Lint 4 (+ Schnupper ④/⑤): DaZ/SekI ohne logDice. Frequenz („oft/selten“)
      // ist nur als metric 'frequency' erlaubt; logDice/both NIE.
      if (item.level === 'DaZ' || item.level === 'SekI') {
        expect(['none', 'frequency', undefined], `${item.id} metric`).toContain(item.display?.metric)
        if (item.display?.showMetrics) {
          expect(item.display.metric, `${item.id} showMetrics nur mit frequency`).toBe('frequency')
        }
        expect(mentionsLogDice(item.feedback), `${item.id} feedback ohne logDice`).toBe(false)
        expect(mentionsLogDice(item.payload), `${item.id} payload ohne logDice`).toBe(false)
      }

      // Belegpflicht
      expect(item.beleg?.length, `${item.id} beleg`).toBeGreaterThan(0)
    }
  })

  it('deckt alle 4 Niveaustufen ab', () => {
    const present = new Set(items.map(i => i.level))
    for (const l of LEVELS) expect(present, `Level ${l}`).toContain(l)
  })

  it('Formate je Stufe folgen der Differenzierung', () => {
    for (const [level, formats] of Object.entries(expectedFormats)) {
      const got = [...new Set(items.filter(i => i.level === level).map(i => i.format))].sort()
      expect(got, `${sid} ${level}`).toEqual([...formats].sort())
    }
  })

  it('IDs sind eindeutig', () => {
    const ids = items.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('Stationen ②–⑤ – DB-Round-Trip (Seeder + Store)', () => {
  afterAll(() => {
    for (const sid of Object.keys(STATIONS)) {
      db.prepare('DELETE FROM course_stations WHERE id = ?').run(sid)
    }
  })

  it('seedt alle Stationen; Store liefert sie korrekt zurück', () => {
    seedCourseContent()
    for (const [sid, { mod, num }] of Object.entries(STATIONS)) {
      const station = courseStore.getStation(sid)
      expect(station, sid).toMatchObject({ id: sid, orderNo: num })
      const tasks = courseStore.listTasks(sid)
      expect(tasks.length, `${sid} Task-Zahl`).toBe(mod.tasks.length)
      // CHECK-Konsistenz: static→content, corpus→template
      for (const t of tasks) {
        if (t.source === 'corpus-template') {
          expect(t.content, `${t.id} content`).toBeNull()
          expect(t.template?.corpusQuery, `${t.id} template`).toBeTruthy()
        } else {
          expect(t.template, `${t.id} template`).toBeNull()
          expect(t.content?.payload, `${t.id} content`).toBeTruthy()
        }
        expect(t.rubric, `${t.id} rubric`).toBeTruthy()
      }
    }
  })

  it('Lernpfad ist vollständig & geordnet (①–⑤)', () => {
    seedCourseContent()
    const ids = courseStore.listStations().map(s => s.id)
    for (const sid of ['s1', 's2', 's3', 's4', 's5']) expect(ids).toContain(sid)
    // order_no aufsteigend
    const orders = courseStore.listStations().filter(s => /^s[1-5]$/.test(s.id)).map(s => s.orderNo)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })
})

describe('Stationen ②–⑤ – echte Korpus-Auflösung (falls wortprofil.db verfügbar)', () => {
  it('Anker-Lemmata existieren in wortprofil.db', () => {
    if (!lemmaExistsInWortprofil('Kritik')) return // DB im Lauf nicht verfügbar → soft skip
    const anchors = new Set()
    for (const { mod } of Object.values(STATIONS)) {
      for (const it of mod.tasks) if (it.source === 'corpus-template') anchors.add(it.corpusQuery.lemma)
    }
    for (const lemma of anchors) expect(lemmaExistsInWortprofil(lemma), `Anker „${lemma}“`).toBe(true)
  })

  it('ein corpus-template-Item löst mit echten Werten auf (Haar/ATTR, ④ SekII)', () => {
    if (!lemmaExistsInWortprofil('Haar')) return
    const corpus = makeCorpusAdapter()
    const item = station4.tasks.find(t => t.id === 's4-f3-haeufig-vs-typisch-sek2')
    const resolved = resolveItemInteractive(item, { corpus })
    // contrastPair → zwei Varianten mit echten logDice/Frequenz-Werten
    expect(resolved.payload.variants.length).toBe(2)
    for (const v of resolved.payload.variants) {
      expect(typeof v.label).toBe('string')
      expect(Number.isFinite(v.logDice)).toBe(true)
    }
    // Platzhalter im Feedback sind ersetzt (kein {{…}} mehr durchgesickert)
    expect(resolved.feedback.onCorrect).not.toMatch(/\{\{/)
  })
})
