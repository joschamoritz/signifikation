// hinweise-probe.mjs – Stufe 0 des Umbaus „Kollokationen umgekehrt“
// (planning/Kollokationen-Umkehr.md): Prüft an echten Kalenderlemmata, ob sich
// aus der Wortprofil-DB 13 brauchbare Hinweise bauen lassen und in welcher
// Reihenfolge man sie aufdecken sollte. Ändert nichts an der App.
//
// Je Lemma:
//   1. Kandidaten: die Relationen der Wortart wie im Spiel (POS_ROUNDS), ohne
//      Pronomen, logDice ≥ MIN_DICE, ohne Sperrliste und ohne Komposita, die
//      das gesuchte Wort enthalten (Wohnhaus → Haus wäre ein Spoiler).
//   2. Auswahl: die HINWEISE stärksten nach frequency × logDice (Mischform).
//   3. Verrats-Grad je Hinweis aus der Gegenrichtung: Welchen Anteil hat das
//      gesuchte Wort an allen Kollokatoren des Hinweises, und auf welchem Platz
//      steht es dort (Tee → Kaffee: Platz 1, 33 %)?
//   4. Aufdeckung vom schwächsten zum stärksten Hinweis.
//
// Aufruf:
//   node scripts/hinweise-probe.mjs                 # jeder 9. Tag aus planning/lemma-import-*.json
//   node scripts/hinweise-probe.mjs --jeder=1       # alle Tage
//   node scripts/hinweise-probe.mjs --wort=Kaffee:Substantiv --wort=grün:Adjektiv
//   node scripts/hinweise-probe.mjs --out=planning/Kollokationen-Umkehr-Probe.md
//
// Ausgabe: Markdown-Bericht (Standard: planning/Kollokationen-Umkehr-Probe.md)
// plus JSON daneben (.json) für die weitere Kalibrierung.

import '../server/env.js'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { POS_ROUNDS } from '../server/wortprofil.js'

// ── Stellschrauben ───────────────────────────────────────────────────────────
const HINWEISE = 13          // 3 gratis + 10 kostenpflichtige
const GRATIS = 3
const MIN_FREQ = 5           // wie queryRelation
// Untergrenze für logDice. Erster Lauf mit 6 (Verb 5) war zu streng: Die Pools
// schrumpften auf eine Handvoll, und gerade die seltenen, exklusiven Partner
// (hereinenbringen, Bodhisattva, Gerstenähre) blieben übrig. Die Auswahl leistet
// die Sortierung nach frequency × logDice; die Grenze schneidet nur Zufallspaare ab.
const MIN_DICE = { Substantiv: 3, Adjektiv: 3, Verb: 3 }
// Nur Inhaltswörter als Hinweise. Bei Verben kommen über ADV sonst fast nur
// Adverbien wie damit, dadurch, bereits, gestern, dahinter, irgendwo.
const HINWEIS_POS = new Set(['Substantiv', 'Verb', 'Adjektiv'])
// Bekanntheit: Gesamtvorkommen des Hinweisworts im Korpus (lemma_corpus_freq).
// Darunter liegen Raritäten und Parser-/OCR-Reste (Symmetriebrechung 182,
// Gerstenähr 196, flammern 62, Computermonitor 430), darüber normale Wörter
// (Komplott 4.017, Kuss 28.324). Schneidet das Grundproblem des alten Spiels ab.
const MIN_KORPUS = 1000
// Aussagekraft: Anteil des gesuchten Worts unter den Kollokatoren des Hinweises.
// Darunter liegen Allerweltswörter, die zu fast allem passen (groß → Bär 0,05 %,
// machen → aufwachsen 0,13 %, lassen → verstecken 0,04 %).
const MIN_ANTEIL = 0.003
const STARK_ANTEIL = 0.10    // ab hier gilt ein Hinweis als verräterisch
const STARK_PLATZ = 1        // … oder wenn das Wort dort auf Platz 1 steht

