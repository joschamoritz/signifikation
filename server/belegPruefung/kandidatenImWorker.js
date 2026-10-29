/**
 * Kandidatensätze der Belegprüfung im Worker-Thread holen (Muster wie lueckenfuellerImWorker.js).
 *
 * Ein dauerhafter Worker (lazy gestartet, unref), Aufträge laufen nacheinander. Nie worker.terminate():
 * Trifft das Beenden einen laufenden better-sqlite3-Aufruf, stürzt der ganze Prozess ab. Das Zeitlimit
 * lehnt nur den Auftrag ab; Beenden geht per Nachricht zwischen zwei Aufträgen.
 */
import { Worker } from 'node:worker_threads'
import logger from '../logger.js'

const ZEITLIMIT_MS = 10 * 60_000

let worker = null
let naechsteId = 1
const offen = new Map()   // id → { resolve, reject, timer }

function lehneAlleAb(fehler) {
  for (const { reject, timer } of offen.values()) {
    clearTimeout(timer)
    reject(fehler)
  }
  offen.clear()
}

function starte() {
  const w = new Worker(new URL('./kandidatenWorker.js', import.meta.url))
  w.unref()
  w.on('message', ({ id, stand, paare, fehler }) => {
    const auftrag = offen.get(id)
    if (!auftrag) return
    offen.delete(id)
    clearTimeout(auftrag.timer)
    if (fehler) auftrag.reject(new Error(fehler))
    else auftrag.resolve({ stand, paare })
  })
  w.on('error', (err) => {
    logger.error({ err }, 'Belegprüfung: Kandidaten-Worker abgestürzt')
    if (worker === w) { worker = null; lehneAlleAb(new Error('Kandidaten-Worker abgestürzt')) }
  })
  w.on('exit', (code) => {
    if (worker === w) { worker = null; lehneAlleAb(new Error(`Kandidaten-Worker beendet (Code ${code})`)) }
  })
  return w
}

/**
 * @param {Array<{basis: string, kollokator: string}>} paare
 * @param {number} ziel  Poolgröße je Paar
 * @returns {Promise<{stand: number, paare: Array<{basis, kollokator, saetze: Array<[number, string]>}>}>}
 */
export function holeKandidatenImWorker(paare, ziel) {
  if (!worker) worker = starte()
  const id = naechsteId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      offen.delete(id)
      reject(new Error('Kandidatensuche der Belegprüfung hat zu lange gedauert.'))
    }, ZEITLIMIT_MS)
    timer.unref?.()
    offen.set(id, { resolve, reject, timer })
    worker.postMessage({ id, paare, ziel })
  })
}

/** Beendet den Worker nach dem laufenden Auftrag (Tests, Herunterfahren). */
export function beendeKandidatenWorker() {
  const w = worker
  worker = null
  lehneAlleAb(new Error('Kandidaten-Worker beendet'))
  w?.postMessage({ typ: 'ende' })
}
