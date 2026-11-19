// kollokationen-ranking-vergleich.mjs – Variante A aus planning/Kollokationen-Umkehr.md:
// Das Spiel „Kollokationen“ bleibt, wie es ist, nur die Rangfolge der Kollokatoren
// ändert sich. Vergleicht für echte Kalenderlemmata die heutigen Top 3 (logDice,
// echter Spielweg über fetchKollokatorenAnalyse) mit einer neuen Rangfolge nach
// frequency × logDice mit den Filtern aus Stufe 0. Ändert nichts an der App.
//
// Aufruf:
//   node scripts/kollokationen-ranking-vergleich.mjs              # jeder 9. Tag aus planning/lemma-import-*.json
//   node scripts/kollokationen-ranking-vergleich.mjs --jeder=1
//   node scripts/kollokationen-ranking-vergleich.mjs --wort=Kaffee:Substantiv --wort=grün:Adjektiv
//   node scripts/kollokationen-ranking-vergleich.mjs --verb=subj   # Verben: Objekt, Subjekt, Reihung statt Adverbien
//   node scripts/kollokationen-ranking-vergleich.mjs --out=planning/Kollokationen-Ranking-Vergleich.md

import '../server/env.js'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { POS_ROUNDS, fetchKollokatorenAnalyse, MIN_KOLLOKATOREN } from '../server/wortprofil.js'

// ── Stellschrauben (Herleitung in hinweise-probe.mjs / Kollokationen-Umkehr.md) ─
const MIN_FREQ = 5
const MIN_DICE = 3
const MIN_KORPUS = 1000      // Bekanntheit des Kollokators im Gesamtkorpus
const MIN_ANTEIL = 0.003     // Anteil der Basis unter den Kollokatoren des Kollokators
const KOLLOKATOR_POS = new Set(['Substantiv', 'Verb', 'Adjektiv', 'Adverb'])

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
  'kommen', 'gehen', 'machen', 'lassen', 'nehmen', 'geben', 'sagen', 'stellen',
  'sehen', 'bringen', 'finden', 'halten', 'legen', 'liegen', 'stehen', 'setzen',
  'zeigen', 'führen', 'bleiben', 'tun', 'dass',
  // Adverbien bei Verben (ADV-Runde): Zeit-, Orts- und Satzadverbien
  'damals', 'gestern', 'morgen', 'irgendwo', 'irgendwie', 'dadurch', 'dahinter',
  'darin', 'daran', 'dafür', 'dagegen', 'deshalb', 'daher', 'darum', 'somit',
  'stets', 'zuvor', 'danach', 'später', 'früher', 'bisher', 'inzwischen',
  'mittlerweile', 'zugleich', 'gleichzeitig', 'kaum', 'fast', 'eher', 'lediglich',
  'zuerst', 'endlich', 'plötzlich', 'sofort', 'gern', 'gerne', 'wirklich', 'völlig',
  'besonders', 'vor allem', 'allein', 'zusammen', 'anders', 'genau', 'lange',
])

const GEGEN = {
  KON: 'KON', ATTR: '~ATTR', '~ATTR': 'ATTR', OBJA: '~OBJA', '~OBJA': 'OBJA',
  ADV: '~ADV', '~ADV': 'ADV', '~PRED': 'PRED', PRED: '~PRED',
  SUBJA: '~SUBJA', '~SUBJA': 'SUBJA',
}
const REL_ALIAS = { OBJ: 'OBJA', '~OBJ': '~OBJA' }

/** Relationen wie im Spiel (POS_ROUNDS), PRED_REV wie in fetchRelation aufgelöst: [pos der Basis, relation]. */
function relationenFuer(pos) {
  // Variante „verb=subj“: Verben mit Subjekten statt Adverbien (einstürzen ← Gebäude, Brücke)
  if (pos === 'Verb' && VERB_SUBJ) return [['Verb', 'OBJA'], ['Verb', 'SUBJA'], ['Verb', 'KON']]
  return (POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv).flatMap(({ relCode }) => {
    const rel = REL_ALIAS[relCode] ?? relCode
    if (rel === 'PRED_REV') return [['Adjektiv', '~ADV'], ['Adverb', '~ADV'], ['Adjektiv', '~PRED']]
    return [[pos, rel]]
  })
}

const anzeige = (lemma, pos) => (pos === 'Substantiv' ? lemma.charAt(0).toUpperCase() + lemma.slice(1) : lemma)

// ── Argumente ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const arg = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3))
const jeder = Number(arg('jeder')[0] ?? 9)
const VERB_SUBJ = arg('verb')[0] === 'subj'
const outMd = arg('out')[0] ?? 'planning/Kollokationen-Ranking-Vergleich.md'

