/**
 * Tests für die Lemma-Suche in belege.js (Phase F2, `lemmata_fts`).
 *
 * Eigene Datei mit eigener Fixture (statt die von belege.test.js zu erweitern):
 * belege.test.js beweist bewusst den Zustand OHNE `lemmata_fts` (Rollback-Fall,
 * alte DB) – jede Zeile dort läuft über den reinen Wortform-Fallback. Diese
 * Datei baut dieselbe Grundform der Fixture, aber MIT `lemmata_fts`, und prüft
 * gezielt die Drei-Stufen-Logik aus `holeZweiTermPool()`:
 *   1. Lemma-Suche trifft direkt (kein Flexions-Fallback mehr nötig).
 *   2. Lemma-Pool zu dünn → Wortform-Suche ergänzt.
 *   3. Auch Wortform-Suche leer → Flexions-Fallback (Prefix) wie bisher.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmp
let belege

/**
 * Baut eine v2-Fixture MIT `lemmata_fts`. Vier Fälle, gezielt für die
 * Stufen-Entscheidung konstruiert:
 *
 *  - "haus"+"bauen": Grundform steht im Text UND in lemmata_fts → Tier 1 reicht.
 *  - "digital"+"gesundheitsanwendung": NUR flektiert im Text („digitalen
 *    Gesundheitsanwendungen"), aber lemmata_fts hat die korrekte Lemma-Folge
 *    → Tier 1 findet es direkt, OHNE den (teureren) Flexions-Fallback.
 *  - "wecker"+"klingeln": steht im Text UND in belege_fts, aber lemmata_fts hat
 *    KEINEN Eintrag dafür (simuliert eine Tagging-Lücke von annotate_lemmata.py,
 *    z.B. bei trennbaren Verben) → Tier 1 leer, Tier 2 (Wortform-Suche) greift.
 *  - "krieg"+"siebenjährig": weder in lemmata_fts NOCH in belege_fts als
 *    Grundform, nur flektiert („Siebenjährigen Krieges") → Tier 1+2 leer,
 *    Tier 3 (Flexions-Fallback) muss greifen, genau wie ohne F2.
 */
function baueFixtureMitLemma(pfad) {
  const db = new Database(pfad)
  db.exec(`
    CREATE TABLE dokumente (doc_id INTEGER PRIMARY KEY, quelle TEXT NOT NULL,
                            ref TEXT NOT NULL, jahr INTEGER, genre TEXT, epoche TEXT);
    CREATE TABLE quellen (quelle TEXT PRIMARY KEY, zitation TEXT NOT NULL, lizenz TEXT NOT NULL);
    CREATE TABLE saetze (id INTEGER PRIMARY KEY, satz TEXT NOT NULL, doc_id INTEGER NOT NULL);
    CREATE VIRTUAL TABLE belege_fts USING fts5(
      satz, content='saetze', content_rowid='id', tokenize='unicode61 remove_diacritics 0');
    CREATE VIRTUAL TABLE lemmata_fts USING fts5(
      lemma_folge, tokenize='unicode61', content='', detail=none);
  `)

  db.prepare('INSERT INTO quellen VALUES (?, ?, ?)').run('testkorpus', 'Zitation testkorpus', 'CC BY-SA 4.0')
  const insD = db.prepare('INSERT INTO dokumente VALUES (?, ?, ?, ?, NULL, NULL)')
  const insS = db.prepare('INSERT INTO saetze VALUES (?, ?, ?)')
  const insL = db.prepare('INSERT INTO lemmata_fts(rowid, lemma_folge) VALUES (?, ?)')

  db.transaction(() => {
    let id = 0
    const satz = (text, lemmaFolge) => {
      id++
      const docId = id
      insD.run(docId, 'testkorpus', `Ref ${docId}`, 2020)
      insS.run(id, text, docId)
      if (lemmaFolge != null) insL.run(id, lemmaFolge)
    }

    // Tier 1 reicht: Grundform im Text UND im Lemma-Index (mehrfach, für Pool/Diversität).
    for (let i = 0; i < 10; i++) {
      satz(`Wir wollten ein schönes Haus bauen, Fall ${i}.`, 'wollen schoen haus bauen fall')
    }

    // Tier 1 reicht (Flexion): nur flektiert im Text, aber korrekt lemmatisiert im Index.
    for (let i = 0; i < 6; i++) {
      satz(
        `Die digitalen Gesundheitsanwendungen wurden geprüft, Fall ${i}.`,
        'digital gesundheitsanwendung pruefen fall',
      )
    }

    // Tier 2 (Wortform-Fallback): im Text UND in belege_fts, aber lemmata_fts hat
    // absichtlich NICHTS dafür (simuliert Tagging-Lücke) — lemma_folge bekommt
    // ein anderes, harmloses Lemma.
    for (let i = 0; i < 4; i++) {
      satz(`Der Wecker begann laut zu klingeln, Fall ${i}.`, 'gegenstand laeuten fall')
    }

    // Tier 3 (Flexions-Fallback): weder Grundform im Text noch im Lemma-Index.
    for (let i = 0; i < 4; i++) {
      satz(`Die Schlacht im Siebenjährigen Krieges wird untersucht, Fall ${i}.`, 'schlacht untersuchen fall')
    }

    // Konjugierte Verbform, die die Infinitiv-Endung ERSETZT statt ergänzt:
    // „verblasst" ist kürzer als „verblassen", reines startsWith(lemma) trifft
    // das nie (matchesLemma-Fix, gefunden 2026-08-19). Nur über die Lemma-Suche
    // (Tier 1) auffindbar, da die Grundform „verblassen" im Text nirgends steht.
    for (let i = 0; i < 3; i++) {
      satz(`Die Erinnerung an jenen Sommer verblasst mit den Jahren, Fall ${i}.`, 'erinnerung sommer verblassen jahr fall')
    }

    // Rauschen, damit Fenster/Pool nicht trivial klein sind.
    for (let i = 0; i < 50; i++) {
      satz(`Ein belangloser Füllsatz ohne die gesuchten Wörter, Nummer ${i}.`, 'belanglos fuellsatz nummer')
    }
  })()

  db.exec("INSERT INTO belege_fts(belege_fts) VALUES('rebuild')")
  db.close()
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'belege-lemma-test-'))
  const pfad = join(tmp, 'belege_v2.db')
  baueFixtureMitLemma(pfad)
  process.env.BELEGE_DB = pfad
  belege = await import('../belege.js?lemma-test')
})