// Funktionswörter, Mengen- und Ordnungswörter, Hilfsverben: passen zu fast
// allem und helfen beim Raten nicht. Bewusst klein, wird an den Ergebnissen
// nachgeschärft.
const SPERRLISTE = new Set([
  'so', 'hier', 'noch', 'wie', 'mal', 'einmal', 'auch', 'nur', 'schon', 'dann',
  'jetzt', 'da', 'dort', 'immer', 'sehr', 'wieder', 'nicht', 'gar', 'bereits',
  'etwa', 'erst', 'eben', 'doch', 'ja', 'nun', 'heute', 'bald', 'oft', 'selbst',
  'also', 'ebenfalls', 'zudem', 'dabei', 'damit', 'dazu', 'darauf', 'davon',
  'aber', 'wo', 'zunächst', 'sogar', 'vielleicht', 'wohl', 'gerade', 'natürlich',
  'überhaupt', 'trotzdem', 'dennoch', 'jedoch', 'allerdings',
  'erste', 'zweite', 'dritte', 'letzt', 'letzte', 'nächst', 'nächste',
  'solch', 'solche', 'entsprechend', 'weiter', 'weitere', 'ander', 'andere',
  'jede', 'jeder', 'viel', 'viele', 'mehr', 'mehrere', 'wenig', 'wenige',
  'einige', 'beide', 'sonstig', 'sogenannt', 'jeweilig', 'betreffend', 'genannt',
  'folgend', 'bestimmt', 'gewiss', 'ganz', 'eigen', 'haben', 'sein', 'werden',
  'einzig', 'gesamt', 'übrig', 'damalig', 'heutig', 'ehemalig',
  // Allerweltsverben (Funktions-/Stützverben): liegen bei Verben über KON knapp
  // über MIN_ANTEIL (erklären ← kommen 0,32 %, nehmen 0,40 %, machen 0,42 %)
  'kommen', 'gehen', 'machen', 'lassen', 'nehmen', 'geben', 'sagen', 'stellen',
  'sehen', 'bringen', 'finden', 'halten', 'legen', 'liegen', 'stehen', 'setzen',
  'zeigen', 'führen', 'bleiben', 'tun',
  'dass', // Parserfehler: Konjunktion als Subjekt-Nomen („Dass ___“ bei heulen)
])

// Relation aus Sicht des gesuchten Worts → Relation aus Sicht des Hinweises.
const GEGEN = {
  KON: 'KON', ATTR: '~ATTR', '~ATTR': 'ATTR', OBJA: '~OBJA', '~OBJA': 'OBJA',
  ADV: '~ADV', '~ADV': 'ADV', '~PRED': 'PRED', PRED: '~PRED',
  SUBJA: '~SUBJA', '~SUBJA': 'SUBJA', GMOD: '~GMOD', '~GMOD': 'GMOD',
}
const REL_ALIAS = { OBJ: 'OBJA', '~OBJ': '~OBJA' }

// Zusätzliche Relationen, die das alte Spiel nicht nutzt. Erster Lauf (nur
// POS_ROUNDS): Verben hatten nur Objekte und koordinierte Verben („___ und
// weinen“), Substantive in 25 % der Rätsel kein einziges Verb. Subjekte sind
// gerade bei Verben sehr gute Hinweise (heulen ← Sturm, Wolf, Hund, Sirene;
// einstürzen ← Dach, Turm, Brücke), der Genitiv bei Substantiven (Dach ← Haus, Kirche).
const ZUSATZ_REL = { Substantiv: ['~SUBJA', 'GMOD'], Verb: ['SUBJA'], Adjektiv: [] }

/** Relationen je Wortart aus POS_ROUNDS (+ ZUSATZ_REL); PRED_REV wie in fetchRelation aufgelöst. */
function relationenFuer(pos) {
  const rels = (POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv).map((r) => REL_ALIAS[r.relCode] ?? r.relCode)
  const basis = rels.flatMap((r) => (r === 'PRED_REV' ? ['~ADV', '~PRED'] : [r]))
  return MIX ? [...basis, ...(ZUSATZ_REL[pos] ?? [])] : basis
}

