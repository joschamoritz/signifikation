// CLI: Kollokationen-Runden geplanter Tage mit der neuen Rangfolge neu bauen
// (Häufigkeit × logDice + Filter, planning/Kollokationen-Umkehr.md).
//
//   node scripts/kollokationen-neubau.mjs                      # Probelauf ab morgen, schreibt nichts
//   node scripts/kollokationen-neubau.mjs --schreiben          # ab morgen neu bauen
//   node scripts/kollokationen-neubau.mjs --ab 2026-12-01 --bis 2026-12-31
//   node scripts/kollokationen-neubau.mjs --auch-vergangene    # auch Lemmata, die schon vor dem Stichtag vorkamen
//   node scripts/kollokationen-neubau.mjs --zurueck server/data/backups/kollokationen-neubau-….json
//
// Ersetzt nur runden.kollokatoren; Notiz, Definition, Lückenfüller und die übrigen Runden
// bleiben. Heute und vergangene Tage bleiben standardmäßig unverändert (siehe
// server/kollokationenNeubau.js). Vor dem Schreiben sichert das Skript die alten Optionen
// nach server/data/backups/, --zurueck spielt eine solche Sicherung zurück.
//
// Läuft im eigenen Prozess neben dem Server; dessen Lemma-Zwischenspeicher übernimmt die
// neuen Runden nach spätestens 5 Minuten. Danach die Belegprüfung für die neuen Paare
// nachholen: node scripts/belege-pruefen.mjs (sonst zeigen die neuen Kollokatoren
// keine Beispielsätze).
import '../server/env.js'

import { parseArgs } from 'node:util'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import logger from '../server/logger.js'
import db from '../server/db.js'
import { DATA, stmts, lemmaToRow, invalidateCache, loadDailyContentMaps, getLemmataIndex } from '../server/store.js'
import { loadAllSpezialwochen } from '../server/store-spezialwochen.js'
import { berlinTag, plusTage } from '../server/date-utils.js'
import { fetchLemma, MIN_KOLLOKATOREN } from '../server/wortprofil.js'
// Kollokator-Korrekturen aus dem Admin (DB) gelten auch hier, nicht nur der Grundbestand
import '../server/kollokatorKorrekturStore.js'
import { planeNeubau, top3, mitNeuenKollokatoren } from '../server/kollokationenNeubau.js'

const { values } = parseArgs({
  options: {
    ab: { type: 'string' },
    bis: { type: 'string' },
    schreiben: { type: 'boolean', default: false },
    'auch-vergangene': { type: 'boolean', default: false },
    zurueck: { type: 'string' },
  },
})

const ISO = /^\d{4}-\d{2}-\d{2}$/
const ende = (code) => { db.close(); process.exit(code) }

// ── Rückspielen einer Sicherung ──────────────────────────────────────────────
if (values.zurueck) {
  const sicherung = JSON.parse(readFileSync(values.zurueck, 'utf8'))
  const { byId } = getLemmataIndex()
  const zurueck = db.transaction((eintraege) => {
    let n = 0
    for (const { id, kollokatoren } of eintraege) {
      const lemma = byId.get(id)
      if (!lemma) { logger.warn(`Rückspielen: Lemma ${id} fehlt, übersprungen`); continue }
      stmts.upsertLemma.run(lemmaToRow(mitNeuenKollokatoren(lemma, kollokatoren)))
      n++
    }
    return n
  })
  const n = zurueck(sicherung.lemmata ?? [])
  invalidateCache('lemmata.json')
  logger.info(`Rückgespielt: ${n} Lemmata aus ${values.zurueck}`)
  ende(0)
}

if (process.env.KOLLOKATIONEN_RANGFOLGE === 'alt') {
  logger.error('KOLLOKATIONEN_RANGFOLGE=alt ist gesetzt – ein Neubau ergäbe wieder die alte Sortierung. Abbruch.')
  ende(1)
}

const ab = values.ab ?? plusTage(berlinTag(), 1)
const bis = values.bis ?? '9999-12-31'
if (!ISO.test(ab) || !ISO.test(bis)) {
  logger.error('--ab und --bis erwarten JJJJ-MM-TT')
  ende(1)
}
if (ab <= berlinTag() && !values['auch-vergangene']) {
  logger.warn(`--ab ${ab} liegt nicht in der Zukunft: Wer heute schon gespielt hat, sähe andere Optionen.`)
}

