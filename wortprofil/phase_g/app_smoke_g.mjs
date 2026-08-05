/**
 * Phase G – vollständiger App-Smoke-Test gegen die v2-DBs
 *
 * Erweitert wortprofil/phase_c/app_smoke.mjs um genau die Pfade, die der
 * Phase-G-Auftrag verlangt und die Phase C noch nicht abdeckte:
 *
 *   - alle VIER Spielmodi (Kollokationen, Wort-Zwilling, Zeitenwende, Lückenfüller)
 *   - Belege-Anzeige inkl. neuem Anzeigeformat „ref · Zitation · Lizenz"
 *   - Archiv: fetchBelegeForLemma (KWIC), syntagmatische Muster, Wortnetz
 *   - Kurs-Station 5 (Korpusbelege) über den echten corpusAdapter
 *   - Eigenes Lemma: Wortart-Erkennung („Elend"-Fix) + Validierung je Modus
 *   - Rückwärts-Varianten-Fallback (thier/tier) aus lemma_corrections
 *   - Latenzmessung der Adjektiv-Verben-Runde (PRED_REV → ~PRED)
 *
 * Aufruf (aus Projekt-Root):
 *   node wortprofil/phase_g/app_smoke_g.mjs \
 *     --wortprofil C:/wortprofil_v2/wortprofil_v2.db \
 *     --belege C:/wortprofil_v2/belege_v2.db
 *
 * Ohne Argumente laufen die Default-Pfade der App (= die alten v1-DBs), damit
 * sich derselbe Test auch für den Rollback-Pfad verwenden lässt.
 */

import { resolve } from 'path'

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

if (arg('wortprofil')) process.env.WORTPROFIL_DB = resolve(arg('wortprofil'))
if (arg('belege'))     process.env.BELEGE_DB     = resolve(arg('belege'))
process.env.LOG_LEVEL ??= 'error'

console.log(`WORTPROFIL_DB = ${process.env.WORTPROFIL_DB ?? '(Default)'}`)
console.log(`BELEGE_DB     = ${process.env.BELEGE_DB ?? '(Default)'}\n`)

const wp   = await import('../../server/wortprofil.js')
const bel  = await import('../../server/belege.js')
const zwi  = await import('../../server/wortzwilling.js')
const lue  = await import('../../server/lueckenfueller.js')
const cus  = await import('../../server/customLemma.js')
const adap = await import('../../server/course/corpusAdapter.js')
const res5 = await import('../../server/course/resolve.js')
const st5  = await import('../../server/course/content/station-5.js')

let fails = 0
const ok   = (name, bedingung, info = '') => {
  if (!bedingung) fails++
  console.log(`  ${bedingung ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`)
}
const skip = (name, grund) => console.log(`  SKIP  ${name}  — ${grund}`)
const kurz = (s, n = 78) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n)

const { default: Database } = await import('better-sqlite3')

// Steht das E2-Mapping zur Verfügung? Nur dann kann der Varianten-Fallback greifen.
let hatKorrekturen = false
try {
  const d = new Database(process.env.WORTPROFIL_DB ?? resolve('wortprofil/05_db/wortprofil.db'), { readonly: true })
  hatKorrekturen = d.prepare("SELECT count(*) c FROM sqlite_master WHERE name='lemma_corrections'").get().c > 0
  d.close()
} catch { /* keine DB → kein Mapping */ }

// ── 1. Spielmodus Kollokationen ─────────────────────────────────────────────
console.log('════════ 1. Spielmodus Kollokationen (fetchLemma) ════════')
for (const [lemma, pos] of [['Haus', 'Substantiv'], ['geben', 'Verb'], ['grün', 'Adjektiv']]) {
  const l = await wp.fetchLemma(lemma, pos)
  const n = l.runden.kollokatoren?.length ?? 0
  ok(`fetchLemma ${lemma}/${pos}`, n === 10, `kollokatoren=${n}, Top-3: ${l.runden.kollokatoren?.slice(0, 3).map(o => o.wort).join(', ')}`)
}

