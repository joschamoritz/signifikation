/**
 * buildLueckenfueller in einem Worker-Thread.
 *
 * Eine Lückenfüller-Prüfung liest synchron aus Wortprofil- und Belege-DB (better-sqlite3) und braucht beim
 * ersten Aufruf 8–15 s. Im Hauptprozess stand in dieser Zeit der ganze Server (alle Spieler, nicht nur der
 * Admin). Der Worker rechnet daneben; der Hauptprozess wartet nur auf die Antwort.
 *
 * Ein dauerhafter Worker (lazy gestartet, unref: hält den Prozess nicht am Leben), Aufträge laufen dort
 * nacheinander. Genutzt von den Admin-Wegen (Prüfen, Erzeugen, Ergänzen beim Speichern eines Tages), vom
 * Klassenraum und von „Eigenes Lemma“.
 *
 * Die Warteschlange liegt hier im Hauptprozess, der Worker bekommt immer nur einen Auftrag (Security-Audit
 * run-2): Ein abgelaufener Auftrag wird so gar nicht erst gerechnet, Admin und Klassenraum (Priorität hoch)
 * kommen vor „Eigenes Lemma“ (niedrig), und von niedrigen Aufträgen warten höchstens MAX_WARTEND_NIEDRIG.
 *
 * Nie worker.terminate(): Trifft das Beenden einen laufenden better-sqlite3-Aufruf, stürzt der ganze Prozess
 * ab (V8 FATAL „Empty MaybeLocal“, im Test nachgestellt). Das Zeitlimit lehnt deshalb nur den Auftrag ab und
 * lässt den Worker weiterrechnen; Beenden geht per Nachricht, die der Worker zwischen zwei Aufträgen annimmt.
 */
import { Worker } from 'node:worker_threads'
import logger from './logger.js'

let ZEITLIMIT_MS = 90_000
const MAX_WARTEND_NIEDRIG = 10

let erzeugeWorker = () => new Worker(new URL('./lueckenfuellerWorker.js', import.meta.url))
let worker = null
let naechsteId = 1
const offen = new Map()   // id → { resolve, reject, timer, lemma, pos }
const warteHoch = []      // ids, noch nicht an den Worker geschickt
const warteNiedrig = []
let laufend = null        // id des Auftrags, den der Worker gerade rechnet

function lehneAlleAb(fehler) {
  for (const { reject, timer } of offen.values()) {
    clearTimeout(timer)
    reject(fehler)
  }
  offen.clear()
  warteHoch.length = 0
  warteNiedrig.length = 0
  laufend = null
}

function schickeNaechsten() {
  if (laufend !== null || !worker) return
  const id = warteHoch.length ? warteHoch.shift() : warteNiedrig.shift()
  if (id === undefined) return
  const auftrag = offen.get(id)
  laufend = id
  worker.postMessage({ id, lemma: auftrag.lemma, pos: auftrag.pos })
}

function entferne(liste, id) {
  const i = liste.indexOf(id)
  if (i >= 0) liste.splice(i, 1)
}

function starte() {
  const w = erzeugeWorker()
  w.unref?.()
  w.on('message', ({ id, runden, fehler }) => {
    if (id === laufend) laufend = null
    const auftrag = offen.get(id)
    if (auftrag) {   // sonst schon abgelaufen oder abgelehnt
      offen.delete(id)
      clearTimeout(auftrag.timer)
      if (fehler) auftrag.reject(new Error(fehler))
      else auftrag.resolve(runden ?? null)
    }
    schickeNaechsten()
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

/**
 * Wie buildLueckenfueller(lemma, pos), aber im Worker-Thread.
 * prioritaet 'niedrig' für Nutzerwege (Eigenes Lemma): kommt nach allen hohen Aufträgen und wird sofort
 * abgelehnt (err.code LUECKENFUELLER_AUSGELASTET), wenn schon MAX_WARTEND_NIEDRIG niedrige warten.
 */
export function buildLueckenfuellerImWorker(lemma, pos, { prioritaet = 'hoch' } = {}) {
  if (!worker) worker = starte()
  const niedrig = prioritaet === 'niedrig'
  if (niedrig && warteNiedrig.length >= MAX_WARTEND_NIEDRIG) {
    const err = new Error('Gerade laufen viele Lückenfüller-Berechnungen. Bitte versuch es gleich noch einmal.')
    err.code = 'LUECKENFUELLER_AUSGELASTET'
    return Promise.reject(err)
  }
  const id = naechsteId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      offen.delete(id)
      entferne(warteHoch, id)
      entferne(warteNiedrig, id)
      logger.warn({ lemma, pos }, 'Lückenfüller-Worker: Zeitlimit überschritten')
      reject(new Error('Die Lückenfüller-Berechnung hat zu lange gedauert.'))
    }, ZEITLIMIT_MS)
    timer.unref?.()
    offen.set(id, { resolve, reject, timer, lemma, pos })
    ;(niedrig ? warteNiedrig : warteHoch).push(id)
    schickeNaechsten()
  })
}

/** Nur für Tests: Worker-Attrappe und kurzes Zeitlimit; ohne Argumente zurück zum echten Worker. */
export function setzeWorkerFuerTests(fabrik, { zeitlimitMs } = {}) {
  beendeLueckenfuellerWorker()
  erzeugeWorker = fabrik ?? (() => new Worker(new URL('./lueckenfuellerWorker.js', import.meta.url)))
  ZEITLIMIT_MS = zeitlimitMs ?? 90_000
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
