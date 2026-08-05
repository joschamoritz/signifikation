/**
 * wortprofil.js – Anzeige-Filter für Hilfsverben (F12), Wortart-Ermittlung nach
 * Häufigkeit („Elend"-Fix) und Ausweichen auf die kanonische Lemmaform
 * („präzise"-Fix).
 *
 * `server/wortprofil.js` hatte bisher keine Tests, weil es eine echte
 * Korpus-DB braucht und überall gemockt wird. Hier wird stattdessen eine
 * winzige SQLite-Datei mit dem v2-Schema gebaut – schnell, deterministisch und
 * ohne Abhängigkeit von der 17-GB-Produktions-DB.
 *
 * WORTPROFIL_HIDE_AUX wird beim Modul-Import gelesen, deshalb je Erwartung ein
 * frischer Import über vi.resetModules().
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let dir
let dbPath

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'wp-test-'))
  dbPath = join(dir, 'wortprofil_test.db')
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE collocations (
      id INTEGER PRIMARY KEY, lemma TEXT, pos TEXT, relation TEXT,
      relation_full TEXT, relation_description TEXT, form TEXT,
      dep_lemma TEXT, dep_pos TEXT, prep TEXT DEFAULT '',
      frequency INTEGER, logDice REAL,
      dep_case TEXT DEFAULT '', dep_number TEXT DEFAULT ''
    );
    CREATE TABLE zeitreise (lemma TEXT, dep_lemma TEXT, dep_pos TEXT, jahrzehnt INTEGER, score REAL);
    CREATE TABLE lemma_corpus_freq (lemma TEXT, pos TEXT, quelle TEXT, freq INTEGER);
    CREATE TABLE build_info (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO build_info VALUES ('pipeline_version', 'v2');
  `)

  const ins = db.prepare(`INSERT INTO collocations
    (lemma, pos, relation, relation_full, relation_description, form, dep_lemma, dep_pos, frequency, logDice)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  // „Erfolg" ist der reale Fall aus der Messung: `haben` steht dort weit oben.
  const koll = [
    ['erfolg', 'Substantiv', '~OBJA', 'haben', 'Verb', 900, 9.5],
    ['erfolg', 'Substantiv', '~OBJA', 'erzielen', 'Verb', 800, 9.1],
    ['erfolg', 'Substantiv', '~OBJA', 'feiern', 'Verb', 700, 8.7],
    ['erfolg', 'Substantiv', '~OBJA', 'sein', 'Verb', 600, 8.2],
    ['erfolg', 'Substantiv', '~OBJA', 'werden', 'Verb', 500, 7.9],
    ['erfolg', 'Substantiv', '~OBJA', 'bringen', 'Verb', 400, 7.4],
  ]
  for (const [l, p, rel, dl, dp, f, ld] of koll) {
    ins.run(l, p, rel, `${l}-${p}-${rel}`, 'ist Akkusativobjekt von', dl, dl, dp, f, ld)
  }
  // „haben" als Substantiv-Kollokator (Nomen „Haben") darf NICHT gefiltert
  // werden – die Regel greift ausdrücklich nur auf Verben.
  ins.run('konto', 'Substantiv', 'KON', 'konto-Substantiv-KON', 'ist koordiniert mit',
    'haben', 'haben', 'Substantiv', 300, 7.0)

  // ── Datenlage für die kasusgenaue Objekt-Beschriftung ─────────────────────
  // REKTION_SCHWELLE ist 0,9: erst ab 90 % Anteil unter den bestimmbaren Kasus
  // (Acc/Dat/Gen — Nom und Leerwerte zählen nicht mit) wird beschriftet.
  const insK = db.prepare(`INSERT INTO collocations
    (lemma, pos, relation, relation_full, relation_description, form,
     dep_lemma, dep_pos, frequency, logDice, dep_case)
    VALUES (?, 'Verb', 'OBJA', ?, 'Akkusativobjekt', ?, ?, 'Substantiv', ?, ?, ?)`)
  const objekte = [
    // eindeutig Dativ (98 %) → „Dativobjekt"
    ['folgen', 'ruf', 900, 9.5, 'Dat'],
    ['folgen', 'beispiel', 800, 9.1, 'Dat'],
    ['folgen', 'einladung', 700, 8.8, 'Dat'],
    ['folgen', 'sache', 50, 6.0, 'Acc'],
    // eindeutig Akkusativ; „wein"/„wasser" tragen KEINEN bestimmbaren Kasus und
    // müssen trotzdem dasselbe Etikett bekommen wie „bier" (Konsistenzfall)
    ['trinken', 'bier', 900, 9.5, 'Acc'],
    ['trinken', 'wein', 800, 9.2, ''],
    ['trinken', 'wasser', 700, 8.9, 'Nom'],
    // gemischt (55 % / 45 %) → neutral
    ['danken', 'gast', 550, 9.0, 'Acc'],
    ['danken', 'helfer', 450, 8.6, 'Dat'],
    // nur Nom und leer → gar keine Grundlage → neutral
    ['tun', 'ding', 900, 9.4, 'Nom'],
    ['tun', 'arbeit', 800, 9.0, ''],
  ]
  for (const [verb, obj, f, ld, kasus] of objekte) {
    insK.run(verb, `${verb}-Verb-OBJA`, obj, obj, f, ld, kasus)
  }
  // Rückrichtung: Basis ist das Nomen, das Verb steht im Kollokator. Der Kasus
  // muss über die Rektion DIESES Verbs kommen, nicht aus der Zeile selbst.
  const insR = db.prepare(`INSERT INTO collocations
    (lemma, pos, relation, relation_full, relation_description, form,
     dep_lemma, dep_pos, frequency, logDice, dep_case)
    VALUES (?, 'Substantiv', '~OBJA', ?, 'ist Akkusativobjekt von', ?, ?, 'Verb', ?, ?, '')`)
  for (const [nomen, verb, f, ld] of [
    ['ruf', 'folgen', 900, 9.5], ['bier', 'trinken', 900, 9.5], ['gast', 'danken', 550, 9.0],
  ]) {
    insR.run(nomen, `${nomen}-Substantiv-~OBJA`, verb, verb, f, ld)
  }

  // Häufigkeiten für die Wortart-Ermittlung („deutsch" ist erdrückend Adjektiv,
  // hätte aber nach der alten Kollokator-Anzahl als Substantiv gewonnen).
  const lcf = db.prepare('INSERT INTO lemma_corpus_freq VALUES (?, ?, ?, ?)')
  lcf.run('deutsch', 'Adjektiv', 'leipzig', 3_118_719)
  lcf.run('deutsch', 'Substantiv', 'leipzig', 60_126)
  lcf.run('deutsch', 'Pronomen', 'leipzig', 5)   // keine Spiel-Wortart → raus

  // ── Datenlage für den Test der kanonischen Lemmaform ──────────────────────
  // KANONISCH_SCHWELLE ist 50: ab so vielen Zeilen gilt ein Lemma als gesund
  // und wird nicht mehr angefasst.
  const fuelle = (lemma, pos, n, rel = 'ATTR') => {
    for (let i = 0; i < n; i++) {
      ins.run(lemma, pos, rel, `${lemma}-${pos}-${rel}`, 'hat Adjektivattribut',
        `k${i}`, `k${i}`, 'Adjektiv', 100 - i, 8 - i / 100)
    }
  }
  fuelle('präzis', 'Adjektiv', 60)      // `präzise` existiert gar nicht → ausweichen
  fuelle('böse', 'Adjektiv', 3)         // beide da, aber die -e-Form ist unbrauchbar
  fuelle('bös', 'Adjektiv', 40)
  fuelle('leise', 'Adjektiv', 60)       // gesund → darf NICHT auf `leis` wandern
  fuelle('leis', 'Adjektiv', 5)
  fuelle('friede', 'Substantiv', 40)    // schwaches Substantiv
  fuelle('frieden', 'Verb', 20)         // nur Tagging-Artefakte, kein Substantiv
  fuelle('frieden', 'Adjektiv', 20)
  fuelle('liebe', 'Substantiv', 60)     // gesund → darf NICHT auf `lieb` wandern
  fuelle('lieb', 'Adjektiv', 60)
  db.close()
})

afterAll(() => {
  // wortprofil.js hält seine readonly-Verbindung bewusst offen (Modul-Singleton)
  // und bietet kein close(). Unter Windows lässt sich eine geöffnete Datei nicht
  // löschen (EBUSY) – dasselbe passiert in vitest.global-setup.js mit app.db.
  // Aufräumen ist hier reine Hygiene im Temp-Verzeichnis, kein Testkriterium.
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* Windows: EBUSY */ }
})