// Anzeige als Muster mit Lücke („starker ___“ wäre schöner, braucht aber Flexion)
// plus kurze Beschriftung, weil „___ brummen“ (Subjekt) und „___ erlegen“ (Objekt)
// sonst gleich aussähen.
const MUSTER = {
  Substantiv: {
    ATTR: (c) => [`${c} ___`, 'Adjektiv'],
    KON: (c) => [`___ und ${c}`, 'in einer Reihe'],
    '~OBJA': (c) => [`___ ${c}`, 'als Objekt'],
    '~SUBJA': (c) => [`___ ${c}`, 'als Subjekt'],
    GMOD: (c) => [`___ des/der ${c}`, 'mit Genitiv'],
  },
  Verb: {
    OBJA: (c) => [`${c} ___`, 'Objekt'],
    SUBJA: (c) => [`${c} ___`, 'Subjekt'],
    KON: (c) => [`${c} und ___`, 'in einer Reihe'],
    ADV: (c) => [`${c} ___`, 'Adverb'],
  },
  Adjektiv: {
    '~ATTR': (c) => [`___ ${c}`, 'Nomen'],
    KON: (c) => [`${c} und ___`, 'in einer Reihe'],
    '~PRED': (c) => [`___ ${c}`, 'prädikativ'],
    '~ADV': (c) => [`___ ${c}`, 'adverbial'],
  },
}
const muster = (pos, rel, c) => (MUSTER[pos]?.[rel] ?? ((x) => [`${x}`, rel]))(c)

// Wortarten-Mix (Variante „mix“): Jede Hinweis-Wortart, die Kandidaten hat,
// bekommt mindestens MIN_JE_WORTART Plätze; koordinierte Wörter (KON) höchstens
// MAX_KON. KON liefert Kohyponyme (Bär und Wolf) – stark verräterisch, aber eher
// Wortfeld als Kollokation im engeren Sinn.
const MIN_JE_WORTART = 3
const MAX_KON = 4
// Welche Hinweis-Wortarten (ohne KON) je gesuchter Wortart überhaupt vorkommen
// können: Verben haben keine Adjektiv-Hinweise (ADV liefert nur Adverbien),
// Adjektive praktisch keine Verb-Hinweise (~PRED/~ADV sind in v2 fast leer).
// Substantiv-Hinweise bei Substantiven kommen schon über KON; eine Pflicht
// erzwänge sonst drei Genitive („Bär des Morgens“, „Kind der Ehe“).
const WORTART_PFLICHT = {
  Substantiv: ['Adjektiv', 'Verb'],
  Verb: ['Substantiv'],
  Adjektiv: ['Substantiv'],
}

const anzeige = (lemma, pos) => (pos === 'Substantiv' ? lemma.charAt(0).toUpperCase() + lemma.slice(1) : lemma)

// ── Argumente ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const arg = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3))
const jeder = Number(arg('jeder')[0] ?? 9)
// --variante=frei: nur POS_ROUNDS, reine Reihenfolge nach frequency × logDice (Stand des ersten Laufs)
// --variante=mix (Standard): Zusatzrelationen + Mindestplätze je Hinweis-Wortart + KON-Deckel
const MIX = (arg('variante')[0] ?? 'mix') === 'mix'
const outMd = arg('out')[0] ?? 'planning/Kollokationen-Umkehr-Probe.md'

function ladeKalender() {
  const dir = 'planning'
  const tage = readdirSync(dir)
    .filter((f) => /^lemma-import-.*\.json$/.test(f))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .sort((a, b) => a.datum.localeCompare(b.datum))
  return tage
    .filter((_, i) => i % jeder === 0)
    .flatMap((t) => t.woerter.map((w, i) => ({ datum: t.datum, lemma: w, pos: t.positionen?.[i] ?? 'Substantiv' })))
}

