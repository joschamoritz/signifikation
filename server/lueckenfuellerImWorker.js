/**
 * buildLueckenfueller in einem Worker-Thread.
 *
 * Eine Lückenfüller-Prüfung liest synchron aus Wortprofil- und Belege-DB (better-sqlite3) und braucht beim
 * ersten Aufruf 8–15 s. Im Hauptprozess stand in dieser Zeit der ganze Server (alle Spieler, nicht nur der
 * Admin). Der Worker rechnet daneben; der Hauptprozess wartet nur auf die Antwort.
 *
 * Ein dauerhafter Worker (lazy gestartet, unref: hält den Prozess nicht am Leben), Aufträge laufen dort
 * nacheinander. Genutzt von den Admin-Wegen (Prüfen, Erzeugen, Ergänzen beim Speichern eines Tages).
 *
 * Nie worker.terminate(): Trifft das Beenden einen laufenden better-sqlite3-Aufruf, stürzt der ganze Prozess
 * ab (V8 FATAL „Empty MaybeLocal“, im Test nachgestellt). Das Zeitlimit lehnt deshalb nur den Auftrag ab und
 * lässt den Worker weiterrechnen; Beenden geht per Nachricht, die der Worker zwischen zwei Aufträgen annimmt.
 */
import { Worker } from 'node:worker_threads'
import logger from './logger.js'

const ZEITLIMIT_MS = 90_000

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
  const w = new Worker(new URL('./lueckenfuellerWorker.js', import.meta.url))
  w.unref()
  w.on('message', ({ id, runden, fehler }) => {
    const auftrag = offen.get(id)
    if (!auftrag) return   // schon abgelaufen oder abgelehnt
    offen.delete(id)
    clearTimeout(auftrag.timer)
    if (fehler) auftrag.reject(new Error(fehler))
    else auftrag.resolve(runden ?? null)
  })
  w.on('error', (err) => {
    logger.error({ err }, 'Lückenfüller-Worker abgestürzt')
    if (worker === w) { worker = null; lehneAlleAb(new Error('Lückenfüller-Worker abgestürzt')) }
  })
  w.on('exit', (code) => {
    if (worker === w) { worker = null; lehneAlleAb(new Error(`Lückenfüller-Worker beendet (Code ${code})`)) }
  })
  return w
}

/** Wie buildLueckenfueller(lemma, pos), aber im Worker-Thread. */
export function buildLueckenfuellerImWorker(lemma, pos) {
  if (!worker) worker = starte()
  const id = naechsteId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      offen.delete(id)
      logger.warn({ lemma, pos }, 'Lückenfüller-Worker: Zeitlimit überschritten')
      reject(new Error('Die Lückenfüller-Berechnung hat zu lange gedauert.'))
    }, ZEITLIMIT_MS)
    timer.unref?.()
    offen.set(id, { resolve, reject, timer })
    worker.postMessage({ id, lemma, pos })
  })
}

/** Leert den Abfrage-Zwischenspeicher im Worker (Werkzeuge › Zwischenspeicher leeren). */
export function leereLueckenfuellerWorkerCache() {
  worker?.postMessage({ typ: 'cache-leeren' })
}

/** Beendet den Worker nach dem laufenden Auftrag (Tests, Herunterfahren); offene Aufträge werden abgelehnt. */
export function beendeLueckenfuellerWorker() {
  const w = worker
  worker = null
  lehneAlleAb(new Error('Lückenfüller-Worker beendet'))
  w?.postMessage({ typ: 'ende' })
}
