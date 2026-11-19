// kollokatoren-datenfehler.mjs – sucht Datenfehler in den Kollokator-Listen, die das
// Spiel „Kollokationen“ mit der neuen Rangfolge zeigen würde (Variante D aus dem
// Blindvergleich: frequency × logDice + Filter + modern, Verben mit Subjekt statt
// Adverb; planning/Kollokationen-Umkehr.md). Geprüft werden die Plätze 1–25, weil
// das Spiel auch die Ablenker aus Platz 4–25 zeigt. Ändert nichts an der App.
//
// Fehlerarten (Heuristiken, jeder Fund muss gesichtet werden):
//   partizip    – Partizip und Verb in derselben Liste (gebaut + bauen, abgegeben + abgeben)
//   plural      – Substantiv, dessen Singular als eigenes Lemma deutlich häufiger ist (Wasserräder → Wasserrad)
//   historisch  – 8–15 % aus modernen Quellen (Grauzone über dem Filter „modern“)
//   eine_quelle – ≥ 60 % des Vorkommens aus einer einzigen Fachquelle (Patentgericht, Dingler …)
//   ortsadjektiv– kleingeschriebenes Adjektiv auf -er/-isch aus einem Namen (bromberger, catilinarisch)
//   schreibung  – Bindestrich mit Kleinschreibung danach (Ip-adresse), Ziffern, Großbuchstaben im Wortinnern
//
// Aufruf:
//   node scripts/kollokatoren-datenfehler.mjs
//   node scripts/kollokatoren-datenfehler.mjs --out=planning/Kollokatoren-Datenfehler.md

import '../server/env.js'
import Database from 'better-sqlite3'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { POS_ROUNDS } from '../server/wortprofil.js'
import { korrigiere, schreibweise, istFachsprache, fuehreZusammen } from '../server/kollokatorKorrektur.js'

const MIN_FREQ = 5
const MIN_DICE = 3
const MIN_KORPUS = 1000
const MIN_ANTEIL = 0.003
const MIN_MODERN = 0.08
const PLAETZE = 25
const HISTORISCH = /^(dta|gei_digital|dibilit|dibiphil|reichtagsprotokolle|humboldt|jean-paul|neuer_pitaval|ref_|bgh_strafsachen_hist)/
const BREITE_QUELLEN = new Set(['deu_news', 'deu_newscrawl', 'wikipedia', 'gei_digital', 'dta_erweiterungen', 'dta_kern', 'bundestagskorpus_pdf', 'reichtagsprotokolle', 'dibilit'])
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
const anzeige = (w, pos) => (pos === 'Substantiv' ? w.charAt(0).toUpperCase() + w.slice(1) : w)

const args = process.argv.slice(2)
// --ohne-korrektur: Stand vor server/kollokatorKorrektur.js (zum Vergleich)
const KORREKTUR = !args.includes('--ohne-korrektur')
const gezaehlt = { fachsprache: 0, gesperrt: 0, ersetzt: 0, zusammengefuehrt: 0 }
const outMd = args.find((a) => a.startsWith('--out='))?.slice(6)
  ?? (KORREKTUR ? 'planning/Kollokatoren-Datenfehler.md' : 'planning/Kollokatoren-Datenfehler-vorher.md')
const ziele = readdirSync('planning')
  .filter((f) => /^lemma-import-.*\.json$/.test(f))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join('planning', f), 'utf8')))
  .sort((a, b) => a.datum.localeCompare(b.datum))
  .flatMap((t) => t.woerter.map((w, i) => ({ datum: t.datum, lemma: w, pos: t.positionen?.[i] ?? 'Substantiv' })))

const db = new Database(process.env.WORTPROFIL_DB, { readonly: true, fileMustExist: true })
db.pragma('cache_size = -262144')
const stmtKand = db.prepare(`
  SELECT dep_lemma, dep_pos, relation, frequency AS f, logDice AS d FROM collocations
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ? AND logDice >= ?`)
const stmtGegen = db.prepare(`
  SELECT dep_lemma, frequency AS f FROM collocations
  WHERE lemma = ? AND pos = ? AND relation = ? AND frequency >= ?`)
const stmtQuellen = db.prepare('SELECT quelle, SUM(freq) AS f FROM lemma_corpus_freq WHERE lemma = ? GROUP BY quelle')