const ziele = arg('wort').length
  ? arg('wort').map((s) => { const [lemma, pos = 'Substantiv'] = s.split(':'); return { datum: '', lemma, pos } })
  : ladeKalender()

// ── DB ───────────────────────────────────────────────────────────────────────
const db = new Database(process.env.WORTPROFIL_DB, { readonly: true, fileMustExist: true })
db.pragma('cache_size = -262144')
const stmtKand = db.prepare(`
  SELECT dep_lemma, dep_pos, relation, frequency AS f, logDice AS d
  FROM collocations
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ?`)
const stmtGegen = db.prepare(`
  SELECT dep_lemma, frequency AS f
  FROM collocations
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ?`)

const stmtKorpus = db.prepare('SELECT SUM(freq) AS f FROM lemma_corpus_freq WHERE lemma = ? AND pos = ?')
const korpusCache = new Map()
function korpusFreq(lemma, pos) {
  const key = `${lemma.toLowerCase()}|${pos}`
  if (!korpusCache.has(key)) korpusCache.set(key, stmtKorpus.get(lemma.toLowerCase(), pos)?.f ?? 0)
  return korpusCache.get(key)
}

// Gegenrichtung je (Hinweis, Wortart, Relation) nur einmal laden: groß/neu/sehen
// tauchen bei vielen Lemmata auf.
const gegenCache = new Map()
function gegenrichtung(c, cPos, rel) {
  const key = `${c}|${cPos}|${rel}`
  let v = gegenCache.get(key)
  if (!v) {
    const rows = stmtGegen.all(c, cPos, rel, MIN_FREQ)
    const summe = rows.reduce((s, r) => s + r.f, 0)
    const map = new Map(rows.map((r) => [r.dep_lemma.toLowerCase(), r.f]))
    const sortiert = rows.map((r) => r.f).sort((a, b) => b - a)
    v = { summe, map, sortiert, top: [...rows].sort((a, b) => b.f - a.f).slice(0, 3).map((r) => r.dep_lemma) }
    gegenCache.set(key, v)
  }
  return v
}

function verratsGrad(lemmaLow, kand) {
  const rel = GEGEN[kand.relation]
  if (!rel) return { anteil: null, platz: null, top: [] }
  const g = gegenrichtung(kand.dep_lemma, kand.dep_pos, rel)
  const f = g.map.get(lemmaLow)
  if (f == null || !g.summe) return { anteil: null, platz: null, top: g.top }
  const platz = 1 + g.sortiert.filter((x) => x > f).length
  return { anteil: f / g.summe, platz, top: g.top }
}

const istStark = (h) => h.anteil != null && (h.anteil >= STARK_ANTEIL || h.platz <= STARK_PLATZ)

