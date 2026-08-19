/**
 * Tests für die Fenstersuche in belege.js (Gate G, Latenz-Fix).
 *
 * Gegen eine echte FTS5-Fixture im v2-Schema, nicht gegen Mocks: die Logik, die
 * hier schiefgehen kann, steckt genau im Zusammenspiel von FTS5-rowid-Fenstern,
 * Zonen und Auffüllregeln. Die Fixture bildet die Korpus-Lage der echten DB nach
 * — Blöcke in rowid-Reihenfolge, mit einem Block im teuren Mittelbereich, den
 * die Fenster bewusst auslassen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const SAETZE_GESAMT = 2000
const SATZ_JE_DOK = 10

let tmp
let belege

/** Baut eine Fixture mit demselben Schema wie belege_v2.db. */
function baueFixture(pfad) {
  const db = new Database(pfad)
  db.exec(`
    CREATE TABLE dokumente (doc_id INTEGER PRIMARY KEY, quelle TEXT NOT NULL,
                            ref TEXT NOT NULL, jahr INTEGER, genre TEXT, epoche TEXT);
    CREATE TABLE quellen (quelle TEXT PRIMARY KEY, zitation TEXT NOT NULL, lizenz TEXT NOT NULL);
    CREATE TABLE saetze (id INTEGER PRIMARY KEY, satz TEXT NOT NULL, doc_id INTEGER NOT NULL);
    CREATE VIRTUAL TABLE belege_fts USING fts5(
      satz, content='saetze', content_rowid='id', tokenize='unicode61 remove_diacritics 0');
  `)

  // Korpusblöcke in rowid-Reihenfolge, wie im echten Bestand.
  // „mitte" liegt zwischen 34 % und 64 % – dorthin zielt kein Fenster.
  const bloecke = [
    { quelle: 'unten_a', bis: 0.17, jahr: 2015 },
    { quelle: 'unten_b', bis: 0.34, jahr: 1975 },
    { quelle: 'mitte', bis: 0.64, jahr: 1880 },
    { quelle: 'oben_a', bis: 0.82, jahr: 2015 },
    { quelle: 'oben_b', bis: 1.0, jahr: 2020 },
  ]
  const insQ = db.prepare('INSERT INTO quellen VALUES (?, ?, ?)')
  const insD = db.prepare('INSERT INTO dokumente VALUES (?, ?, ?, ?, NULL, NULL)')
  const insS = db.prepare('INSERT INTO saetze VALUES (?, ?, ?)')

  db.transaction(() => {
    for (const b of bloecke) insQ.run(b.quelle, `Zitation ${b.quelle}`, 'CC BY-SA 4.0')

    let id = 0
    for (const b of bloecke) {
      const bis = Math.round(SAETZE_GESAMT * b.bis)
      while (id < bis) {
        id++
        const docId = Math.ceil(id / SATZ_JE_DOK)
        if (id % SATZ_JE_DOK === 1) insD.run(docId, b.quelle, `Ref ${b.quelle} ${docId}`, b.jahr)
        // Häufiges Paar: in jedem zweiten Satz, also über alle Blöcke verteilt.
        // Die Länge variiert bewusst, damit scoreBeleg() unterschiedliche Werte
        // liefert — bei lauter gleich guten Sätzen wäre jede Auswahlregel blind.
        const fuellwoerter = 'sehr '.repeat(id % 7)
        insS.run(id, id % 2 === 0
          ? `Wir wollten damals ein ${fuellwoerter}schönes Haus bauen, Nummer ${id}.`
          : `Ein belangloser Füllsatz ohne die gesuchten Wörter, Nummer ${id}.`, docId)
      }
    }

    // Seltenes Paar AUSSCHLIESSLICH im teuren Mittelblock (rowid ~ 50 %).
    // Nur der Kehrpfad ab rowid 0 kann das finden – kein Fenster reicht dorthin.
    insS.run(SAETZE_GESAMT + 1,
      'Der Kobold wollte auf dem Dachfirst tanzen und niemand hielt ihn auf.', 51)
    // Achtung: rowid muss im Mittelblock liegen, deshalb einen echten Satz dort
    // überschreiben statt anzuhängen.
    db.prepare('UPDATE saetze SET satz = ? WHERE id = ?').run(
      'Der Kobold wollte auf dem Dachfirst tanzen und niemand hielt ihn auf.', 1000)
    db.prepare('DELETE FROM saetze WHERE id = ?').run(SAETZE_GESAMT + 1)

    // Paar, das nur in EINEM Dokument vorkommt (doc 3, rowid 21–30):
    // prüft das Auffüllen, wenn es weniger Dokumente als limit gibt.
    for (let i = 21; i <= 28; i++) {
      db.prepare('UPDATE saetze SET satz = ? WHERE id = ?').run(
        `Der Einsiedler kam allein aus seiner Klause und blieb still, Satz ${i}.`, i)
    }

    // Paar, das AUSSCHLIESSLICH flektiert im Text steht — die Grundformen
    // „digital" und „Gesundheitsanwendung" kommen nirgends vor. Genau der Fall,
    // für den es den Flexions-Fallback gibt. Über mehrere Dokumente verteilt
    // (ungerade rowids = Füllsätze, es geht also kein „Haus + bauen" verloren).
    for (const [n, id] of [41, 51, 61, 71, 81, 91].entries()) {
      db.prepare('UPDATE saetze SET satz = ? WHERE id = ?').run(
        `Die digitalen Gesundheitsanwendungen wurden im Verzeichnis geprüft, Fall ${n + 1}.`, id)
    }

    // Gegenprobe zur Mindestlänge: „Tor" ist zu kurz zum Prefixen, darf also
    // NICHT über „Tortenheber" gefunden werden.
    db.prepare('UPDATE saetze SET satz = ? WHERE id = ?').run(
      'Die Tortenheber lagen ordentlich sortiert auf dem Tisch bereit.', 101)

  })()

  db.exec("INSERT INTO belege_fts(belege_fts) VALUES('rebuild')")
  db.close()
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'belege-test-'))
  const pfad = join(tmp, 'belege_v2.db')
  baueFixture(pfad)
  process.env.BELEGE_DB = pfad
  process.env.WORTPROFIL_DB = join(tmp, 'gibt-es-nicht.db')  // → Variantensuche inaktiv
  belege = await import('../belege.js')
})

