// kollokationen-sortier-varianten.mjs – vergleicht mehrere Sortierungen der
// Kollokatoren für die Top 3 des Spiels „Kollokationen“ (Variante A in
// planning/Kollokationen-Umkehr.md). Ändert nichts an der App.
//
// Gleicher Kandidatenpool für alle Varianten: Relationen wie im Spiel, Verben mit
// Subjekt statt Adverb, frequency ≥ 5, Inhaltswörter, keine Komposita mit der Basis.
// Jede Sortierung läuft einmal roh und einmal mit Filtern (Sperrliste,
// Kollokator ≥ 1.000 Korpusvorkommen, Anteil der Basis in der Gegenrichtung ≥ 0,3 %).
//
// Aufruf:
//   node scripts/kollokationen-sortier-varianten.mjs             # alle geplanten Lemmata
//   node scripts/kollokationen-sortier-varianten.mjs --jeder=9
//   node scripts/kollokationen-sortier-varianten.mjs --out=planning/Kollokationen-Sortierungen.md

import '../server/env.js'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { POS_ROUNDS, fetchKollokatorenAnalyse } from '../server/wortprofil.js'

const MIN_FREQ = 5
const MIN_KORPUS = 1000
const MIN_ANTEIL = 0.003
// Historische Quellen (DTA, historische Schulbücher gei_digital, Reichstag, Literatur):
// zusammen 37 % des Korpus. Liegt der Anteil moderner Quellen an einem Kollokator
// unter MIN_MODERN, ist er veraltet oder ein Schreibvariantenrest (isolirt 0 %,
// Weib 2 %, Reineke 7 %, Jüngling 5 %); normale Wörter liegen darüber
// (unermesslich 9 %, demütig 12 %, Gott 14 %, still 17 %).
const HISTORISCH = /^(dta|gei_digital|dibilit|dibiphil|reichtagsprotokolle|humboldt|jean-paul|neuer_pitaval|ref_|bgh_strafsachen_hist)/
const MIN_MODERN = 0.08
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
])
const GEGEN = {
  KON: 'KON', ATTR: '~ATTR', '~ATTR': 'ATTR', OBJA: '~OBJA', '~OBJA': 'OBJA',
  ADV: '~ADV', '~ADV': 'ADV', '~PRED': 'PRED', PRED: '~PRED', SUBJA: '~SUBJA', '~SUBJA': 'SUBJA',
}
const REL_ALIAS = { OBJ: 'OBJA', '~OBJ': '~OBJA' }

function relationenFuer(pos) {
  if (pos === 'Verb') return [['Verb', 'OBJA'], ['Verb', 'SUBJA'], ['Verb', 'KON']]
  return (POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv).flatMap(({ relCode }) => {
    const rel = REL_ALIAS[relCode] ?? relCode
    if (rel === 'PRED_REV') return [['Adjektiv', '~ADV'], ['Adverb', '~ADV'], ['Adjektiv', '~PRED']]
    return [[pos, rel]]
  })
}

// ── Sortierungen ─────────────────────────────────────────────────────────────
// r: { f, d, ant } – Paarfrequenz, logDice, Anteil der Basis in der Gegenrichtung
const SORTIERUNGEN = {
  logDice: { text: 'logDice (wie heute, aber gleicher Pool)', s: (r) => r.d },
  frequenz: { text: 'reine Paarfrequenz', s: (r) => r.f },
  'f×logDice': { text: 'frequency × logDice', s: (r) => r.f * r.d },
  'log f×logDice': { text: 'log2(frequency) × logDice (gedämpfte Frequenz)', s: (r) => Math.log2(r.f) * r.d },
  '√f×logDice': { text: '√frequency × logDice', s: (r) => Math.sqrt(r.f) * r.d },
  'logDice ab f≥50': { text: 'logDice, nur Paare mit frequency ≥ 50', s: (r) => (r.f >= 50 ? r.d : -1) },
  'f×Anteil': { text: 'frequency × √Anteil der Basis in der Gegenrichtung (beidseitig typisch)', s: (r) => (r.ant == null ? 0 : r.f * Math.sqrt(r.ant)) },
}

