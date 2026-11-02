// Vergleichslauf alt gegen neu (G15, V1b): dieselben Kandidaten einmal mit dem eigenen Modell
// (pruefe.py lädt de_zdl_lg) und einmal über den Parser-Dienst des Satzkastens (pruefe.py --roh).
// Schreibt nichts in die Datenbank. Ausgabe nur Zahlen und Satz-IDs, nie Sätze.
//
//   node scripts/belegpruefung-vergleich.mjs --von 2026-11-03 --bis 2026-11-09 [--kurs] [--pools] [--bericht datei.json]
//
// --pools nimmt für jedes Wort der Kollokationen-Runde zusätzlich die Paare dazu, die die Prüfung
// an einem Lückenfüller-Tag mit diesem Wort einreihen würde (LUECKENFUELLER_PRUEFPAARE aus dem Pool).
//
// Braucht BELEGPRUEFUNG_PYTHON (mit Modell) sowie SATZANALYSE_INTERN_URL und SATZANALYSE_INTERN_TOKEN
// (Umgebung oder .env). Den Dienst lokal starten: im Satzkasten-Repo `npm run server` mit gesetztem
// SATZ_INTERN_TOKEN (gleicher Wert) und SATZ_MODELL (gekürztes Modell wie auf dem Server).
//
// Ziel vor dem Umschalten: ≥ 99,5 % gleiche Urteile je Satz, und kein Paar fällt unter die Zahl
// der angezeigten Belege (MIN_BRAUCHBAR), wenn es sie vorher erreichte.
import '../server/env.js'

import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import logger from '../server/logger.js'
import { loadDailyContentMaps, getLemmataIndex } from '../server/store.js'
import { fetchBelegKandidaten } from '../server/belege.js'
import { lueckenfuellerPool, LUECKENFUELLER_PRUEFPAARE } from '../server/lueckenfueller.js'
import { KANDIDATEN_JE_PAAR, PAARE_JE_LAUF, belegPaareFuerTage, pruefeKandidaten } from '../server/belegPruefung/index.js'
import { paarSchluessel } from '../server/belegPruefung/paare.js'

// So viele Belege zeigt das Spiel je Kollokation (/api/v1/belege, limit 5)
const MIN_BRAUCHBAR = 5

const { values } = parseArgs({
  options: {
    von: { type: 'string' },
    bis: { type: 'string' },
    kurs: { type: 'boolean', default: false },
    pools: { type: 'boolean', default: false },
    bericht: { type: 'string' },
  },
})

if (!process.env.BELEGPRUEFUNG_PYTHON || !process.env.SATZANALYSE_INTERN_URL || !process.env.SATZANALYSE_INTERN_TOKEN) {
  logger.error('Braucht BELEGPRUEFUNG_PYTHON, SATZANALYSE_INTERN_URL und SATZANALYSE_INTERN_TOKEN.')
  process.exit(1)
}

const { kalender } = loadDailyContentMaps()
const daten = Object.keys(kalender).filter(d => d >= (values.von ?? '0000') && d <= (values.bis ?? '9999')).sort()
const { paare: allePaare } = await belegPaareFuerTage(daten, { kurs: values.kurs })
if (values.pools) {
  const { byId } = getLemmataIndex()
  const ids = new Set(daten.flatMap(d => (Array.isArray(kalender[d]) ? kalender[d] : kalender[d]?.ids) ?? []))
  for (const id of ids) {
    const eintrag = byId.get(id)
    if (!eintrag) continue
    const pool = await lueckenfuellerPool(eintrag.lemma, eintrag.pos)
    allePaare.push(...pool.slice(0, LUECKENFUELLER_PRUEFPAARE).map(item => ({ basis: eintrag.lemma, kollokator: item.lemma })))
  }
}
const eindeutig = [...new Map(allePaare.map(p => [paarSchluessel(p.basis, p.kollokator), p])).values()]

const t0 = performance.now()
const paare = eindeutig
  .map(({ basis, kollokator }) => ({
    schluessel: paarSchluessel(basis, kollokator),
    basis,
    kollokator,
    saetze: fetchBelegKandidaten(basis, kollokator, { ziel: KANDIDATEN_JE_PAAR }).map(r => [r.id, r.satz]),
  }))
  .filter(p => p.saetze.length)
const saetze = new Set(paare.flatMap(p => p.saetze.map(([, s]) => s))).size
logger.info(`Vergleich: ${daten.length} Spieltage, ${paare.length} Paare mit Kandidaten, ${saetze} verschiedene Sätze (Kandidaten in ${Math.round((performance.now() - t0) / 1000)} s)`)