afterAll(() => {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* egal */ }
})

describe('belege.js – Fenstersuche', () => {
  it('findet ein häufiges Paar und liefert die volle Anzahl', () => {
    const rows = belege.fetchBelege('Haus', 'bauen', { limit: 5 })
    expect(rows).toHaveLength(5)
    expect(rows[0].tokens.some(t => t.hl)).toBe(true)
  })

  it('liefert höchstens einen Beleg je Dokument', () => {
    // 20 Läufe, weil die Fensterlage gewürfelt wird – ein Einzellauf beweist nichts.
    for (let i = 0; i < 20; i++) {
      const rows = belege.fetchBelege('Haus', 'bauen', { limit: 5 })
      const fundstellen = new Set(rows.map(r => r.quelle))
      expect(fundstellen.size).toBe(rows.length)
    }
  })

  it('streut über mehrere Korpora statt nur über das zuerst importierte', () => {
    const gesehen = new Set()
    for (let i = 0; i < 20; i++) {
      for (const r of belege.fetchBelege('Haus', 'bauen', { limit: 5 })) {
        gesehen.add(r.quelle.match(/Zitation (\w+)/)?.[1])
      }
    }
    // Ohne Fenster käme alles aus „unten_a" (rowid-Reihenfolge = Importreihenfolge).
    expect(gesehen.size).toBeGreaterThan(1)
    expect(gesehen.has('unten_a')).toBe(true)
    expect([...gesehen].some(q => q.startsWith('oben'))).toBe(true)
  })

  it('findet ein seltenes Paar, das nur im ausgelassenen Mittelbereich liegt', () => {
    // Der Kehrpfad ab rowid 0 ist die einzige Chance – ohne ihn wäre der Beleg
    // je nach Würfel unauffindbar. Deshalb 30 Läufe, alle müssen treffen.
    for (let i = 0; i < 30; i++) {
      const rows = belege.fetchBelege('Kobold', 'tanzen', { limit: 5 })
      expect(rows).toHaveLength(1)
    }
  })

  it('füllt auf, wenn es weniger Dokumente als limit gibt', () => {
    // „Einsiedler + Klause" steht achtmal in genau einem Dokument.
    const rows = belege.fetchBelege('Einsiedler', 'Klause', { limit: 5 })
    expect(rows).toHaveLength(5)
    expect(new Set(rows.map(r => r.quelle)).size).toBe(1)
  })

  it('gibt bei einem Paar ohne Treffer eine leere Liste zurück', () => {
    expect(belege.fetchBelege('Nashorn', 'jodeln', { limit: 5 })).toEqual([])
  })
})

describe('belege.js – Flexions-Fallback', () => {
  it('findet ein Paar, das nur flektiert im Text steht', () => {
    // Ohne Fallback wäre das Ergebnis leer: im Text steht nur „digitalen
    // Gesundheitsanwendungen", nie die beiden Grundformen.
    const rows = belege.fetchBelege('digital', 'Gesundheitsanwendung', { limit: 3 })
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.tokens.map(t => t.w).join(' ')).toMatch(/digitalen Gesundheitsanwendungen/)
    }
  })

  it('markiert die flektierten Formen im gefundenen Beleg', () => {
    // Sonst fände die Suche zwar Sätze, die Anzeige hätte darin aber nichts
    // hervorzuheben – im Archiv fiele die KWiC-Zerlegung leer aus.
    const [erster] = belege.fetchBelege('digital', 'Gesundheitsanwendung', { limit: 1 })
    const markiert = erster.tokens.filter(t => t.hl).map(t => t.w)
    expect(markiert).toContain('digitalen')
    expect(markiert).toContain('Gesundheitsanwendungen')
  })

  it('prefixt keine Wörter unter vier Zeichen', () => {
    // „Tor" darf nicht über „Tortenheber" gefunden werden – sonst produziert der
    // Fallback bei kurzen Lemmata sachfremde Belege.
    expect(belege.fetchBelege('Tor', 'Tisch', { limit: 5 })).toEqual([])
  })

  it('lässt Paare unberührt, die schon in Grundform gefunden werden', () => {
    // „Haus + bauen" steht als Grundform im Text; der Fallback darf hier gar
    // nicht erst anspringen und keine anderen Sätze hereinziehen.
    for (const r of belege.fetchBelege('Haus', 'bauen', { limit: 5 })) {
      expect(r.tokens.map(t => t.w).join(' ')).toMatch(/Haus bauen/)
    }
  })
})