// ── Argumente, Kalender ──────────────────────────────────────────────────────
const args = process.argv.slice(2)
const arg = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3))
const jeder = Number(arg('jeder')[0] ?? 1)
const outMd = arg('out')[0] ?? 'planning/Kollokationen-Sortierungen.md'
const ziele = readdirSync('planning')
  .filter((f) => /^lemma-import-.*\.json$/.test(f))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join('planning', f), 'utf8')))
  .sort((a, b) => a.datum.localeCompare(b.datum))
  .filter((_, i) => i % jeder === 0)
  .flatMap((t) => t.woerter.map((w, i) => ({ datum: t.datum, lemma: w, pos: t.positionen?.[i] ?? 'Substantiv' })))

// ── DB ───────────────────────────────────────────────────────────────────────
const db = new Database(process.env.WORTPROFIL_DB, { readonly: true, fileMustExist: true })
db.pragma('cache_size = -262144')
const stmtKand = db.prepare(`
  SELECT dep_lemma, dep_pos, relation, frequency AS f, logDice AS d FROM collocations
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ?`)
const stmtGegen = db.prepare(`
  SELECT dep_lemma, frequency AS f FROM collocations
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ?`)
const stmtKorpus = db.prepare('SELECT SUM(freq) AS f FROM lemma_corpus_freq WHERE lemma = ?')
const stmtQuellen = db.prepare('SELECT quelle, SUM(freq) AS f FROM lemma_corpus_freq WHERE lemma = ? GROUP BY quelle')
const modernCache = new Map()
const modernAnteil = (w) => {
  const k = w.toLowerCase()
  if (!modernCache.has(k)) {
    const rows = stmtQuellen.all(k)
    const alle = rows.reduce((s, r) => s + r.f, 0)
    modernCache.set(k, alle ? rows.filter((r) => !HISTORISCH.test(r.quelle)).reduce((s, r) => s + r.f, 0) / alle : 0)
  }
  return modernCache.get(k)
}

const korpusCache = new Map()
const korpusFreq = (w) => {
  const k = w.toLowerCase()
  if (!korpusCache.has(k)) korpusCache.set(k, stmtKorpus.get(k)?.f ?? 0)
  return korpusCache.get(k)
}
const gegenCache = new Map()
function anteil(basisLow, r) {
  const rel = GEGEN[r.relation]
  if (!rel) return null
  const key = `${r.dep_lemma}|${r.dep_pos}|${rel}`
  let g = gegenCache.get(key)
  if (!g) {
    const rows = stmtGegen.all(r.dep_lemma, r.dep_pos, rel, MIN_FREQ)
    g = { summe: rows.reduce((s, x) => s + x.f, 0), map: new Map(rows.map((x) => [x.dep_lemma.toLowerCase(), x.f])) }
    gegenCache.set(key, g)
  }
  const f = g.map.get(basisLow)
  return f == null || !g.summe ? null : f / g.summe
}

const anzeige = (w, pos) => (pos === 'Substantiv' ? w.charAt(0).toUpperCase() + w.slice(1) : w)

/** Kandidatenpool je Lemma: dedupliziert je Kollokator (Zeile mit der höchsten Frequenz). */
function pool(lemma, pos) {
  const low = lemma.toLowerCase()
  const best = new Map()
  for (const [bPos, rel] of relationenFuer(pos)) {
    for (const r of stmtKand.all(low, bPos, rel, MIN_FREQ)) {
      if (!KOLLOKATOR_POS.has(r.dep_pos)) continue
      if (pos === 'Verb' && r.dep_pos === 'Adverb') continue
      const k = r.dep_lemma.toLowerCase()
      if (k !== low && k.includes(low)) continue
      if (!best.has(k) || r.f > best.get(k).f) best.set(k, r)
    }
  }
  return [...best.values()]
}