function pruefe({ datum, lemma, pos }) {
  const low = lemma.toLowerCase()
  const roh = []
  for (const rel of relationenFuer(pos)) roh.push(...stmtKand.all(low, pos, rel, MIN_FREQ))

  // logDice-Top-3 wie im heutigen Spiel (mixedPool: Dedupe nach höchstem logDice)
  const nachDice = new Map()
  for (const r of roh) {
    const k = r.dep_lemma.toLowerCase()
    if (!nachDice.has(k) || r.d > nachDice.get(k).d) nachDice.set(k, r)
  }
  const heuteTop3 = [...nachDice.values()].sort((a, b) => b.d - a.d).slice(0, 3).map((r) => anzeige(r.dep_lemma, r.dep_pos))

  const ausgeschlossen = { pronomen: 0, dice: 0, sperrliste: 0, selten: [], schwach: [], kompositum: [] }
  const kand = new Map()
  for (const r of roh) {
    const k = r.dep_lemma.toLowerCase()
    if (!HINWEIS_POS.has(r.dep_pos)) { ausgeschlossen.pronomen++; continue }
    if (r.d < (MIN_DICE[pos] ?? 6)) { ausgeschlossen.dice++; continue }
    if (SPERRLISTE.has(k)) { ausgeschlossen.sperrliste++; continue }
    // Verkürzte oder fehllemmatisierte Verbformen aus historischen Texten
    // (ruhn, blühn, tourn, erschraken): ein Infinitiv endet auf -en, -ern oder -eln.
    if (r.dep_pos === 'Verb' && !/(en|ern|eln)$/.test(k) && k !== 'tun' && k !== 'sein') {
      ausgeschlossen.sperrliste++
      continue
    }
    if (k === low || (low.length >= 4 && k.includes(low)) || (k.length >= 4 && low.includes(k))) {
      if (!ausgeschlossen.kompositum.includes(r.dep_lemma)) ausgeschlossen.kompositum.push(r.dep_lemma)
      continue
    }
    const score = r.f * r.d
    if (!kand.has(k) || score > kand.get(k).score) kand.set(k, { ...r, score })
  }
  const pool = [...kand.values()].sort((a, b) => b.score - a.score)

  // Der Reihe nach (stärkste Mischform zuerst) prüfen: unbekannte Wörter und
  // Hinweise ohne Aussagekraft überspringen. Gesucht wird, bis genug taugliche
  // Kandidaten da sind – im Mix-Fall auch genug je Hinweis-Wortart.
  const tauglich = []
  const jeWortart = {}
  let konGesammelt = 0
  const genugGesammelt = () => !MIX
    ? tauglich.length >= HINWEISE
    : tauglich.length - konGesammelt + Math.min(konGesammelt, MAX_KON) >= HINWEISE
      && (WORTART_PFLICHT[pos] ?? []).every((p) => (jeWortart[p] ?? 0) >= MIN_JE_WORTART)
  for (const [i, k] of pool.entries()) {
    if (genugGesammelt() || (MIX ? i >= 400 : false)) break
    const bekanntheit = korpusFreq(k.dep_lemma, k.dep_pos)
    if (bekanntheit < MIN_KORPUS) { ausgeschlossen.selten.push(k.dep_lemma); continue }
    const v = verratsGrad(low, k)
    if (v.anteil != null && v.anteil < MIN_ANTEIL) { ausgeschlossen.schwach.push(k.dep_lemma); continue }
    const [text, art] = muster(pos, k.relation, anzeige(k.dep_lemma, k.dep_pos))
    tauglich.push({
      wort: anzeige(k.dep_lemma, k.dep_pos),
      wortart: k.dep_pos,
      relation: k.relation,
      muster: text,
      art,
      f: k.f,
      d: Number(k.d.toFixed(1)),
      bekanntheit,
      score: k.score,
      ...v,
    })
    if (k.relation === 'KON') konGesammelt++
    else jeWortart[k.dep_pos] = (jeWortart[k.dep_pos] ?? 0) + 1
  }

  let auswahl
  if (!MIX) {
    auswahl = tauglich.slice(0, HINWEISE)
  } else {
    // 1. Mindestplätze je Hinweis-Wortart (die stärksten nach Mischform)
    // 2. Rest nach Mischform auffüllen, KON gedeckelt
    const gewaehlt = new Set()
    for (const p of WORTART_PFLICHT[pos] ?? []) {
      tauglich.filter((h) => h.wortart === p && h.relation !== 'KON').slice(0, MIN_JE_WORTART).forEach((h) => gewaehlt.add(h))
    }
    const konZahl = () => [...gewaehlt].filter((h) => h.relation === 'KON').length
    for (const h of tauglich) {
      if (gewaehlt.size >= HINWEISE) break
      if (gewaehlt.has(h)) continue
      if (h.relation === 'KON' && konZahl() >= MAX_KON) continue
      gewaehlt.add(h)
    }
    auswahl = [...gewaehlt].slice(0, HINWEISE)
  }
  // schwächster zuerst; unbekannter Verrats-Grad (keine Gegenrichtung) ans Ende der Schwachen
  const reihenfolge = [...auswahl].sort((a, b) => (a.anteil ?? 0.0001) - (b.anteil ?? 0.0001))

  const gratis = reihenfolge.slice(0, GRATIS)
  const ersterStark = reihenfolge.findIndex(istStark)
  const maxGratis = Math.max(0, ...gratis.map((h) => h.anteil ?? 0))

  return {
    datum, lemma, pos,
    pool: pool.length,
    wortarten: Object.fromEntries(['Adjektiv', 'Verb', 'Substantiv'].map((p) => [p, auswahl.filter((h) => h.wortart === p).length])),
    genug: auswahl.length >= HINWEISE,
    heuteTop3,
    ausgeschlossen,
    hinweise: reihenfolge,
    ersterStark: ersterStark >= 0 ? ersterStark + 1 : null,
    // Seltenster gewählter Hinweis: niedrig = Gefahr von Raritäten/Artefakten
    minFreq: Math.min(...auswahl.map((h) => h.f)),
    maxGratis: Number(maxGratis.toFixed(4)),
    schwierigkeit: null, // nach dem Lauf über Terzile von maxGratis
    ohneGegenrichtung: auswahl.filter((h) => h.anteil == null).length,
  }
}