describe('belege.js – Jahr-Filter (läuft in JavaScript über den Pool)', () => {
  it('bevorzugt Belege im Jahresband', () => {
    // 1880 gibt es nur im Mittelblock; 2015/2020 in den Randblöcken.
    for (let i = 0; i < 10; i++) {
      const rows = belege.fetchBelege('Haus', 'bauen', { limit: 5, year: 2018 })
      expect(rows.length).toBe(5)
      // Alle Quellen müssen aus den Blöcken mit Jahr 2015/2020 stammen.
      expect(rows.every(r => /oben_a|oben_b|unten_a/.test(r.quelle))).toBe(true)
    }
  })

  it('fällt auf den ungefilterten Pool zurück, wenn das Band zu wenig hergibt', () => {
    // 1600 liegt in keinem Block – ohne Fallback käme nichts zurück.
    const rows = belege.fetchBelege('Haus', 'bauen', { limit: 5, year: 1600 })
    expect(rows).toHaveLength(5)
  })
})

describe('belege.js – Archiv (fetchBelegeForLemma)', () => {
  it('liefert für dasselbe Lemma reproduzierbar dieselben Belege', () => {
    const laeufe = [0, 1, 2].map(() =>
      belege.fetchBelegeForLemma('Haus', { limit: 2 }).map(b => b.satz))
    expect(laeufe[1]).toEqual(laeufe[0])
    expect(laeufe[2]).toEqual(laeufe[0])
    expect(laeufe[0]).toHaveLength(2)
  })

  it('liefert für verschiedene Lemmata verschiedene Startpunkte', () => {
    const a = belege.fetchBelegeForLemma('Haus', { limit: 2 })
    const b = belege.fetchBelegeForLemma('Füllsatz', { limit: 2 })
    expect(a[0].satz).not.toEqual(b[0]?.satz)
  })

  it('liefert KWiC-Zerlegung und markierte Tokens', () => {
    const [erster] = belege.fetchBelegeForLemma('Haus', { limit: 1 })
    expect(erster.kwic).toMatchObject({ keyword: expect.stringContaining('Haus') })
    expect(erster.tokens.some(t => t.hl)).toBe(true)
  })
})

describe('belege.js – fetchBelegeRaw', () => {
  it('hält das limit ein und dedupliziert', () => {
    const rows = belege.fetchBelegeRaw('Haus', 'bauen', { limit: 12 })
    expect(rows).toHaveLength(12)
    expect(new Set(rows.map(r => r.satz)).size).toBe(12)
  })

  it('sortiert NICHT nach scoreBeleg vor – die Aufrufer wählen selbst', () => {
    const rows = belege.fetchBelegeRaw('Haus', 'bauen', { limit: 20 })
    const scores = rows.map(r => belege.scoreBeleg(r.satz))
    const absteigend = [...scores].sort((a, b) => b - a)
    // Bei Vorsortierung wäre die Reihenfolge exakt absteigend.
    expect(scores).not.toEqual(absteigend)
  })
})

describe('scoreBeleg', () => {
  it('bevorzugt vollständige Sätze gegenüber Fragmenten', () => {
    const gut = belege.scoreBeleg('Der Wirt wollte uns eine schöne Geschichte auftischen.')
    const fragment = belege.scoreBeleg('und dann auftischen')
    expect(gut).toBeGreaterThan(fragment)
  })

  it('bestraft Monatsreste, Klammern und Redner-Präfixe', () => {
    const neutral = belege.scoreBeleg('Die Gäste kamen pünktlich und blieben lange sitzen.')
    expect(belege.scoreBeleg('Februar die Gäste kamen pünktlich und blieben.')).toBeLessThan(neutral)
    expect(belege.scoreBeleg('Die Gäste kamen (vgl. S. 12) und blieben lange.')).toBeLessThan(neutral)
    expect(belege.scoreBeleg('Kiesinger: Die Gäste kamen und blieben lange sitzen.')).toBeLessThan(neutral)
  })

  it('gibt für leere Eingaben den Minimalwert', () => {
    expect(belege.scoreBeleg('')).toBeLessThan(-1000)
    expect(belege.scoreBeleg(null)).toBeLessThan(-1000)
  })
})
