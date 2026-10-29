/**
 * server/course/belegPaare.js
 *
 * Die Wortpaare, für die der Kurs Belegsätze zeigt – damit die Belegprüfung sie vorab prüfen
 * kann (belegPruefung/index.js). Die Kurs-Inhalte sind kuratiert und pro Prozess fest; die
 * Partner füllt resolve.js aber erst beim Auflösen aus dem Wortprofil („stärkster Partner“).
 * Darum werden alle Stationsaufgaben einmal aufgelöst und die Belegabfragen mitgeschrieben,
 * statt die Paare aus den Payloads abzulesen.
 */

import logger from '../logger.js'
import { makeCorpusAdapter } from './corpusAdapter.js'
import { resolveItemInteractive } from './resolve.js'
import { listStations, listTasks, taskToEngineItem } from './store.js'

/** @returns {Array<{basis:string, kollokator:string}>} */
export function kursBelegPaare() {
  const paare = new Map()
  const merke = (basis, kollokator) => {
    if (basis && kollokator) paare.set(`${basis}\u0000${kollokator}`.toLowerCase(), { basis, kollokator })
  }
  // Wortprofil echt (füllt die Partner), Belegabfragen nur mitschreiben
  const corpus = {
    ...makeCorpusAdapter(),
    fetchBeleg: (lemma, partner) => { merke(lemma, partner); return null },
    fetchBelege: (lemma, partner) => { merke(lemma, partner); return [] },
  }
  for (const station of listStations()) {
    for (const task of listTasks(station.id)) {
      try {
        resolveItemInteractive(taskToEngineItem(task), { corpus })
      } catch (err) {
        logger.warn({ err, taskId: task.id }, 'Kurs-Belegpaare: Aufgabe nicht auflösbar')
      }
    }
  }
  return [...paare.values()]
}
