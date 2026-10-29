/**
 * Worker-Thread: Kandidatensätze für die Belegprüfung (gestartet von kandidatenImWorker.js).
 * Die Pools kommen synchron aus belege_v2.db (better-sqlite3, 0,6–2,7 s je Paar gemessen) –
 * im Hauptprozess stünde dabei der ganze Server. Eigene Read-only-Verbindung über belege.js.
 * Antwort: { id, stand, paare: [{ basis, kollokator, saetze: [[id, satz], …] }] } oder { id, fehler }.
 */
import { parentPort } from 'node:worker_threads'
import { fetchBelegKandidaten, belegeStand } from '../belege.js'

parentPort.on('message', (auftrag) => {
  // Kommt erst an die Reihe, wenn kein synchroner DB-Aufruf mehr läuft: sicheres Ende des Threads
  if (auftrag?.typ === 'ende') process.exit(0)
  const { id, paare, ziel } = auftrag
  try {
    const ergebnis = paare.map(({ basis, kollokator }) => ({
      basis,
      kollokator,
      saetze: fetchBelegKandidaten(basis, kollokator, { ziel }).map(r => [r.id, r.satz]),
    }))
    parentPort.postMessage({ id, stand: belegeStand(), paare: ergebnis })
  } catch (err) {
    parentPort.postMessage({ id, fehler: err?.message || String(err) })
  }
})