async function ladeModul({ hideAux }) {
  vi.resetModules()
  vi.stubEnv('WORTPROFIL_DB', dbPath)
  vi.stubEnv('WORTPROFIL_HIDE_AUX', hideAux ? '1' : '')
  return import('../wortprofil.js')
}

describe('AUX-Anzeigefilter (F12)', () => {
  it('lässt haben/sein/werden per Default stehen – die DB bleibt vollständig', async () => {
    const wp = await ladeModul({ hideAux: false })
    const rows = wp.queryRelation('Erfolg', 'Substantiv', '~OBJA')
    const woerter = rows.map(r => r.lemma)
    expect(woerter).toContain('haben')
    expect(woerter).toContain('sein')
    expect(woerter).toContain('werden')
    expect(rows).toHaveLength(6)
  })

  it('blendet sie mit WORTPROFIL_HIDE_AUX=1 aus, ohne die übrigen anzutasten', async () => {
    const wp = await ladeModul({ hideAux: true })
    const woerter = wp.queryRelation('Erfolg', 'Substantiv', '~OBJA').map(r => r.lemma)
    expect(woerter).not.toContain('haben')
    expect(woerter).not.toContain('sein')
    expect(woerter).not.toContain('werden')
    expect(woerter).toEqual(['erzielen', 'feiern', 'bringen'])
  })

  it('greift auch im Archiv (syntagmatische Muster)', async () => {
    const wp = await ladeModul({ hideAux: true })
    const { patterns } = wp.fetchSyntagmaticPatterns('Erfolg', 'Substantiv', { limit: 10 })
    expect(patterns.map(p => p.kollokator)).not.toContain('haben')
  })

  // Der Filter läuft nach dem SQL-LIMIT (F12: nicht in der DB filtern). Ohne
  // Ausgleich stünden in einer Top-3-Liste nur noch die Reste.
  it('füllt die angeforderte Anzahl trotz Filterung auf', async () => {
    const wp = await ladeModul({ hideAux: true })
    const { patterns } = wp.fetchSyntagmaticPatterns('Erfolg', 'Substantiv', { limit: 3 })
    expect(patterns).toHaveLength(3)
    expect(patterns.map(p => p.kollokator)).toEqual(['erzielen', 'feiern', 'bringen'])
  })

  it('überfragt ohne aktiven Filter nicht – das LIMIT bleibt exakt', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(wp.queryRelation('Erfolg', 'Substantiv', '~OBJA', 4)).toHaveLength(4)
    expect(wp.fetchSyntagmaticPatterns('Erfolg', 'Substantiv', { limit: 4 }).patterns).toHaveLength(4)
  })

  it('trifft nur Verben – das Substantiv „Haben" bleibt Kollokator', async () => {
    const wp = await ladeModul({ hideAux: true })
    const woerter = wp.queryRelation('Konto', 'Substantiv', 'KON').map(r => r.lemma)
    expect(woerter).toEqual(['Haben'])   // normalizeLemma schreibt Substantive groß
  })
})