afterAll(() => {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* egal */ }
})

describe('belege.js – Lemma-Suche (Phase F2)', () => {
  it('findet ein Paar direkt über die Lemma-Grundform (Tier 1)', () => {
    const rows = belege.fetchBelege('Haus', 'bauen', { limit: 5 })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].tokens.some(t => t.hl)).toBe(true)
  })

  it('findet ein nur-flektiertes Paar über die Lemma-Suche, ohne Flexions-Fallback', () => {
    // Anders als in belege.test.js: hier steht die korrekte Lemma-Folge im
    // Index, Tier 1 muss also direkt treffen (nicht erst Tier 3).
    const rows = belege.fetchBelege('digital', 'Gesundheitsanwendung', { limit: 3 })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.tokens.map(t => t.w).join(' ')).toMatch(/digitalen Gesundheitsanwendungen/)
    }
  })

  it('fällt auf die Wortform-Suche zurück, wenn lemmata_fts keinen Eintrag hat (Tier 2)', () => {
    // "Wecker"/"klingeln" steht nicht in lemmata_fts (simulierte Tagging-Lücke),
    // aber als Grundform im Text — muss trotzdem gefunden werden.
    const rows = belege.fetchBelege('Wecker', 'klingeln', { limit: 3 })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.tokens.map(t => t.w).join(' ')).toMatch(/Wecker.*klingeln/)
    }
  })

  it('fällt bis auf den Flexions-Fallback zurück, wenn auch die Wortform-Suche leer bleibt (Tier 3)', () => {
    const rows = belege.fetchBelege('Krieg', 'siebenjährig', { limit: 3 })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.tokens.map(t => t.w).join(' ')).toMatch(/Siebenjährigen Krieges/)
    }
  })

  it('fetchBelegeRaw nutzt ebenfalls die Lemma-Suche zuerst', () => {
    const rows = belege.fetchBelegeRaw('digital', 'Gesundheitsanwendung', { limit: 3 })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => /digitalen Gesundheitsanwendungen/.test(r.satz))).toBe(true)
  })

  it('fetchBelegeForLemma nutzt die Lemma-Suche für das Archiv', () => {
    const rows = belege.fetchBelegeForLemma('Haus', { limit: 2 })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => /Haus/.test(r.satz))).toBe(true)
  })

  it('markiert eine konjugierte Verbform, die die Infinitiv-Endung ersetzt statt ergänzt', () => {
    // Nur über die Lemma-Suche auffindbar (Grundform „verblassen" steht nicht
    // im Text) — und die Hervorhebung muss die konjugierte Form „verblasst"
    // trotzdem markieren (matchesLemma-Verb-Stamm-Fallback).
    const [erster] = belege.fetchBelege('Erinnerung', 'verblassen', { limit: 1 })
    expect(erster).toBeDefined()
    const markiert = erster.tokens.filter(t => t.hl).map(t => t.w)
    expect(markiert).toContain('verblasst')
  })

  it('gibt bei einem Paar ohne jeden Treffer eine leere Liste zurück', () => {
    expect(belege.fetchBelege('Nashorn', 'jodeln', { limit: 5 })).toEqual([])
  })
})