// ── Lauf ─────────────────────────────────────────────────────────────────────
const t0 = Date.now()
const ergebnisse = []
for (const [i, z] of ziele.entries()) {
  const t = Date.now()
  ergebnisse.push(pruefe(z))
  process.stderr.write(`[${i + 1}/${ziele.length}] ${z.lemma} (${z.pos}) ${Date.now() - t} ms\n`)
}
process.stderr.write(`fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s, Gegenrichtungen im Cache: ${gegenCache.size}\n`)

// Schwierigkeit relativ zur Stichprobe: Terzile des stärksten Gratis-Hinweises.
// Absolute Schwellen sind erst sinnvoll, wenn echte Spieldaten (Punkte je Rätsel) vorliegen.
const sortiertGratis = ergebnisse.map((e) => e.maxGratis).sort((a, b) => a - b)
const terzil = (q) => sortiertGratis[Math.floor(q * (sortiertGratis.length - 1))] ?? 0
const [t1, t2] = [terzil(1 / 3), terzil(2 / 3)]
for (const e of ergebnisse) e.schwierigkeit = e.maxGratis > t2 ? 'leicht' : e.maxGratis > t1 ? 'mittel' : 'schwer'

// ── Bericht ──────────────────────────────────────────────────────────────────
const pct = (x) => (x == null ? '–' : `${(100 * x).toFixed(x < 0.01 ? 2 : 1)} %`)
const zaehle = (fn) => ergebnisse.filter(fn).length
const n = ergebnisse.length
const nachPos = {}
for (const e of ergebnisse) {
  nachPos[e.pos] ??= { n: 0, genug: 0 }
  nachPos[e.pos].n++
  if (e.genug) nachPos[e.pos].genug++
}