const quellenCache = new Map()
function quellen(w) {
  const k = w.toLowerCase()
  if (!quellenCache.has(k)) {
    const rows = stmtQuellen.all(k)
    const summe = rows.reduce((s, r) => s + r.f, 0)
    const modern = summe ? rows.filter((r) => !HISTORISCH.test(r.quelle)).reduce((s, r) => s + r.f, 0) / summe : 0
    const top = rows.sort((a, b) => b.f - a.f)[0]
    quellenCache.set(k, { summe, modern, topQuelle: top?.quelle ?? null, topAnteil: summe && top ? top.f / summe : 0 })
  }
  return quellenCache.get(k)
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

const stmtPosFreq = db.prepare('SELECT SUM(freq) AS f FROM lemma_corpus_freq WHERE lemma = ? AND pos = ?')
const posFreq = (w, p) => stmtPosFreq.get(w.toLowerCase(), p)?.f ?? 0
/**
 * Ortsadjektiv: Der Name ohne „-er“ ist ein bekanntes Substantiv (weimarer ← Weimar 23.057)
 * oder häufiger als das Adjektiv selbst (berliner ← Berlin). Echte Adjektive auf -er
 * (sauer ← Sau, inner ← Inn) schützt die Liste in server/kollokatorKorrektur.js.
 */
const istOrtsadjektiv = (w) => {
  const name = posFreq(w.slice(0, -2), 'Substantiv')
  return name >= 1000 || name > posFreq(w, 'Adjektiv')
}

/**
 * Neue Rangfolge D: frequency × logDice, gefiltert, Plätze 1–25. Mit `korrektur`
 * laufen die Kandidaten durch server/kollokatorKorrektur.js (Lemma-Korrektur,
 * Sperren, Fachsprache, Partizip ins Verb, Schreibweise).
 */
function liste(lemma, pos) {
  const low = lemma.toLowerCase()
  const roh = []
  for (const [bPos, rel] of relationenFuer(pos)) {
    for (const r of stmtKand.all(low, bPos, rel, MIN_FREQ, MIN_DICE)) {
      if (!KOLLOKATOR_POS.has(r.dep_pos)) continue
      if (pos === 'Verb' && r.dep_pos === 'Adverb') continue
      const k = r.dep_lemma.toLowerCase()
      if (SPERRLISTE.has(k) || (k !== low && k.includes(low))) continue
      if (KORREKTUR) {
        const q = quellen(r.dep_lemma)
        if (istFachsprache(q)) { gezaehlt.fachsprache++; continue }
        const kor = korrigiere(lemma, r.dep_lemma, r.dep_pos)
        if (!kor) { gezaehlt.gesperrt++; continue }
        if (kor.lemma.toLowerCase() !== k) gezaehlt.ersetzt++
        roh.push({ ...r, dep_lemma_db: r.dep_lemma, dep_lemma: kor.lemma, lemma: kor.lemma, pos: r.dep_pos })
      } else roh.push({ ...r, dep_lemma_db: r.dep_lemma, lemma: r.dep_lemma, pos: r.dep_pos })
    }
  }
  // Zusammenführen: korrigierte Dubletten addieren, Partizipien ins Verb (nur mit Korrektur)
  let pool
  if (KORREKTUR) {
    // nur Zusammenführungen durch Korrektur/Partizip zählen, nicht die übliche Dedupe über Relationen
    const vorher = new Set(roh.map((r) => r.dep_lemma_db.toLowerCase())).size
    pool = fuehreZusammen(roh.map((r) => ({ ...r, lemma: r.dep_lemma }))).map((e) => ({ ...e, dep_lemma: e.lemma, dep_pos: e.pos }))
    gezaehlt.zusammengefuehrt += vorher - pool.length
  } else {
    const best = new Map()
    for (const r of roh) {
      const k = r.dep_lemma.toLowerCase()
      if (!best.has(k) || r.f * r.d > best.get(k).f * best.get(k).d) best.set(k, r)
    }
    pool = [...best.values()]
  }
  const out = []
  for (const r of pool.map((x) => ({ ...x, s: x.f * x.d })).sort((a, b) => b.s - a.s)) {
    if (out.length >= PLAETZE) break
    // Bekanntheit und Quellen am DB-Lemma messen, das korrigierte Lemma steht so evtl. nicht in der DB
    const q = quellen(r.dep_lemma_db ?? r.dep_lemma)
    if (q.summe < MIN_KORPUS || q.modern < MIN_MODERN) continue
    const a = anteil(low, { ...r, dep_lemma: r.dep_lemma_db ?? r.dep_lemma })
    if (a != null && a < MIN_ANTEIL) continue
    const wort = KORREKTUR ? schreibweise(r.dep_lemma, r.dep_pos, { istOrtsadjektiv }) : anzeige(r.dep_lemma, r.dep_pos)
    out.push({ ...r, wort, platz: out.length + 1, q })
  }
  return out
}

// ── Heuristiken ──────────────────────────────────────────────────────────────
const TRENNBAR = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'fort', 'her', 'hin', 'los', 'mit', 'nach', 'nieder', 'vor', 'weg', 'zu', 'zurück', 'zusammen', 'dar', 'durch', 'um', 'über', 'unter', 'wieder']
/** Mögliche Partizip-II-Formen eines Verbs (grob, schwache und starke Bildung). */
function partizipFormen(verb) {
  const v = verb.toLowerCase()
  const stamm = v.replace(/e?n$/, '')
  const formen = new Set([`ge${stamm}t`, `${stamm}t`, `ge${v}`, v, `${stamm}et`, `ge${stamm}et`])
  for (const p of TRENNBAR) {
    if (v.startsWith(p) && v.length > p.length + 3) {
      const rest = v.slice(p.length)
      const rs = rest.replace(/e?n$/, '')
      for (const f of [`${p}ge${rs}t`, `${p}ge${rest}`, `${p}ge${rs}et`, `${p}${rs}t`]) formen.add(f)
    }
  }
  return formen
}
const stmtLemma = db.prepare('SELECT SUM(freq) AS f FROM lemma_corpus_freq WHERE lemma = ?')
const lemmaFreq = (w) => stmtLemma.get(w.toLowerCase())?.f ?? 0
const UMLAUT_ZURUECK = { ä: 'a', ö: 'o', ü: 'u', äu: 'au' }
/** Singular-Kandidaten eines möglichen Plurals: Räder → Rad, Oden → Ode, Seminarräume → Seminarraum. */
function singularKandidaten(w) {
  const low = w.toLowerCase()
  const k = new Set()
  for (const end of ['en', 'n', 'e', 'er', 's']) if (low.endsWith(end) && low.length > end.length + 2) k.add(low.slice(0, -end.length))
  for (const s of [...k]) {
    const i = Math.max(s.lastIndexOf('äu'), s.lastIndexOf('ä'), s.lastIndexOf('ö'), s.lastIndexOf('ü'))
    if (i >= 0) {
      const lang = s.slice(i, i + 2) === 'äu' ? 2 : 1
      k.add(s.slice(0, i) + UMLAUT_ZURUECK[s.slice(i, i + lang)] + s.slice(i + lang))
    }
  }
  k.delete(low)
  return [...k]
}