describe('kasusgenaue Objekt-Beschriftung (Phase G, Terminologie)', () => {
  const muster = (wp, verb) =>
    wp.fetchSyntagmaticPatterns(verb, 'Verb', { limit: 10 })
      .patterns.filter(p => p.relation === 'OBJA').map(p => p.muster)

  it('beschriftet ein Dativ-Verb als Dativobjekt statt als Akkusativobjekt', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(muster(wp, 'folgen')).toEqual(Array(4).fill('Dativobjekt'))
  })

  it('lässt ein Akkusativ-Verb bei Akkusativobjekt', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(muster(wp, 'trinken')).toEqual(Array(3).fill('Akkusativobjekt'))
  })

  // Der eigentliche Grund für die Aggregation über das Verb: „wein" (leer) und
  // „wasser" (Nom-Artefakt) tragen keinen bestimmbaren Kasus. Zeilenweise
  // beschriftet stünde „Bier — Akkusativobjekt" neben „Wein — Objekt", ohne dass
  // es dafür einen sprachlichen Grund gäbe.
  it('beschriftet alle Objekte eines Verbs gleich, auch ohne Kasus in der Zeile', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(new Set(muster(wp, 'trinken')).size).toBe(1)
  })

  it('bleibt neutral, wenn die Kasus im Verb gemischt sind', async () => {
    const wp = await ladeModul({ hideAux: false })
    // danken: 55 % Acc / 45 % Dat — unter der Schwelle. Genau dieser Fall wurde
    // an echten Daten als Fehlurteil gemessen (dominant wäre Acc, richtig Dat).
    expect(muster(wp, 'danken')).toEqual(['Objekt', 'Objekt'])
  })

  it('bleibt neutral, wenn es gar keinen bestimmbaren Kasus gibt', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(muster(wp, 'tun')).toEqual(['Objekt', 'Objekt'])
  })

  it('nutzt in der Rückrichtung die Rektion des Kollokator-Verbs', async () => {
    const wp = await ladeModul({ hideAux: false })
    const rueck = (nomen) => wp.queryRelation(nomen, 'Substantiv', '~OBJA')
      .map(r => r.relation_description)
    expect(rueck('Ruf')).toEqual(['ist Dativobjekt von'])
    expect(rueck('Bier')).toEqual(['ist Akkusativobjekt von'])
    expect(rueck('Gast')).toEqual(['ist Objekt von'])
  })

  it('lässt andere Relationen unangetastet', async () => {
    const wp = await ladeModul({ hideAux: false })
    const { patterns } = wp.fetchSyntagmaticPatterns('Konto', 'Substantiv', { limit: 5 })
    expect(patterns.find(p => p.relation === 'KON')?.muster).toBe('ist koordiniert mit')
  })
})

