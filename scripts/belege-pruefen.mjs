// CLI: Belegprüfung für bereits geplante Spieltage nachholen (Archiv, oder nach einem
// Neuaufbau der Belege-DB). Neue Tage prüft der Server selbst beim Speichern.
//
//   node scripts/belege-pruefen.mjs                # ab heute
//   node scripts/belege-pruefen.mjs --alle         # alle Spieltage im Kalender
//   node scripts/belege-pruefen.mjs --von 2026-01-01 --bis 2026-06-30
//   node scripts/belege-pruefen.mjs --alle --erneut  # auch schon geprüfte Paare
//
// Braucht BELEGPRUEFUNG_PYTHON (.env) wie der Server. Läuft im eigenen Prozess neben
// dem Server; dessen Belege-Zwischenspeicher (6 h) bemerkt die neuen Ergebnisse erst
// nach Ablauf oder einem Neustart. Pro Spieltag etwa eine Minute, ~1,7 GB RAM.
import '../server/env.js'

import { parseArgs } from 'node:util'
import logger from '../server/logger.js'
import { loadDailyContentMaps, getLemmataIndex } from '../server/store.js'
import { berlinTag } from '../server/date-utils.js'
import { fetchBelegKandidaten, belegeStand } from '../server/belege.js'
import { pruefungAktiv, pruefeStapel, gepruefteSatzIds } from '../server/belegPruefung/index.js'
import { paareFuerDatum, paarSchluessel } from '../server/belegPruefung/paare.js'
import db from '../server/db.js'

const STAPEL = 80

const { values } = parseArgs({
  options: {
    alle: { type: 'boolean', default: false },
    von: { type: 'string' },
    bis: { type: 'string' },
    erneut: { type: 'boolean', default: false },
  },
})

if (!pruefungAktiv()) {
  logger.error('BELEGPRUEFUNG_PYTHON ist nicht gesetzt – siehe OPS.md „Belegprüfung“.')
  process.exit(1)
}

const maps = loadDailyContentMaps()
const { byId } = getLemmataIndex()
const von = values.alle ? '0000-00-00' : (values.von ?? berlinTag())
const bis = values.bis ?? '9999-12-31'
const daten = Object.keys(maps.kalender).filter(d => d >= von && d <= bis).sort()

const stand = belegeStand()
const schonGeprueft = db.prepare('SELECT belege_stand FROM beleg_pruefung WHERE basis = ? AND kollokator = ?')
const offen = new Map()
for (const datum of daten) {
  for (const p of paareFuerDatum(datum, maps, byId)) {
    const row = schonGeprueft.get(p.basis.toLowerCase(), p.kollokator.toLowerCase())
    if (!values.erneut && row?.belege_stand === stand) continue
    offen.set(paarSchluessel(p.basis, p.kollokator), p)
  }
}

const paare = [...offen.values()]
logger.info(`Belegprüfung: ${daten.length} Spieltage (${daten[0] ?? '–'} bis ${daten.at(-1) ?? '–'}), ${paare.length} offene Paare`)

const holeKandidaten = async (stapel, ziel) => ({
  stand,
  paare: stapel.map(({ basis, kollokator }) => ({
    basis,
    kollokator,
    saetze: fetchBelegKandidaten(basis, kollokator, { ziel }).map(r => [r.id, r.satz]),
  })),
})

let fehler = 0
for (let i = 0; i < paare.length; i += STAPEL) {
  const stapel = paare.slice(i, i + STAPEL)
  const lauf = { paare: stapel.length, saetze: 0, bestanden: 0 }
  try {
    await pruefeStapel(stapel, lauf, holeKandidaten)
    const mitTreffern = stapel.filter(p => gepruefteSatzIds(p.basis, p.kollokator)).length
    logger.info(`  ${Math.min(i + STAPEL, paare.length)}/${paare.length}: ${lauf.saetze} Sätze in ${lauf.sekunden} s, ${mitTreffern} von ${stapel.length} Paaren mit geprüften Belegen`)
  } catch (err) {
    fehler++
    logger.error({ err }, `  Stapel ab Paar ${i + 1} fehlgeschlagen`)
  }
}
process.exit(fehler ? 1 : 0)