async function laufe(weg) {
  const start = performance.now()
  const ergebnis = new Map()
  let fehlerhaft = 0
  let modell = null
  for (let i = 0; i < paare.length; i += PAARE_JE_LAUF) {
    // Ohne Rückfall: Sonst rechnete auf dem „neuen“ Weg still das eigene Modell und alles wäre gleich
    const antwort = await pruefeKandidaten(paare.slice(i, i + PAARE_JE_LAUF), { weg, rueckfall: false })
    if (antwort.quelle !== weg) throw new Error(`Weg ${weg} erwartet, ${antwort.quelle} bekommen`)
    for (const p of antwort.paare) ergebnis.set(p.schluessel, p)
    fehlerhaft += antwort.fehlerhaft ?? 0
    modell = antwort.modell
  }
  const sekunden = Math.round((performance.now() - start) / 100) / 10
  logger.info(`  ${weg}: ${sekunden} s (${modell}), ${fehlerhaft} Sätze nicht auswertbar`)
  return { ergebnis, sekunden, fehlerhaft, modell }
}

const alt = await laufe('modell')
const neu = await laufe('dienst')

const z = { urteile: 0, gleich: 0, nurAlt: 0, nurNeu: 0, beideBestanden: 0, relGleich: 0, posGleich: 0 }
const abweichungen = []
const unterMindest = []
const aufNull = []
for (const p of paare) {
  const a = alt.ergebnis.get(p.schluessel)?.details ?? {}
  const n = neu.ergebnis.get(p.schluessel)?.details ?? {}
  for (const [id] of p.saetze) {
    const da = a[id]
    const dn = n[id]
    z.urteile++
    if (Boolean(da) === Boolean(dn)) z.gleich++
    if (da && !dn) { z.nurAlt++; abweichungen.push({ paar: p.schluessel, satz: id, alt: da.rel, neu: null }) }
    if (dn && !da) { z.nurNeu++; abweichungen.push({ paar: p.schluessel, satz: id, alt: null, neu: dn.rel }) }
    if (da && dn) {
      z.beideBestanden++
      if (JSON.stringify(da.rel) === JSON.stringify(dn.rel)) z.relGleich++
      else abweichungen.push({ paar: p.schluessel, satz: id, alt: da.rel, neu: dn.rel })
      if (da.start === dn.start && da.ende === dn.ende) z.posGleich++
    }
  }
  const anzahlAlt = Object.keys(a).length
  const anzahlNeu = Object.keys(n).length
  if (anzahlAlt >= MIN_BRAUCHBAR && anzahlNeu < MIN_BRAUCHBAR) unterMindest.push({ paar: p.schluessel, alt: anzahlAlt, neu: anzahlNeu })
  if (anzahlAlt > 0 && anzahlNeu === 0) aufNull.push({ paar: p.schluessel, alt: anzahlAlt })
}

const prozent = (x, von) => (von ? (100 * x / von).toFixed(2) : '–')
const bericht = {
  tage: { anzahl: daten.length, von: daten[0], bis: daten.at(-1), kurs: values.kurs, pools: values.pools },
  paare: paare.length,
  saetze,
  urteile: z.urteile,
  gleicheUrteile: z.gleich,
  gleicheUrteileProzent: Number(prozent(z.gleich, z.urteile)),
  nurAltBestanden: z.nurAlt,
  nurNeuBestanden: z.nurNeu,
  beideBestanden: z.beideBestanden,
  relationGleichProzent: Number(prozent(z.relGleich, z.beideBestanden)),
  positionGleichProzent: Number(prozent(z.posGleich, z.beideBestanden)),
  bestandenAlt: z.nurAlt + z.beideBestanden,
  bestandenNeu: z.nurNeu + z.beideBestanden,
  minBrauchbar: MIN_BRAUCHBAR,
  paareUnterMindestzahl: unterMindest,
  paareAufNull: aufNull,
  alt: { modell: alt.modell, sekunden: alt.sekunden, fehlerhaft: alt.fehlerhaft },
  neu: { modell: neu.modell, sekunden: neu.sekunden, fehlerhaft: neu.fehlerhaft },
  abweichungen,
}

logger.info(`Urteile gleich: ${z.gleich}/${z.urteile} = ${bericht.gleicheUrteileProzent} % (nur alt bestanden ${z.nurAlt}, nur neu ${z.nurNeu})`)
logger.info(`Bei beiden bestanden (${z.beideBestanden}): Relation gleich ${bericht.relationGleichProzent} %, Position gleich ${bericht.positionGleichProzent} %`)
logger.info(`Paare unter ${MIN_BRAUCHBAR} brauchbaren Sätzen gefallen: ${unterMindest.length}, auf 0 gefallen: ${aufNull.length}`)
if (values.bericht) writeFileSync(values.bericht, JSON.stringify(bericht, null, 2) + '\n')
const bestanden = bericht.gleicheUrteileProzent >= 99.5 && unterMindest.length === 0 && aufNull.length === 0
logger.info(bestanden ? 'Ziel erreicht.' : 'Ziel NICHT erreicht.')
process.exit(bestanden ? 0 : 2)
