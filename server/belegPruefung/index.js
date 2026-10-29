/**
 * Syntaktische Belegprüfung.
 *
 * Die Belegsuche findet Sätze, in denen Basis und Kollokator irgendwo stehen. In der Messung vom
 * 29.10.2026 zeigten 28 % der angezeigten Belege die Kollokation gar nicht („Ihr irrt gewaltig, wenn ihr
 * glaubt, das Heer …“ für „gewaltiges Heer“). Die Prüfung parst je Paar einen größeren Kandidatenpool mit
 * de_zdl_lg (pruefe.py) und merkt sich die Sätze, in denen die Kollokation wirklich als Abhängigkeit steht.
 * `fetchBelegeGeprueft()` zeigt danach nur noch diese; ungeprüfte Paare laufen wie bisher.
 *
 * Ablauf: Admin speichert einen Tag → `planePruefung()` reiht dessen Paare ein → Kandidaten im
 * Worker-Thread (belege_v2.db ist synchron) → ein Python-Prozess je Lauf (lädt das Modell, ~1,7 GB RAM,
 * beendet sich danach; nie zwei gleichzeitig) → Ergebnis in `beleg_pruefung`.
 *
 * Aus, solange BELEGPRUEFUNG_PYTHON nicht gesetzt ist (Pfad zum Python der Prüf-Umgebung, OPS.md).
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import db from '../db.js'
import logger from '../logger.js'
import { fetchBelege, belegeStand } from '../belege.js'
import { cacheDeleteWhere, loadDailyContentMaps, getLemmataIndex, invalidateCache, lemmaToRow, stmts as storeStmts } from '../store.js'
import { berlinTag } from '../date-utils.js'
import { lueckenfuellerPool, LUECKENFUELLER_PRUEFPAARE } from '../lueckenfueller.js'
import { buildLueckenfuellerImWorker } from '../lueckenfuellerImWorker.js'
import { holeKandidatenImWorker } from './kandidatenImWorker.js'
import { paarSchluessel, paareFuerDatum } from './paare.js'
import { gepruefteSatzIds } from './details.js'
import { kursBelegPaare } from '../course/belegPaare.js'
import { clearResolveCache } from '../course/resolveCache.js'

const SKRIPT = fileURLToPath(new URL('./pruefe.py', import.meta.url))
// Kandidaten je Paar: gemessen bestehen ~70 %, jedes Paar behielt mindestens 11 Sätze
const KANDIDATEN_JE_PAAR = 80
// Paare je Python-Lauf: ein Tag hat ~40–60, das Modell soll nicht für jeden einzeln laden
const PAARE_JE_LAUF = 80
const PYTHON_ZEITLIMIT_MS = 20 * 60_000

const stmts = {
  holen: db.prepare('SELECT * FROM beleg_pruefung WHERE basis = ? AND kollokator = ?'),
  speichern: db.prepare(`
    INSERT INTO beleg_pruefung (basis, kollokator, belege_stand, kandidaten, bestanden, satz_ids, details, geprueft_am)
    VALUES (@basis, @kollokator, @stand, @kandidaten, @bestanden, @satzIds, @details, @jetzt)
    ON CONFLICT(basis, kollokator) DO UPDATE SET belege_stand = excluded.belege_stand,
      kandidaten = excluded.kandidaten, bestanden = excluded.bestanden, satz_ids = excluded.satz_ids,
      details = excluded.details, geprueft_am = excluded.geprueft_am
  `),
}

// Lesen über ein eigenes Modul, weil der Lückenfüller-Worker und der Kurs es brauchen
export { gepruefteDetails, gepruefteSatzIds } from './details.js'

const warteschlange = new Map()   // paarSchluessel → { basis, kollokator }
const neubau = new Set()          // Lemma-IDs, deren Lückenfüller nach dem Lauf neu gebaut werden
let laeuft = false
let letzterLauf = null

export function pruefungAktiv() {
  return Boolean(process.env.BELEGPRUEFUNG_PYTHON)
}

/** fetchBelege() mit den geprüften Sätzen des Paars, falls es welche gibt. */
export function fetchBelegeGeprueft(lemma, collocate, opts = {}) {
  return fetchBelege(lemma, collocate, { ...opts, satzIds: gepruefteSatzIds(lemma, collocate) })
}

/**
 * Reiht Paare zur Prüfung ein und startet den Lauf, falls keiner läuft.
 * Schon für den aktuellen Belegbestand geprüfte Paare werden übersprungen, außer mit `erneut`.
 * Paare mit `mitDetails` (Lückenfüller) gelten erst als geprüft, wenn auch Relation und
 * Position vorliegen (Migration 0034) – ältere Zeilen werden für sie nachgeprüft.
 *
 * `lueckenfueller`: [{ id, paare }] – Lückenfüller-Lemmata zukünftiger Tage. Wird für eins
 * davon ein Paar eingereiht, baut der Lauf am Ende seine Runden mit den neuen Prüfdaten neu.
 *
 * @returns {{status: 'aus'|'geplant', neu: number}}
 */
