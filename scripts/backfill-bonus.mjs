/**
 * backfill-bonus.mjs – Bonusfragen für alle Lemmata nachberechnen
 *
 * Befüllt das Feld `bonusFrage` für alle Einträge in lemmata.json,
 * die noch kein solches Feld haben.
 *
 * Setzt wortprofil.db voraus (lokal oder per WORTPROFIL_DB-Env).
 *
 * Lokal:    node scripts/backfill-bonus.mjs
 * Railway:  railway run node scripts/backfill-bonus.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { fetchBonusQuestion } from '../server/wortprofil.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LEMMATA_PATH = join(__dirname, '..', 'server', 'data', 'lemmata.json')

const lemmata = JSON.parse(readFileSync(LEMMATA_PATH, 'utf8'))

let updated = 0
let skipped = 0
let failed  = 0

for (const l of lemmata) {
  if (l.bonusFrage !== undefined) {
    skipped++
    continue
  }
  try {
    l.bonusFrage = await fetchBonusQuestion(l.lemma, l.pos || 'Substantiv')
    const label = l.bonusFrage?.correct ?? 'null'
    console.log(`✓ ${l.lemma} (${l.pos}): ${label}`)
    updated++
  } catch (err) {
    console.warn(`✗ ${l.lemma}: ${err.message}`)
    l.bonusFrage = null
    failed++
  }
}

writeFileSync(LEMMATA_PATH, JSON.stringify(lemmata, null, 2))
console.log(`\nFertig: ${updated} aktualisiert, ${skipped} übersprungen, ${failed} Fehler.`)