// ── 2. Spielmodus Wort-Zwilling ─────────────────────────────────────────────
console.log('\n════════ 2. Spielmodus Wort-Zwilling ════════')
for (const [a, b] of [['Haus', 'Wohnung'], ['Krieg', 'Friede'], ['Kritik', 'Lob']]) {
  const r = await zwi.fetchWortZwilling(a, b, 'Substantiv')
  ok(`fetchWortZwilling ${a}/${b}`, !!r && r.kollokatoren.length >= 10,
    r ? `${r.kollokatoren.length} Kollokatoren` : 'null')
}

// ── 2b. Schwache Substantive (n-Deklination) – v2-Lemmatisierungswechsel ─────
// v2 lemmatisiert konsequent auf die Grundform („Friede", „Name", „Wille"),
// v1 hatte beide Formen parallel. Für Lemmata, die in signifikation.db in der
// -en-Form stehen, liefert v2 damit KEINE Substantiv-Kollokationen mehr.
console.log('\n════════ 2b. Schwache Substantive (n-Deklination) ════════')
for (const [enForm, grundform] of [['Frieden', 'Friede'], ['Namen', 'Name'], ['Willen', 'Wille'], ['Gedanken', 'Gedanke'], ['Glauben', 'Glaube']]) {
  const a = wp.posByFrequency(enForm).find(r => r.pos === 'Substantiv')?.freq ?? 0
  const b = wp.posByFrequency(grundform).find(r => r.pos === 'Substantiv')?.freq ?? 0
  console.log(`  ${enForm.padEnd(10)} freq=${String(a).padStart(9)}   ${grundform.padEnd(10)} freq=${String(b).padStart(9)}   ${a === 0 && b > 0 ? '→ nur Grundform trägt' : ''}`)
}

// ── 3. Spielmodus Zeitenwende ───────────────────────────────────────────────
console.log('\n════════ 3. Spielmodus Zeitenwende ════════')
for (const lemma of ['Krieg', 'Arbeiter', 'Wasser']) {
  const z = await wp.fetchZeitenwende(lemma)
  ok(`fetchZeitenwende ${lemma}`, !!z && z.words.length === 10,
    z ? z.words.slice(0, 4).map(w => `${w.wort}(${w.periode})`).join(', ') : 'null')
}

// ── 4. Spielmodus Lückenfüller (liest belege über fetchBelegeRaw) ───────────
console.log('\n════════ 4. Spielmodus Lückenfüller ════════')
for (const [lemma, pos] of [['Haus', 'Substantiv'], ['Kritik', 'Substantiv'], ['Frage', 'Substantiv']]) {
  const runden = await lue.buildLueckenfueller(lemma, pos)
  const n = Array.isArray(runden) ? runden.length : 0
  ok(`buildLueckenfueller ${lemma}`, n > 0, `${n} Runden${n ? ' · ' + kurz(runden[0].satz ?? runden[0].text) : ''}`)
}

// ── 5. Belege-Anzeige + neues Anzeigeformat ────────────────────────────────
console.log('\n════════ 5. Belege-Anzeige (fetchBelege) ════════')
ok('belegeVerfuegbar()', bel.belegeVerfuegbar())
for (const [lemma, col] of [['Tisch', 'rund'], ['Lüge', 'auftischen'], ['Freund', 'treu'], ['Wasser', 'trinken']]) {
  const t = Date.now()
  const b = bel.fetchBelege(lemma, col, { limit: 3 })
  const ms = Date.now() - t
  ok(`fetchBelege ${lemma}+${col}`, b.length > 0, `${b.length} Belege, ${ms} ms`)
  if (b[0]) console.log(`        quelle: ${b[0].quelle}`)
}