export function planePruefung(paare, { erneut = false, lueckenfueller = [] } = {}) {
  if (!pruefungAktiv()) return { status: 'aus', neu: 0 }
  const stand = belegeStand()
  let neu = 0
  for (const { basis, kollokator, mitDetails } of paare) {
    const schluessel = paarSchluessel(basis, kollokator)
    if (warteschlange.has(schluessel)) continue
    if (!erneut) {
      const row = stmts.holen.get(String(basis).toLowerCase(), String(kollokator).toLowerCase())
      if (row && row.belege_stand === stand && (!mitDetails || row.details != null)) continue
    }
    warteschlange.set(schluessel, { basis, kollokator })
    neu++
  }
  for (const { id, paare: lfPaare } of lueckenfueller) {
    if (lfPaare.some(p => warteschlange.has(paarSchluessel(p.basis, p.kollokator)))) neubau.add(id)
  }
  if (neu && !laeuft) {
    laeuft = true
    arbeiteAb().finally(() => { laeuft = false })
  }
  return { status: 'geplant', neu }
}

/**
 * Reiht alle Belegpaare der angegebenen Spieltage ein (Speichern eines Tages, Admin-Werkzeug):
 * die angezeigten Paare (paareFuerDatum) und den Pool des Lückenfüller-Worts. Mit `kurs` auch die
 * festen Paare des Kurses (Admin-Werkzeug).
 */
export async function planePruefungFuerTage(daten, { kurs = false, ...opts } = {}) {
  if (!pruefungAktiv()) return { status: 'aus', neu: 0 }
  const maps = loadDailyContentMaps()
  const { byId } = getLemmataIndex()
  const heute = berlinTag()
  const paare = daten.flatMap(datum => paareFuerDatum(datum, maps, byId))
  const lueckenfueller = []
  for (const datum of daten) {
    const eintrag = maps.kalender?.[datum]
    const lf = Array.isArray(eintrag) ? null : byId.get(eintrag?.lueckenfueller_id)
    if (!lf) continue
    const pool = await lueckenfuellerPool(lf.lemma, lf.pos)
    const lfPaare = pool.slice(0, LUECKENFUELLER_PRUEFPAARE)
      .map(item => ({ basis: lf.lemma, kollokator: item.lemma, mitDetails: true }))
    paare.push(...lfPaare)
    // Heute wird schon gespielt: dessen Runden bleiben, wie sie sind
    if (datum > heute) lueckenfueller.push({ id: lf.id, paare: lfPaare })
  }
  // Der Kurs hat ~30 feste Paare; schon geprüfte überspringt planePruefung ohnehin
  if (kurs) paare.push(...kursBelegPaare())
  return planePruefung(paare, { ...opts, lueckenfueller })
}

/**
 * Baut die Lückenfüller-Runden neu, deren Paare im Lauf geprüft wurden – jetzt mit Sätzen,
 * in denen der Kollokator nachweislich in der Relation steht, und exakter Lücke. Nur für
 * Wörter, die noch an einem zukünftigen Tag als Lückenfüller geplant sind. Liefert der
 * Neubau zu wenig Material, bleiben die alten Runden.
 */
async function baueLueckenfuellerNeu(lauf) {
  const ids = [...neubau]
  neubau.clear()
  if (!ids.length) return
  const heute = berlinTag()
  const { kalender } = loadDailyContentMaps()
  let neuGebaut = 0
  for (const id of ids) {
    const nochGeplant = Object.entries(kalender).some(([datum, e]) => datum > heute && !Array.isArray(e) && e?.lueckenfueller_id === id)
    const entry = nochGeplant ? getLemmataIndex().byId.get(id) : null
    if (!entry) continue
    try {
      const runden = await buildLueckenfuellerImWorker(entry.lemma, entry.pos)
      if (!runden?.length) continue
      storeStmts.upsertLemma.run(lemmaToRow({ ...entry, lueckenfueller: runden }))
      invalidateCache('lemmata.json')
      neuGebaut++
      logger.info(`Belegprüfung: Lückenfüller „${entry.lemma}“ mit geprüften Sätzen neu gebaut (${runden.length} Runden)`)
    } catch (err) {
      logger.error({ err }, `Belegprüfung: Lückenfüller „${entry.lemma}“ nicht neu gebaut`)
    }
  }
  if (lauf) lauf.lueckenfueller = neuGebaut
}

export function pruefungStatus() {
  return { aktiv: pruefungAktiv(), laeuft, wartend: warteschlange.size, letzterLauf }
}