const maps = loadDailyContentMaps()
const { byId } = getLemmataIndex()
const plan = planeNeubau({
  kalender: maps.kalender,
  spezialwochen: loadAllSpezialwochen(),
  byId,
  ab,
  bis,
  auchVergangene: values['auch-vergangene'],
})

const t0 = Date.now()
const ergebnisse = []
for (const { id, lemma, daten } of plan.neu) {
  try {
    const frisch = await fetchLemma(lemma.lemma, lemma.pos || 'Substantiv')
    const neu = frisch?.runden?.kollokatoren ?? []
    // Nie eine Runde mit weniger als 10 Optionen schreiben (3 gesuchte + 7 Ablenker):
    // Das deutet auf eine falsche Wortart im Lemma oder ein zu seltenes Wort, nicht
    // auf eine bessere Runde.
    if (neu.length < MIN_KOLLOKATOREN) {
      plan.uebersprungen.push({ id, lemma: lemma.lemma, grund: `nur ${neu.length} Kollokatoren als ${lemma.pos || 'Substantiv'} – Wortart prüfen`, daten })
      continue
    }
    const alt = lemma.runden?.kollokatoren ?? []
    ergebnisse.push({ id, lemma, daten, alt, neu, gleich: top3(alt).join('|') === top3(neu).join('|') })
  } catch (err) {
    logger.warn({ err }, `fetchLemma für „${lemma.lemma}“ fehlgeschlagen, übersprungen`)
    plan.uebersprungen.push({ id, lemma: lemma.lemma, grund: 'Fehler bei der Abfrage', daten })
  }
}

// ── Bericht ──────────────────────────────────────────────────────────────────
const geaendert = ergebnisse.filter((e) => !e.gleich)
logger.info(`Zeitraum ${ab} bis ${bis === '9999-12-31' ? 'Ende' : bis}: ${plan.neu.length} Lemmata geprüft in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
logger.info(`Top 3 ändern sich bei ${geaendert.length}, bleiben gleich bei ${ergebnisse.length - geaendert.length}, übersprungen ${plan.uebersprungen.length}`)
for (const e of geaendert) {
  logger.info(`${e.daten[0]}  ${e.lemma.lemma}: ${top3(e.alt).join(', ') || '–'}  →  ${top3(e.neu).join(', ')}`)
}
for (const u of plan.uebersprungen) {
  logger.info(`übersprungen ${u.daten[0]}  ${u.lemma ?? u.id}: ${u.grund}`)
}

if (!values.schreiben) {
  logger.info('Probelauf – nichts geschrieben. Mit --schreiben übernehmen.')
  ende(0)
}

// ── Schreiben (mit Sicherung) ────────────────────────────────────────────────
const zuSchreiben = ergebnisse.filter((e) => JSON.stringify(e.alt) !== JSON.stringify(e.neu))
if (zuSchreiben.length === 0) {
  logger.info('Nichts zu schreiben.')
  ende(0)
}
const ordner = join(DATA, 'backups')
mkdirSync(ordner, { recursive: true })
const datei = join(ordner, `kollokationen-neubau-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(datei, JSON.stringify({
  erstellt: new Date().toISOString(), ab, bis,
  lemmata: zuSchreiben.map((e) => ({ id: e.id, lemma: e.lemma.lemma, kollokatoren: e.alt })),
}, null, 1))
logger.info(`Sicherung der alten Optionen: ${datei}`)

const schreibe = db.transaction((liste) => {
  for (const e of liste) stmts.upsertLemma.run(lemmaToRow(mitNeuenKollokatoren(e.lemma, e.neu)))
})
schreibe(zuSchreiben)
invalidateCache('lemmata.json')
logger.info(`Geschrieben: ${zuSchreiben.length} Lemmata. Der Server übernimmt sie nach spätestens 5 Minuten.`)
logger.info('Jetzt die Belegprüfung nachholen: node scripts/belege-pruefen.mjs')
ende(0)
