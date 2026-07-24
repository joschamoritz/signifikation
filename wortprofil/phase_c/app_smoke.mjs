/**
 * Phase C – App-Smoke-Test gegen die Subset-DBs (planning/DB-Neuaufbau.md Phase C, Punkt 5)
 *
 * Setzt WORTPROFIL_DB + BELEGE_DB auf die Phase-C-Subset-DBs und ruft GENAU die
 * Laufzeit-Funktionen auf, die die echten App-Endpunkte / Spielmodi nutzen:
 *
 *   Modus 1 (Kollokationen-Hauptspiel): fetchRelation(lemma,pos,relCode) je POS-Runde
 *   Modus 2 (Wort-Zwilling):            fetchRelation für zwei Lemmata (wortzwilling.js)
 *   Modus 3 (Zeitenwende):              fetchZeitenwende(lemma)  → zeitreise-Tabelle
 *   Modus 4 (Eigenes Lemma / Bonus):    fetchLemma + fetchBonusQuestion
 *   Belege-Anzeige:                     fetchBelege(lemma, collocate)
 *
 * Damit ist die DB-Schema-Kompatibilität aller Live-Pfade geprüft, ohne den
 * HTTP/Auth-Stack. Der echte App-Start (npm run server) läuft separat für den
 * visuellen Sanity-Check.
 *
 * Aufruf (aus Projekt-Root):
 *   node wortprofil/phase_c/app_smoke.mjs \
 *     --wortprofil wortprofil/phase_c/db/wortprofil_subset_mc3.db \
 *     --belege wortprofil/phase_c/db/belege_subset.db
 */

import { resolve } from 'path'

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}
const WP = resolve(arg('wortprofil', 'wortprofil/phase_c/db/wortprofil_subset_mc3.db'))
const BEL = resolve(arg('belege', 'wortprofil/phase_c/db/belege_subset.db'))

// WICHTIG: Env-Vars VOR dem Import setzen (DBs werden lazy beim ersten Aufruf geladen)
process.env.WORTPROFIL_DB = WP
process.env.BELEGE_DB = BEL

console.log(`WORTPROFIL_DB = ${WP}`)
console.log(`BELEGE_DB     = ${BEL}\n`)

const wp = await import('../../server/wortprofil.js')
const bel = await import('../../server/belege.js')

const NOMEN = ['Haus', 'Wasser', 'Zeit', 'Frage', 'Recht']
const VERBEN = ['geben', 'machen', 'stellen']
const ADJ = ['groß', 'grün', 'hoch']

function fmt(list, n = 5) {
  if (!Array.isArray(list)) return String(list)
  return list.slice(0, n).map(x => x.wort ?? x.collocate ?? x.lemma ?? JSON.stringify(x)).join(', ')
}

let probleme = 0

console.log('════════ Modus 1: Kollokationen-Hauptspiel (fetchRelation je POS-Runde) ════════')
for (const lemma of NOMEN) {
  const runden = wp.POS_ROUNDS.Substantiv
  const zeilen = []
  for (const r of runden) {
    try {
      const res = await wp.fetchRelation(lemma, 'Substantiv', r.relCode)
      const items = res?.collocates ?? res?.items ?? res ?? []
      const n = Array.isArray(items) ? items.length : (items?.length ?? 0)
      zeilen.push(`${r.key}=${n}`)
    } catch (e) {
      zeilen.push(`${r.key}=ERR(${e.message})`); probleme++
    }
  }
  console.log(`  ${lemma.padEnd(10)} ${zeilen.join('  ')}`)
}

console.log('\n════════ Modus 1b: Verb- & Adjektiv-Runden ════════')
for (const lemma of VERBEN) {
  const zeilen = []
  for (const r of wp.POS_ROUNDS.Verb) {
    try {
      const res = await wp.fetchRelation(lemma, 'Verb', r.relCode)
      const items = res?.collocates ?? res?.items ?? res ?? []
      zeilen.push(`${r.key}=${Array.isArray(items) ? items.length : 0}`)
    } catch (e) { zeilen.push(`${r.key}=ERR`); probleme++ }
  }
  console.log(`  ${lemma.padEnd(10)} ${zeilen.join('  ')}`)
}
for (const lemma of ADJ) {
  const runden = wp.POS_ROUNDS.Adjektiv ?? []
  const zeilen = []
  for (const r of runden) {
    try {
      const res = await wp.fetchRelation(lemma, 'Adjektiv', r.relCode)
      const items = res?.collocates ?? res?.items ?? res ?? []
      zeilen.push(`${r.key}=${Array.isArray(items) ? items.length : 0}`)
    } catch (e) { zeilen.push(`${r.key}=ERR`); probleme++ }
  }
  console.log(`  ${lemma.padEnd(10)} ${zeilen.join('  ') || '(keine Adjektiv-Runden definiert)'}`)
}

console.log('\n════════ Modus 3: Zeitenwende (fetchZeitenwende → zeitreise) ════════')
for (const lemma of ['Krieg', 'Reich', 'Arbeiter', 'Wasser', 'Haus']) {
  try {
    const z = await wp.fetchZeitenwende(lemma)
    const dekaden = z?.words?.length ?? z?.dekaden?.length ?? (Array.isArray(z) ? z.length : 0)
    console.log(`  ${lemma.padEnd(10)} words/dekaden=${dekaden}`)
  } catch (e) { console.log(`  ${lemma.padEnd(10)} ERR(${e.message})`); probleme++ }
}

console.log('\n════════ Modus 4: fetchLemma + fetchBonusQuestion ════════')
for (const lemma of ['Haus', 'Wasser', 'geben']) {
  try {
    const l = await wp.fetchLemma(lemma)
    const bonus = await wp.fetchBonusQuestion(lemma).catch(() => null)
    console.log(`  ${lemma.padEnd(10)} lemma=${l ? 'OK' : 'null'}  bonus=${bonus ? 'OK' : 'null'}`)
  } catch (e) { console.log(`  ${lemma.padEnd(10)} ERR(${e.message})`); probleme++ }
}

console.log('\n════════ Belege-Anzeige (fetchBelege) ════════')
console.log(`  belegeVerfuegbar() = ${bel.belegeVerfuegbar()}`)
const paare = [['Haus', 'bauen'], ['Wasser', 'trinken'], ['Frage', 'stellen'], ['Recht', 'haben'], ['Zeit', 'verlieren']]
for (const [lemma, col] of paare) {
  try {
    const b = bel.fetchBelege(lemma, col, { limit: 3 })
    const n = Array.isArray(b) ? b.length : (b?.belege?.length ?? 0)
    const bsp = (Array.isArray(b) && b[0]) ? (b[0].quelle ?? '') : ''
    console.log(`  ${(lemma + '+' + col).padEnd(20)} belege=${n}  quelle="${String(bsp).slice(0, 70)}"`)
  } catch (e) { console.log(`  ${(lemma + '+' + col).padEnd(20)} ERR(${e.message})`); probleme++ }
}

console.log(`\n════════ Ergebnis: ${probleme === 0 ? 'KEINE Fehler (Schema kompatibel)' : probleme + ' Fehler'} ════════`)
process.exit(probleme === 0 ? 0 : 1)