async function arbeiteAb() {
  while (warteschlange.size) {
    const stapel = [...warteschlange.values()].slice(0, PAARE_JE_LAUF)
    for (const p of stapel) warteschlange.delete(paarSchluessel(p.basis, p.kollokator))
    const lauf = { beginn: new Date().toISOString(), paare: stapel.length, saetze: 0, bestanden: 0, sekunden: null, fehler: null }
    letzterLauf = lauf
    try {
      await pruefeStapel(stapel, lauf, holeKandidatenImWorker)
    } catch (err) {
      lauf.fehler = err?.message || String(err)
      logger.error({ err }, `Belegprüfung: Lauf mit ${stapel.length} Paaren fehlgeschlagen`)
    }
    lauf.ende = new Date().toISOString()
  }
  await baueLueckenfuellerNeu(letzterLauf)
}

/**
 * Ein Prüflauf: Kandidaten holen, in Python prüfen, speichern. Auch vom Nachprüf-Skript
 * genutzt (dort ohne Worker, mit `holeKandidaten` im selben Thread).
 */
export async function pruefeStapel(stapel, lauf, holeKandidaten) {
  const { stand, paare } = await holeKandidaten(stapel, KANDIDATEN_JE_PAAR)
  const mitSaetzen = paare.filter(p => p.saetze.length)
  const antwort = mitSaetzen.length
    ? await rufePython({
      paare: mitSaetzen.map(p => ({
        schluessel: paarSchluessel(p.basis, p.kollokator),
        basis: p.basis,
        kollokator: p.kollokator,
        saetze: p.saetze,
      })),
    })
    : { paare: [], saetze: 0, sekunden: 0 }

  const ergebnisJe = new Map(antwort.paare.map(p => [p.schluessel, p]))
  const jetzt = new Date().toISOString()
  db.transaction(() => {
    for (const p of paare) {
      const ergebnis = ergebnisJe.get(paarSchluessel(p.basis, p.kollokator))
      const bestanden = ergebnis?.bestanden ?? []
      stmts.speichern.run({
        basis: p.basis.toLowerCase(),
        kollokator: p.kollokator.toLowerCase(),
        stand,
        kandidaten: p.saetze.length,
        bestanden: bestanden.length,
        satzIds: JSON.stringify(bestanden),
        details: JSON.stringify(ergebnis?.details ?? {}),
        jetzt,
      })
      lauf.bestanden += bestanden.length
    }
  })()
  lauf.saetze = antwort.saetze
  lauf.sekunden = antwort.sekunden
  leereBelegCache(paare)
  logger.info(`Belegprüfung: ${paare.length} Paare, ${antwort.saetze} Sätze in ${antwort.sekunden} s, ${lauf.bestanden} bestanden`)
}

/** Zwischengespeicherte Belege der Paare verwerfen, damit die geprüften sofort gelten. */
function leereBelegCache(paare) {
  const geprueft = new Set(paare.map(p => paarSchluessel(p.basis, p.kollokator)))
  cacheDeleteWhere((key) => {
    const [praefix, lemma, collocate] = key.split(':')
    if (praefix !== 'belege' || lemma === undefined || collocate === undefined) return false
    return geprueft.has(paarSchluessel(decodeURIComponent(lemma), decodeURIComponent(collocate)))
  })
  // Aufgelöste Kurs-Aufgaben tragen ihre Belegsätze in sich (resolveCache.js)
  clearResolveCache()
}

function rufePython(eingabe) {
  return new Promise((resolve, reject) => {
    const kind = spawn(process.env.BELEGPRUEFUNG_PYTHON, ['-I', SKRIPT], { stdio: ['pipe', 'pipe', 'pipe'] })
    const aus = []
    let fehlerText = ''
    const timer = setTimeout(() => {
      kind.kill()
      reject(new Error('Belegprüfung: Python-Lauf hat zu lange gedauert'))
    }, PYTHON_ZEITLIMIT_MS)
    timer.unref?.()
    kind.stdout.on('data', (d) => aus.push(d))
    kind.stderr.on('data', (d) => { fehlerText = (fehlerText + d).slice(-2000) })
    kind.on('error', (err) => { clearTimeout(timer); reject(err) })
    kind.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`Belegprüfung: Python endete mit Code ${code}: ${fehlerText.trim().split('\n').pop()}`))
      try {
        resolve(JSON.parse(Buffer.concat(aus).toString('utf8')))
      } catch (err) {
        reject(new Error(`Belegprüfung: Antwort von Python nicht lesbar (${err.message})`))
      }
    })
    kind.stdin.on('error', () => {})   // Python schon beendet: der Exit-Code meldet den Fehler
    kind.stdin.end(JSON.stringify(eingabe))
  })
}
