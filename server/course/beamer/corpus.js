/**
 * server/course/beamer/corpus.js
 *
 * Live-Werte für die Beamer-Strecken aus wortprofil.db (NICHT hartcodiert).
 *
 * Zieht für ein Anker-Lemma die stärksten Adjektiv-Attribute (Relation ATTR,
 * ORDER BY logDice DESC) und leitet daraus ab:
 *   - spektrum: das typischste Kollokat (Hook „blondes Haar")
 *   - logdice:  strong/mid/weak + 0–14-Skala (alle logDice-Zahlen live)
 *   - daten:    reale DB-Größe + eine echte Top-Verbindung als Ergebnis-Beleg
 *
 * Bewusst lemmatisiert: queryRelation liefert Grundformen (`blond`), keine
 * Flexionsformen. Für natürlich lesbare Phrasen flektieren wir attributiv
 * (starke Deklination, Nom. Sg.) über eine kleine Genus-Tabelle für die
 * kuratierten Anker; bei unbekanntem Genus fällt die Anzeige auf „adj · Lemma".
 *
 * Die englischen Übersetzungs-Beispiele (Strecke „Übersetzen") sind NICHT aus
 * dem Korpus ableitbar (einsprachig deutsch) und bleiben redaktionell.
 */

import { statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { queryRelation } from '../../wortprofil.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.WORTPROFIL_DB
  ?? resolve(__dirname, '..', '..', '..', 'wortprofil', '05_db', 'wortprofil.db')

// Genus der kuratierten Anker (für attributive Flexion). Unbekannt → null.
const GENDER = {
  Haar: 'n', Fehler: 'm', Kälte: 'f', Regen: 'm', Wind: 'm', Schmerz: 'm',
  Stille: 'f', Wut: 'f', Hoffnung: 'f', Niederlage: 'f', Sieg: 'm', Gefühl: 'n',
  Erfolg: 'm', Beweis: 'm', Wahrheit: 'f', Wunde: 'f', Lüge: 'f', Wasser: 'n',
}

/** Strenge Deklination, Nom. Sg.: m → -er, f → -e, n → -es. */
function inflectAttributive(adj, gender) {
  if (!gender) return null
  const end = { m: 'er', f: 'e', n: 'es' }[gender]
  // -el/-er mit Schwa-Tilgung: dunkel → dunkl-, teuer → teur-, sauer → saur-
  let stem = adj
  if (/[^aeiou](el|er)$/i.test(adj)) stem = adj.slice(0, -2) + adj.slice(-2, -1)
  // Adjektive auf -e (müde, leise): finales e wird zum Flexions-e
  if (adj.endsWith('e')) stem = adj.slice(0, -1)
  return stem + end
}

/** Anzeige-Phrase „blondes Haar" (mit Genus) oder neutral „blond · Haar". */
function phrase(adj, lemma) {
  const flx = inflectAttributive(adj, GENDER[lemma])
  return flx ? `${flx} ${lemma}` : `${adj} · ${lemma}`
}

const pct = (val) => Math.max(6, Math.min(100, Math.round((Number(val) / 14) * 100)))
const num = (val) => Number(Number(val).toFixed(1))

function pick(row, lemma) {
  return {
    adj: row.adj,
    word: phrase(row.adj, lemma),
    val: num(row.logDice),
    freq: Number(row.frequency),
    pct: pct(row.logDice),
  }
}

/**
 * Liest alle Live-Werte für ein Anker-Lemma.
 * @param {string} lemma   Anker-Substantiv (Default „Haar")
 * @returns {{ lemma, ok, strong, mid, weak, scale, db }}
 */
export function getCorpusData(lemma = 'Haar') {
  const rows = queryRelation(lemma, 'Substantiv', 'ATTR', 30, 5, 0)
    .filter(r => !/\s/.test(r.lemma))           // nur Einzelwörter
    .map(r => ({ adj: r.lemma, logDice: Number(r.logDice), frequency: Number(r.frequency) }))

  const db = { bytes: dbBytes(), path: DB_PATH }

  if (rows.length < 4) {
    return { lemma, ok: false, db }
  }

  // logDice-absteigend (queryRelation liefert das bereits) → Extreme + Mitte.
  const sorted = [...rows].sort((a, b) => b.logDice - a.logDice)
  const strong = sorted[0]
  const weak = sorted[sorted.length - 1]
  // mid = das Kollokat, dessen logDice dem Mittelwert strong/weak am nächsten
  // liegt → drei sichtbar getrennte Punkte auf der 0–14-Skala (kein Überlappen).
  const target = (strong.logDice + weak.logDice) / 2
  let mid = sorted.reduce((best, r) =>
    Math.abs(r.logDice - target) < Math.abs(best.logDice - target) ? r : best, sorted[1])
  // Falls mid mit einem Extrem zusammenfällt (sehr flache Verteilung): mittleren Rang nehmen.
  if (mid === strong || mid === weak) mid = sorted[Math.floor(sorted.length / 2)]

  const S = pick(strong, lemma)
  const M = pick(mid, lemma)
  const W = pick(weak, lemma)

  return {
    lemma,
    ok: true,
    db,
    strong: S,
    mid: M,
    weak: W,
    // Skala schwach → erkennbar → typisch
    scale: [
      { ...W, qual: 'schwach' },
      { ...M, qual: 'erkennbar' },
      { ...S, qual: 'typisch' },
    ],
  }
}

function dbBytes() {
  try { return statSync(DB_PATH).size } catch { return null }
}

/** Bytes → „2,13 GB". */
export function fmtBytes(bytes) {
  if (!bytes) return '—'
  const gb = bytes / 1e9
  if (gb >= 1) return `${gb.toFixed(2).replace('.', ',')} GB`
  return `${Math.round(bytes / 1e6)} MB`
}

export default getCorpusData
