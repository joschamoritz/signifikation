/**
 * Worker-Thread für die Lückenfüller-Berechnung (Einstieg; gestartet von lueckenfuellerImWorker.js).
 * Öffnet eigene Read-only-Verbindungen zu Wortprofil- und Belege-DB (über die üblichen Module) und
 * arbeitet die Aufträge der Reihe nach ab. Antwort: { id, runden } oder { id, fehler }.
 */
import { parentPort } from 'node:worker_threads'
import { buildLueckenfueller } from './lueckenfueller.js'
import { clearCache } from './query-cache.js'

parentPort.on('message', async (auftrag) => {
  if (auftrag?.typ === 'cache-leeren') {
    clearCache()
    return
  }
  // Kommt erst an die Reihe, wenn kein synchroner DB-Aufruf mehr läuft: sicheres Ende des Threads
  if (auftrag?.typ === 'ende') process.exit(0)
  const { id, lemma, pos } = auftrag
  try {
    const runden = await buildLueckenfueller(lemma, pos)
    parentPort.postMessage({ id, runden })
  } catch (err) {
    parentPort.postMessage({ id, fehler: err?.message || String(err) })
  }
})