// ── 6. Rückwärts-Varianten-Fallback (§3.5) ─────────────────────────────────
console.log('\n════════ 6. Rückwärts-Varianten-Fallback (thier → tier) ════════')
{
  // (a) Normalfall: moderne Schreibung findet genug → Varianten dürfen die
  //     BM25-Rangfolge NICHT verdrängen (seltene Terme wiegen dort schwerer).
  const modern = bel.fetchBelegeRaw('Tier', 'wild', { limit: 20 })
  const anteilHist = modern.filter(r => /\bthier/i.test(r.satz)).length
  ok('Tier+wild liefert moderne Belege', modern.length >= 2, `${modern.length} Treffer`)
  ok('… ohne dass historische Schreibung sie verdrängt', anteilHist === 0,
    anteilHist ? `${anteilHist} von ${modern.length} historisch` : 'alle modern')

  // (b) Kopplungsfall: „unvernünfftig" ist ein echter Kollokator von `tier` in
  //     wortprofil_v2 (dort nach thier→tier normalisiert), steht im Korpus aber
  //     ausschließlich neben „Thier". Ohne Fallback: null Belege.
  const gekoppelt = bel.fetchBelegeRaw('Tier', 'unvernünfftig', { limit: 10 })
  if (!hatKorrekturen) {
    skip('Tier+unvernünfftig über den Fallback', 'kein lemma_corrections in dieser Wortprofil-DB (v1)')
  } else {
    ok('Tier+unvernünfftig findet über den Fallback Belege', gekoppelt.length > 0,
      gekoppelt.length ? kurz(gekoppelt[0].satz) : 'keine')
  }
}

// ── 7. Archiv: KWIC + syntagmatische Muster + Wortnetz ─────────────────────
console.log('\n════════ 7. Archiv (SSR /wort/:lemma) ════════')
for (const lemma of ['Kritik', 'Wasser']) {
  const belege = bel.fetchBelegeForLemma(lemma, { limit: 2 })
  ok(`fetchBelegeForLemma ${lemma}`, belege.length > 0 && !!belege[0]?.kwic,
    belege[0] ? `kwic: „${kurz(belege[0].kwic?.left, 30)}" [${belege[0].kwic?.keyword}] „${kurz(belege[0].kwic?.right, 30)}"` : 'leer')
  if (belege[0]) console.log(`        quelle: ${belege[0].quelle}`)
  const { total, patterns } = wp.fetchSyntagmaticPatterns(lemma, 'Substantiv', { limit: 5 })
  ok(`fetchSyntagmaticPatterns ${lemma}`, patterns.length > 0,
    `total=${total}, ${patterns.map(p => `${p.kollokator}(${p.muster})`).join(', ')}`)
  const netz = wp.fetchSecondaryCollocates(lemma, 'Substantiv')
  ok(`fetchSecondaryCollocates ${lemma}`, netz.length > 0,
    netz.map(n => `${n.base}→${n.collocates.length}`).join(', '))
}

// ── 8. Kurs-Station 5 (Korpusbelege) über den echten Adapter ───────────────
console.log('\n════════ 8. Kurs-Station 5 (corpusAdapter + resolveItemInteractive) ════════')
{
  const corpus = adap.makeCorpusAdapter()
  const items = st5.default?.tasks ?? st5.tasks ?? []
  ok('Station-5-Aufgaben geladen', items.length > 0, `${items.length} Items`)
  let mitBelegen = 0, mitKwic = 0, fehler = 0
  for (const item of items) {
    try {
      const r = res5.resolveItemInteractive(item, { corpus })
      if (Array.isArray(r.payload?.lines) && r.payload.lines.length) { mitKwic++; }
      if (Array.isArray(r.belegContext) && r.belegContext.length) mitBelegen++
      if (r.payload?.belegSatz || r.payload?.satz) mitBelegen++
      // {{selected.…}} / {{chosen.…}} füllt der Client aus der Nutzerauswahl –
      // die bleiben absichtlich stehen (siehe routes/course.js, resolve=interactive).
      const offen = JSON.stringify(r).match(/\{\{(?!selected\.|chosen\.)[^}]+\}\}/g)
      if (offen) { fehler++; console.log(`        offener Platzhalter in ${item.id}: ${offen.join(', ')}`) }
    } catch (e) { fehler++; console.log(`        ERR ${item.id}: ${e.message}`) }
  }
  ok('Station 5 löst ohne Fehler/Platzhalter auf', fehler === 0, `${fehler} Probleme`)
  ok('Station 5 zieht echte Korpusbelege', (mitKwic + mitBelegen) > 0, `kwic=${mitKwic}, belegSätze=${mitBelegen}`)
  // KWIC direkt am Adapter
  const kw = corpus.fetchBelege('Kritik', 'scharf', { limit: 4, adjacent: true })
  ok('Adapter-KWIC Kritik+scharf (adjacent)', kw.length > 0, kw.length ? kurz(kw[0].satz) : 'leer')
  if (kw[0]) console.log(`        quelle: ${kw[0].quelle}`)
}