const funde = { partizip: [], plural: [], historisch: [], eine_quelle: [], ortsadjektiv: [], schreibung: [] }
const t0 = Date.now()
const listen = []
for (const z of ziele) {
  const l = liste(z.lemma, z.pos)
  listen.push({ ...z, l })
  const verben = l.filter((x) => x.dep_pos === 'Verb').map((x) => ({ x, formen: partizipFormen(x.dep_lemma) }))
  const basisFormen = z.pos === 'Verb' ? partizipFormen(z.lemma) : new Set()
  for (const x of l) {
    const low = x.dep_lemma.toLowerCase()
    const ort = { lemma: z.lemma, pos: z.pos, wort: x.wort, platz: x.platz }
    if (x.dep_pos !== 'Substantiv') {
      const verb = verben.find((v) => v.x !== x && v.formen.has(low))
      if (verb) funde.partizip.push({ ...ort, info: `neben ${verb.x.dep_lemma} (Platz ${verb.x.platz})` })
      else if (basisFormen.has(low)) funde.partizip.push({ ...ort, info: `Partizip der Basis` })
    }
    if (x.dep_pos === 'Substantiv') {
      const eigen = x.q.summe
      const sing = singularKandidaten(x.dep_lemma).map((s) => ({ s, f: lemmaFreq(s) })).sort((a, b) => b.f - a.f)[0]
      if (sing && sing.f > eigen * 2 && sing.f > 2000) funde.plural.push({ ...ort, info: `${anzeige(sing.s, 'Substantiv')} ${sing.f.toLocaleString('de-DE')} vs. ${eigen.toLocaleString('de-DE')}` })
    }
    if (x.q.modern < 0.15) funde.historisch.push({ ...ort, info: `${Math.round(x.q.modern * 100)} % modern` })
    if (x.q.topAnteil >= 0.6 && !BREITE_QUELLEN.has(x.q.topQuelle)) funde.eine_quelle.push({ ...ort, info: `${Math.round(x.q.topAnteil * 100)} % ${x.q.topQuelle}` })
    // Geprüft wird die Anzeige-Schreibweise: Was die Korrektur schon großschreibt, ist erledigt
    if (x.dep_pos === 'Adjektiv' && /^[a-zäöü]/.test(x.wort) && /(er|isch)$/.test(low) && lemmaFreq(low.replace(/(er|isch)$/, '')) > 0) {
      // nur Kandidaten, deren Stamm als Name/Substantiv existiert (Bromberg-er, Catilina-risch → grob)
      if (/er$/.test(low) && !/(ier|eur|euer|iger|ener)$/.test(low)) funde.ortsadjektiv.push({ ...ort, info: '' })
    }
    // Geprüft wird die Anzeige: Bindestrich mit Kleinschreibung bei Substantiven, Ziffern
    if ((x.dep_pos === 'Substantiv' && /-[a-zäöü]/.test(x.wort)) || /\d/.test(x.wort)) funde.schreibung.push({ ...ort, info: x.wort })
  }
}
const dauer = ((Date.now() - t0) / 1000).toFixed(1)