function ladeKalender() {
  const dir = 'planning'
  return readdirSync(dir)
    .filter((f) => /^lemma-import-.*\.json$/.test(f))
    .sort()
    .flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .sort((a, b) => a.datum.localeCompare(b.datum))
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
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ? AND logDice >= ?`)
const stmtGegen = db.prepare(`
  SELECT dep_lemma, frequency AS f FROM collocations
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ?`)
const stmtKorpus = db.prepare('SELECT SUM(freq) AS f FROM lemma_corpus_freq WHERE lemma = ?')

const korpusCache = new Map()
function korpusFreq(lemma) {
  const key = lemma.toLowerCase()
  if (!korpusCache.has(key)) korpusCache.set(key, stmtKorpus.get(key)?.f ?? 0)
  return korpusCache.get(key)
}

const gegenCache = new Map()
function anteil(basisLow, kand) {
  const rel = GEGEN[kand.relation]
  if (!rel) return null
  const key = `${kand.dep_lemma}|${kand.dep_pos}|${rel}`
  let g = gegenCache.get(key)
  if (!g) {
    const rows = stmtGegen.all(kand.dep_lemma, kand.dep_pos, rel, MIN_FREQ)
    g = { summe: rows.reduce((s, r) => s + r.f, 0), map: new Map(rows.map((r) => [r.dep_lemma.toLowerCase(), r.f])) }
    gegenCache.set(key, g)
  }
  const f = g.map.get(basisLow)
  return f == null || !g.summe ? null : f / g.summe
}

/** Neue Rangfolge: frequency × logDice, gefiltert. Liefert die sortierte, deduplizierte Liste. */
function neueRangfolge(lemma, pos) {
  const low = lemma.toLowerCase()
  const raus = { sperrliste: 0, selten: [], schwach: [], kompositum: [] }
  const best = new Map()
  for (const [bPos, rel] of relationenFuer(pos)) {
    for (const r of stmtKand.all(low, bPos, rel, MIN_FREQ, MIN_DICE)) {
      if (!KOLLOKATOR_POS.has(r.dep_pos)) continue
      if (VERB_SUBJ && pos === 'Verb' && r.dep_pos === 'Adverb') continue
      const k = r.dep_lemma.toLowerCase()
      if (SPERRLISTE.has(k)) { raus.sperrliste++; continue }
      if (k !== low && k.includes(low)) { raus.kompositum.push(r.dep_lemma); continue }
      const s = r.f * r.d
      if (!best.has(k) || s > best.get(k).s) best.set(k, { ...r, s })
    }
  }
  const sortiert = [...best.values()].sort((a, b) => b.s - a.s)
  const liste = []
  for (const r of sortiert) {
    if (liste.length >= 25) break
    if (korpusFreq(r.dep_lemma) < MIN_KORPUS) { raus.selten.push(r.dep_lemma); continue }
    const a = anteil(low, r)
    if (a != null && a < MIN_ANTEIL) { raus.schwach.push(r.dep_lemma); continue }
    liste.push({ wort: anzeige(r.dep_lemma, r.dep_pos), f: r.f, d: r.d, rel: r.relation, anteil: a })
  }
  return { liste, raus }
}

// ── Lauf ─────────────────────────────────────────────────────────────────────
const t0 = Date.now()
const ergebnisse = []
for (const z of ziele) {
  const alt = await fetchKollokatorenAnalyse(z.lemma, z.pos)
  // Frequenz der alten Top 3 nachschlagen (die Analyse liefert nur logDice)
  const altTop = alt.gesucht.map((g) => {
    const row = relationenFuer(z.pos)
      .flatMap(([bPos, rel]) => stmtKand.all(z.lemma.toLowerCase(), bPos, rel, 1, 0))
      .filter((r) => r.dep_lemma.toLowerCase() === g.wort.toLowerCase())
      .sort((a, b) => b.d - a.d)[0]
    return { wort: g.wort, d: g.logDice, f: row?.f ?? null, korpus: korpusFreq(g.wort) }
  })
  const neu = neueRangfolge(z.lemma, z.pos)
  const altSet = new Set(altTop.map((x) => x.wort.toLowerCase()))
  const gleich = neu.liste.slice(0, 3).filter((x) => altSet.has(x.wort.toLowerCase())).length
  ergebnisse.push({ ...z, altPool: alt.pool, altTop, neu: neu.liste, raus: neu.raus, gleich })
}
const dauer = ((Date.now() - t0) / 1000).toFixed(1)

// ── Bericht ──────────────────────────────────────────────────────────────────
const zahl = (n) => (n == null ? '–' : n.toLocaleString('de-DE'))
const pct = (a) => (a == null ? '–' : `${(a * 100).toFixed(1).replace('.', ',')} %`)
const tauglich = ergebnisse.filter((e) => e.neu.length >= MIN_KOLLOKATOREN)
const voll = ergebnisse.filter((e) => e.neu.length >= 25)
const altSelten = ergebnisse.flatMap((e) => e.altTop).filter((x) => x.korpus < MIN_KORPUS).length

const zeilen = []
zeilen.push('---', `erstellt: ${new Date().toISOString().slice(0, 10)}`, 'skript: scripts/kollokationen-ranking-vergleich.mjs', '---', '')
zeilen.push('# Kollokationen: Rangfolge alt vs. neu', '')
zeilen.push(`Variante A aus [[Kollokationen-Umkehr]]: Spiel bleibt, nur die Rangfolge ändert sich. ${ergebnisse.length} Lemmata, Laufzeit ${dauer} s.`, '')
zeilen.push('- **Alt:** Top 3 nach logDice, echter Spielweg (`fetchKollokatorenAnalyse`)')
if (VERB_SUBJ) zeilen.push('- **Verben (Variante):** Objekt, Subjekt und Reihung statt Objekt, Reihung, Adverb; keine Adverbien')
zeilen.push(`- **Neu:** frequency × logDice über dieselben Relationen, logDice ≥ ${MIN_DICE}, Kollokator ≥ ${zahl(MIN_KORPUS)} Korpusvorkommen, Anteil der Basis in der Gegenrichtung ≥ ${pct(MIN_ANTEIL)}, Sperrliste, keine Komposita mit der Basis`, '')
zeilen.push('## Überblick', '')
zeilen.push(`- Neue Liste mit ≥ ${MIN_KOLLOKATOREN} Kollokatoren (spielbar): ${tauglich.length} von ${ergebnisse.length}`)
zeilen.push(`- Neue Liste mit vollen 25 Plätzen (alle Ablenker-Pools gefüllt): ${voll.length} von ${ergebnisse.length}`)
zeilen.push(`- Alte Top 3 unter ${zahl(MIN_KORPUS)} Korpusvorkommen: ${altSelten} von ${ergebnisse.length * 3}`)
const verteilung = [0, 1, 2, 3].map((n) => ergebnisse.filter((e) => e.gleich === n).length)
zeilen.push(`- Überschneidung alte/neue Top 3: 0 gleich ${verteilung[0]}×, 1 gleich ${verteilung[1]}×, 2 gleich ${verteilung[2]}×, 3 gleich ${verteilung[3]}×`, '')

zeilen.push('## Je Lemma', '')
zeilen.push('| Datum | Lemma | Alt: Top 3 (logDice · Frequenz) | Neu: Top 3 (Frequenz · logDice) | Neu: Platz 4–8 | Pool neu |')
zeilen.push('|---|---|---|---|---|---|')
for (const e of ergebnisse) {
  const alt = e.altTop.map((x) => `${x.wort} (${x.d.toFixed(1).replace('.', ',')} · ${zahl(x.f)})`).join(', ')
  const neu = e.neu.slice(0, 3).map((x) => `${x.wort} (${zahl(x.f)} · ${x.d.toFixed(1).replace('.', ',')})`).join(', ')
  const mitte = e.neu.slice(3, 8).map((x) => x.wort).join(', ')
  zeilen.push(`| ${e.datum} | **${e.lemma}** (${e.pos.slice(0, 1)}) | ${alt} | ${neu} | ${mitte} | ${e.neu.length} |`)
}
zeilen.push('', '## Herausgefiltert (Auswahl)', '')
for (const e of ergebnisse) {
  const teile = []
  if (e.raus.selten.length) teile.push(`selten: ${e.raus.selten.slice(0, 5).join(', ')}`)
  if (e.raus.schwach.length) teile.push(`passt zu allem: ${e.raus.schwach.slice(0, 5).join(', ')}`)
  if (e.raus.kompositum.length) teile.push(`Kompositum: ${e.raus.kompositum.slice(0, 3).join(', ')}`)
  if (teile.length) zeilen.push(`- **${e.lemma}**: ${teile.join(' · ')}`)
}
writeFileSync(outMd, zeilen.join('\n') + '\n')
writeFileSync(outMd.replace(/\.md$/, '.json'), JSON.stringify(ergebnisse, null, 1))
process.stdout.write(`${ergebnisse.length} Lemmata, ${dauer} s → ${outMd}\n`)
db.close()
process.exit(0)