const zeilen = []
zeilen.push('---', `erstellt: ${new Date().toISOString().slice(0, 10)}`, '---', '',
  '# Probe: Hinweise für „Kollokationen umgekehrt“', '',
  `Erzeugt mit \`scripts/hinweise-probe.mjs\` (Stufe 0, [[Kollokationen-Umkehr]]), Variante **${MIX ? 'mix' : 'frei'}**. ${n} Lemmata, jeder ${jeder}. Tag aus den Lemma-Importen.`,
  `Einstellungen: ${HINWEISE} Hinweise (${GRATIS} gratis), frequency ≥ ${MIN_FREQ}, logDice ≥ ${Object.entries(MIN_DICE).map(([p, v]) => `${v} (${p})`).join(' / ')}, Sortierung frequency × logDice, Hinweiswort ≥ ${MIN_KORPUS} Korpusvorkommen, Anteil in der Gegenrichtung ≥ ${pct(MIN_ANTEIL)}, Aufdeckung nach Verrats-Grad aufsteigend. Schwierigkeit = Terzil des stärksten Gratis-Hinweises innerhalb dieser Stichprobe.`,
  '', '## Überblick', '',
  `- Genug Hinweise (≥ ${HINWEISE}): **${zaehle((e) => e.genug)} von ${n}**`
    + ` (${Object.entries(nachPos).map(([p, v]) => `${p} ${v.genug}/${v.n}`).join(', ')})`,
  `- Schwierigkeit nach den ${GRATIS} Gratis-Hinweisen: leicht ${zaehle((e) => e.schwierigkeit === 'leicht')}, mittel ${zaehle((e) => e.schwierigkeit === 'mittel')}, schwer ${zaehle((e) => e.schwierigkeit === 'schwer')}`,
  `- Verräterischer Hinweis (Anteil ≥ ${pct(STARK_ANTEIL)} oder Platz ${STARK_PLATZ}) schon unter den Gratis-Hinweisen: ${zaehle((e) => e.ersterStark != null && e.ersterStark <= GRATIS)}`,
  `- Kein verräterischer Hinweis unter allen ${HINWEISE}: ${zaehle((e) => e.ersterStark == null)}`,
  `- Hinweise ohne Gegenrichtung (Verrats-Grad unbekannt): ${ergebnisse.reduce((s, e) => s + e.ohneGegenrichtung, 0)}`,
  `- Seltenster Hinweis unter f=50 (Gefahr von Raritäten): ${zaehle((e) => e.minFreq < 50)}`,
  `- Rätsel mit allen drei Hinweis-Wortarten: ${zaehle((e) => Object.values(e.wortarten).every((x) => x > 0))}; ohne Verb-Hinweis: ${zaehle((e) => !e.wortarten.Verb)}; ohne Adjektiv-Hinweis: ${zaehle((e) => !e.wortarten.Adjektiv)}`,
  '', '## Je Lemma', '',
  `Format je Hinweis: Muster · Anteil des gesuchten Worts in der Gegenrichtung (Platz). **Fett** = verräterisch. Die ersten ${GRATIS} sind gratis.`, '')

for (const e of ergebnisse) {
  zeilen.push(`### ${anzeige(e.lemma, e.pos)} (${e.pos}${e.datum ? `, ${e.datum}` : ''})`, '',
    `Pool ${e.pool}${e.genug ? '' : ' ⚠ zu wenig'} · seltenster Hinweis f=${e.minFreq}${e.minFreq < 50 ? ' ⚠' : ''} · Schwierigkeit **${e.schwierigkeit}** · erster verräterischer Hinweis: ${e.ersterStark ?? '–'} · heute Top 3 (logDice): ${e.heuteTop3.join(', ')}`)
  if (e.ausgeschlossen.kompositum.length) zeilen.push(`  Ausgeschlossen als Spoiler: ${e.ausgeschlossen.kompositum.slice(0, 8).join(', ')}`)
  if (e.ausgeschlossen.selten.length) zeilen.push(`  Übersprungen, zu selten: ${e.ausgeschlossen.selten.slice(0, 8).join(', ')}`)
  if (e.ausgeschlossen.schwach.length) zeilen.push(`  Übersprungen, zu unspezifisch: ${e.ausgeschlossen.schwach.slice(0, 8).join(', ')}`)
  zeilen.push('')
  e.hinweise.forEach((h, i) => {
    const text = `${h.muster} · ${pct(h.anteil)}${h.platz ? ` (Platz ${h.platz})` : ''} · f=${h.f}, logDice ${h.d}`
    zeilen.push(`${i + 1}. ${istStark(h) ? `**${text}**` : text}${i === GRATIS - 1 ? '  ← Ende Gratis' : ''}`)
  })
  zeilen.push('')
}

writeFileSync(outMd, zeilen.join('\n'), 'utf8')
writeFileSync(outMd.replace(/\.md$/, '.json'), JSON.stringify(ergebnisse, null, 2), 'utf8')
process.stderr.write(`Bericht: ${outMd}\n`)