// ── Bericht ──────────────────────────────────────────────────────────────────
const TITEL = {
  partizip: 'Partizip neben dem Verb (doppelt in einer Liste)',
  plural: 'Plural als Lemma (Singular deutlich häufiger)',
  historisch: 'Grauzone historisch (8–15 % moderne Quellen)',
  eine_quelle: 'Überwiegend aus einer Fachquelle',
  ortsadjektiv: 'Adjektiv auf -er (oft aus Orts- oder Personennamen)',
  schreibung: 'Auffällige Schreibung',
}
const z = []
z.push('---', `erstellt: ${new Date().toISOString().slice(0, 10)}`, 'skript: scripts/kollokatoren-datenfehler.mjs', '---', '')
z.push('# Kollokatoren: Datenfehler in der neuen Rangfolge', '')
z.push(`Alle ${listen.length} geplanten Lemmata, Plätze 1–${PLAETZE} der Rangfolge D (frequency × logDice + Filter + modern), ${dauer} s. Heuristische Funde, jeder muss gesichtet werden. Gehört zu [[Kollokationen-Umkehr]].`, '')
z.push(KORREKTUR
  ? `**Mit Korrekturschicht** (\`server/kollokatorKorrektur.js\`): ${gezaehlt.fachsprache} Kandidatenzeilen als Fachsprache entfernt, ${gezaehlt.gesperrt} gesperrt, ${gezaehlt.ersetzt} auf ein anderes Lemma korrigiert, ${gezaehlt.zusammengefuehrt} Einträge zusammengeführt (Dubletten, Partizip ins Verb). Vergleich ohne Korrektur: [[Kollokatoren-Datenfehler-vorher]].`
  : '**Ohne Korrekturschicht** (Stand vor `server/kollokatorKorrektur.js`).', '')
z.push('| Fehlerart | Funde | davon in den Top 3 | verschiedene Wörter |', '|---|---|---|---|')
for (const [k, v] of Object.entries(funde)) z.push(`| ${TITEL[k]} | ${v.length} | ${v.filter((x) => x.platz <= 3).length} | ${new Set(v.map((x) => x.wort.toLowerCase())).size} |`)
for (const [k, v] of Object.entries(funde)) {
  z.push('', `## ${TITEL[k]}`, '')
  const jeWort = new Map()
  for (const f of v) {
    const key = f.wort.toLowerCase()
    if (!jeWort.has(key)) jeWort.set(key, { wort: f.wort, info: f.info, orte: [] })
    jeWort.get(key).orte.push(`${f.lemma} ${f.platz}`)
  }
  for (const w of [...jeWort.values()].sort((a, b) => b.orte.length - a.orte.length || a.wort.localeCompare(b.wort))) {
    z.push(`- **${w.wort}**${w.info ? ` (${w.info})` : ''}: ${w.orte.join(', ')}`)
  }
}
writeFileSync(outMd, z.join('\n') + '\n')
writeFileSync(outMd.replace(/\.md$/, '.json'), JSON.stringify(listen.map((x) => ({ datum: x.datum, lemma: x.lemma, pos: x.pos, liste: x.l.map((y) => ({ w: y.wort, pos: y.dep_pos, rel: y.relation, f: y.f, d: y.d })) })), null, 1))
process.stdout.write(`${listen.length} Lemmata, ${dauer} s → ${outMd}\n`)
db.close()
process.exit(0)