describe('kanonische Lemmaform („präzise"-Fix)', () => {
  it('weicht auf die Grundform aus, wenn die Eingabeform gar nichts trägt', async () => {
    const wp = await ladeModul({ hideAux: false })
    // `präzise` existiert in der DB nicht – die Daten liegen unter `präzis`.
    expect(wp.queryRelation('präzise', 'Adjektiv', 'ATTR').length).toBe(30)
  })

  it('weicht auch aus, wenn die Eingabeform nur ein paar Streureste trägt', async () => {
    const wp = await ladeModul({ hideAux: false })
    // böse: 3 Zeilen, bös: 40 → die stärkere Form gewinnt.
    expect(wp.queryRelation('böse', 'Adjektiv', 'ATTR').length).toBe(30)
  })

  it('erkennt schwache Substantive (n-Deklination)', async () => {
    const wp = await ladeModul({ hideAux: false })
    // `frieden` hat als Substantiv 0 Zeilen (nur Verb-/Adjektiv-Artefakte),
    // `friede` 40. Ohne Ausweichen liefe das Spielwort „Frieden" leer.
    expect(wp.queryRelation('Frieden', 'Substantiv', 'ATTR').length).toBe(30)
  })

  it('lässt ein gesundes Lemma in Ruhe – auch wenn eine Variante existiert', async () => {
    const wp = await ladeModul({ hideAux: false })
    // leise (60) ist über der Schwelle → es wird gar nicht erst nach `leis` (5)
    // gesucht. Sonst könnte der Fallback ein korrektes Lemma verschlechtern.
    expect(wp.queryRelation('leise', 'Adjektiv', 'ATTR').length).toBe(30)
    expect(wp.fetchSyntagmaticPatterns('leise', 'Adjektiv', { limit: 5 }).total).toBe(
      wp.fetchSyntagmaticPatterns('leise', 'Adjektiv', { limit: 5 }).total)
  })

  it('wechselt nicht über die Wortartgrenze („Liebe" wird nicht zu „lieb")', async () => {
    const wp = await ladeModul({ hideAux: false })
    // `liebe` als Substantiv ist gesund (60); `lieb` existiert nur als Adjektiv.
    // Die Zählung ist wortartgebunden, ein Wechsel darf nicht stattfinden.
    expect(wp.queryRelation('Liebe', 'Substantiv', 'ATTR').length).toBe(30)
  })

  it('lässt unbekannte Wörter unbekannt, statt irgendetwas zu finden', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(wp.queryRelation('Quastenflosser', 'Substantiv', 'ATTR')).toEqual([])
  })
})

describe('posByFrequency („Elend"-Fix)', () => {
  it('sortiert die Wortarten nach Korpus-Häufigkeit', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(wp.posByFrequency('deutsch')).toEqual([
      { pos: 'Adjektiv', freq: 3_118_719 },
      { pos: 'Substantiv', freq: 60_126 },
    ])
  })

  it('liefert für unbekannte Lemmata eine leere Liste statt zu werfen', async () => {
    const wp = await ladeModul({ hideAux: false })
    expect(wp.posByFrequency('gibtesnicht')).toEqual([])
  })
})