// ── 9. Eigenes Lemma: Wortart-Erkennung („Elend"-Fix) ──────────────────────
console.log('\n════════ 9. Eigenes Lemma – Wortart nach Häufigkeit ════════')
for (const [lemma, erwartet] of [['Elend', 'Substantiv'], ['deutsch', 'Adjektiv'], ['gut', 'Adjektiv'], ['Recht', 'Substantiv'], ['laufen', 'Verb']]) {
  const t = Date.now()
  const v = await cus.validateCustomLemma({ mode: 'kollokationen', q: lemma })
  const ms = Date.now() - t
  ok(`${lemma} → ${v.pos}`, v.pos === erwartet, `erwartet ${erwartet}, usable=${v.usable}, count=${v.count}, ${ms} ms`)
}

// ── 10. Latenz der Adjektiv-Verben-Runde (PRED_REV) ────────────────────────
console.log('\n════════ 10. Latenz Adjektiv-Verben-Runde (PRED_REV) ════════')
for (const lemma of ['grün', 'hoch', 'legendär']) {
  const t = Date.now()
  const r = await wp.fetchRelation(lemma + '\u200b'.repeat(0), 'Adjektiv', 'PRED_REV')
  const ms = Date.now() - t
  ok(`PRED_REV ${lemma}`, ms < 200, `${r.length} Treffer in ${ms} ms (v1-Rückwärtssuche lag bei ~1200 ms)`)
}

// ── 11. Bestandslemmata der App gegen die neue DB ──────────────────────────
// Deckt genau die Regression ab, die 2b sichtbar macht: ein in signifikation.db
// gespeichertes Lemma („Frieden") kann in v2 leer laufen. Läuft nur, wenn eine
// App-DB erreichbar ist – auf dem Server VOR dem Umschalten aufrufen mit
//   APP_DB=/opt/signifikation/app/server/data/signifikation.db
console.log('\n════════ 11. Bestandslemmata aus signifikation.db ════════')
{
  const appDb = process.env.APP_DB ?? resolve('server/data/signifikation.db')
  let rows = null
  try {
    const d = new Database(appDb, { readonly: true, fileMustExist: true })
    rows = d.prepare("SELECT DISTINCT lemma, pos FROM lemmata WHERE lemma IS NOT NULL AND lemma != '' AND pos != ''").all()
    d.close()
  } catch (e) {
    console.log(`  übersprungen – keine App-DB unter ${appDb} (${e.message})`)
  }
  if (rows) {
    // Geprüft wird das ECHTE Spielkriterium (mergeKollokatoren ≥ 10), nicht nur
    // „Frequenz > 0". Der schwächere Test hatte `präzise` durchgewinkt: in
    // lemma_corpus_freq stehen dort 12 Streureste, in `collocations` aber null
    // Zeilen — v2 lemmatisiert auf die Grundform `präzis`. Genau solche Fälle
    // soll dieser Abschnitt finden.
    const kaputt = []
    for (const { lemma, pos } of rows) {
      const v = await cus.validateCustomLemma({ mode: 'kollokationen', q: lemma, pos })
      if (!v.usable) {
        const auto = await cus.validateCustomLemma({ mode: 'kollokationen', q: lemma })
        kaputt.push(`${lemma}/${pos} (Pool ${v.count}; beste Wortart ${auto.pos}=${auto.count})`)
      }
    }
    ok(`${rows.length} gespeicherte Lemmata erreichen die Spielschwelle`,
      kaputt.length === 0, kaputt.length ? `UNTER SCHWELLE:\n        ${kaputt.join('\n        ')}` : 'alle spielbar')
  }
}

console.log(`\n════════ Ergebnis: ${fails === 0 ? 'ALLE PASS' : fails + ' FAIL'} ════════`)
process.exit(fails === 0 ? 0 : 1)