/** Top 3 einer Sortierung; mit Filtern werden Kandidaten übersprungen. Anteil wird erst bei Bedarf berechnet. */
function top3(low, kand, sortierung, gefiltert, modern = false) {
  const braucht = sortierung === 'f×Anteil'
  const liste = braucht ? kand.slice().sort((a, b) => b.f - a.f).slice(0, 150) : kand
  for (const r of liste) if (braucht && r.ant === undefined) r.ant = anteil(low, r)
  const sortiert = liste.map((r) => ({ r, s: SORTIERUNGEN[sortierung].s(r) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)
  const out = []
  for (const { r } of sortiert) {
    if (out.length === 3) break
    if (gefiltert) {
      if (SPERRLISTE.has(r.dep_lemma.toLowerCase())) continue
      if (korpusFreq(r.dep_lemma) < MIN_KORPUS) continue
      if (r.ant === undefined) r.ant = anteil(low, r)
      if (r.ant != null && r.ant < MIN_ANTEIL) continue
      if (modern && modernAnteil(r.dep_lemma) < MIN_MODERN) continue
    }
    out.push(r)
  }
  return out
}

// ── Lauf ─────────────────────────────────────────────────────────────────────
const t0 = Date.now()
const MIT_MODERN = new Set(['logDice', 'frequenz', 'f×logDice', 'log f×logDice', '√f×logDice'])
const varianten = [['alt (Spiel heute)', null], ...Object.keys(SORTIERUNGEN).flatMap((k) => [
  [k, false], [`${k} + Filter`, true], ...(MIT_MODERN.has(k) ? [[`${k} + Filter + modern`, true, true]] : []),
])]
const proLemma = []
for (const z of ziele) {
  const low = z.lemma.toLowerCase()
  const kand = pool(z.lemma, z.pos)
  const reihe = { ...z, top: {} }
  const alt = await fetchKollokatorenAnalyse(z.lemma, z.pos)
  reihe.top['alt (Spiel heute)'] = alt.gesucht.map((g) => {
    const r = kand.find((k) => k.dep_lemma.toLowerCase() === g.wort.toLowerCase())
    if (r && r.ant === undefined) r.ant = anteil(low, r)
    return { w: g.wort, f: r?.f ?? null, d: g.logDice, ant: r?.ant ?? null, sperr: SPERRLISTE.has(g.wort.toLowerCase()) }
  })
  for (const [name, gefiltert, modern] of varianten.slice(1)) {
    const key = name.replace(' + Filter', '').replace(' + modern', '')
    reihe.top[name] = top3(low, kand, key, gefiltert, modern).map((r) => {
      if (r.ant === undefined) r.ant = anteil(low, r)
      return { w: anzeige(r.dep_lemma, r.dep_pos), f: r.f, d: r.d, ant: r.ant, sperr: SPERRLISTE.has(r.dep_lemma.toLowerCase()) }
    })
  }
  proLemma.push(reihe)
}
const dauer = ((Date.now() - t0) / 1000).toFixed(1)

// ── Kennzahlen ───────────────────────────────────────────────────────────────
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const zahl = (n) => (n == null ? '–' : Math.round(n).toLocaleString('de-DE'))
const pct = (n, von) => `${((100 * n) / von).toFixed(0)} %`
const kennzahlen = varianten.map(([name]) => {
  const alle = proLemma.flatMap((p) => p.top[name])
  const n = alle.length
  return {
    name,
    selten1k: pct(alle.filter((x) => korpusFreq(x.w) < 1000).length, n),
    selten10k: pct(alle.filter((x) => korpusFreq(x.w) < 10000).length, n),
    historisch: pct(alle.filter((x) => modernAnteil(x.w) < MIN_MODERN).length, n),
    leer: proLemma.filter((p) => p.top[name].length < 3).length,
    allerwelt: pct(alle.filter((x) => x.sperr || (x.ant != null && x.ant < MIN_ANTEIL)).length, n),
    medKorpus: zahl(median(alle.map((x) => korpusFreq(x.w)))),
    medPaar: zahl(median(alle.map((x) => x.f))),
    medAnteil: (() => { const m = median(alle.map((x) => x.ant)); return m == null ? '–' : `${(m * 100).toFixed(1).replace('.', ',')} %` })(),
    gleichAlt: pct(proLemma.reduce((s, p) => s + p.top[name].filter((x) => p.top['alt (Spiel heute)'].some((a) => a.w.toLowerCase() === x.w.toLowerCase())).length, 0), n),
  }
})

const z = []
z.push('---', `erstellt: ${new Date().toISOString().slice(0, 10)}`, 'skript: scripts/kollokationen-sortier-varianten.mjs', '---', '')
z.push('# Kollokationen: Sortierungen im Vergleich', '')
z.push(`${proLemma.length} geplante Lemmata, je Variante die Top 3. Laufzeit ${dauer} s. Gehört zu [[Kollokationen-Umkehr]] › „Variante A“.`, '')
z.push('Gleicher Pool für alle Varianten (Relationen wie im Spiel, Verben mit Subjekt statt Adverb, frequency ≥ 5, Inhaltswörter, keine Komposita mit der Basis). „+ Filter“ = Sperrliste, Kollokator ≥ 1.000 Korpusvorkommen, Anteil der Basis in der Gegenrichtung ≥ 0,3 %.', '')
z.push('## Kennzahlen der Top 3', '')
z.push('- **selten**: Kollokator kommt im ganzen Korpus seltener als 1.000 bzw. 10.000-mal vor')
z.push('- **Allerweltswort**: auf der Sperrliste oder die Basis macht unter 0,3 % seiner Partner aus (groß, neu, machen)')
z.push(`- **historisch**: Kollokator stammt zu über ${100 - MIN_MODERN * 100} % aus historischen Quellen (DTA, historische Schulbücher, Reichstag, Literatur): Weib, Reineke, isolirt`)
z.push('- **„+ modern“** filtert zusätzlich diese historischen Kollokatoren heraus')
z.push('- **Anteil Gegenrichtung**: wie stark der Kollokator auf die Basis zeigt (Tee → Kaffee 33 %)', '')
z.push('| Variante | selten < 1.000 | selten < 10.000 | historisch | Allerweltswort | Median Korpus | Median Paarfrequenz | Median Anteil Gegenrichtung | gleich wie alt | < 3 Treffer |')
z.push('|---|---|---|---|---|---|---|---|---|---|')
for (const k of kennzahlen) z.push(`| ${k.name} | ${k.selten1k} | ${k.selten10k} | ${k.historisch} | ${k.allerwelt} | ${k.medKorpus} | ${k.medPaar} | ${k.medAnteil} | ${k.gleichAlt} | ${k.leer} |`)
z.push('', '## Sortierungen', '')
for (const [k, v] of Object.entries(SORTIERUNGEN)) z.push(`- **${k}**: ${v.text}`)
z.push('', '## Beispiele (jedes 10. Lemma)', '')
const zeig = ['alt (Spiel heute)', 'logDice + Filter + modern', 'frequenz + Filter + modern', 'f×logDice + Filter + modern', '√f×logDice + Filter + modern', 'log f×logDice + Filter + modern']
z.push(`| Lemma | ${zeig.join(' | ')} |`)
z.push(`|---|${zeig.map(() => '---').join('|')}|`)
for (const p of proLemma.filter((_, i) => i % 10 === 0)) {
  z.push(`| **${p.lemma}** (${p.pos[0]}) | ${zeig.map((v) => p.top[v].map((x) => x.w).join(', ')).join(' | ')} |`)
}
writeFileSync(outMd, z.join('\n') + '\n')
writeFileSync(outMd.replace(/\.md$/, '.json'), JSON.stringify(proLemma, null, 1))
process.stdout.write(`${proLemma.length} Lemmata, ${dauer} s → ${outMd}\n`)
db.close()
process.exit(0)
