/**
 * Lückenfüller kommender Tage neu bauen (Admin › Systemzustand).
 *
 * Gespeicherte Runden bleiben, wie sie beim Speichern des Tages erzeugt wurden. Wird die
 * Erzeugung besser (fremde Distraktoren, 30.10.2026), erreicht das die schon geplanten Tage
 * nicht von selbst: „kommende Tage prüfen“ baut nur Wörter mit neu geprüften Paaren neu.
 *
 * Läuft im Hintergrund, ein Wort nach dem anderen im Lückenfüller-Worker (der Hauptprozess
 * bleibt frei). Wörter, die heute oder in der laufenden Woche gespielt werden, bleiben
 * unangetastet. Liefert der Neubau zu wenig Material, bleiben die alten Runden.
 */
import logger from './logger.js'
import { berlinTag } from './date-utils.js'
import { getLemmataIndex, invalidateCache, lemmaToRow, loadDailyContentMaps, stmts as storeStmts } from './store.js'
import { loadAllSpezialwochen } from './store-spezialwochen.js'
import { buildLueckenfuellerImWorker } from './lueckenfuellerImWorker.js'

let lauf = null

/** Stand des letzten oder laufenden Neubaus für den Systemzustand. */
export function lueckenfuellerNeubauStatus() {
  return lauf ? { ...lauf } : { laeuft: false }
}

/**
 * Lemma-IDs der Lückenfüller nach heute: Spieltage und Wort der Woche, das noch nicht begonnen
 * hat. Was heute oder in der laufenden Woche gespielt wird, fehlt – auch wenn es später noch
 * einmal geplant ist.
 */
export function kommendeLueckenfuellerIds(heute = berlinTag()) {
  const { kalender } = loadDailyContentMaps()
  const kommend = new Set()
  const jetzt = new Set()
  for (const [datum, e] of Object.entries(kalender ?? {})) {
    const id = Array.isArray(e) ? '' : e?.lueckenfueller_id
    if (!id) continue
    if (datum > heute) kommend.add(id)
    else if (datum === heute) jetzt.add(id)
  }
  for (const w of loadAllSpezialwochen()) {
    if (!w.lueckenfueller_id) continue
    if (w.von > heute) kommend.add(w.lueckenfueller_id)
    else if (w.bis >= heute) jetzt.add(w.lueckenfueller_id)
  }
  return [...kommend].filter(id => !jetzt.has(id))
}

async function arbeite(ids, stand) {
  for (const id of ids) {
    try {
      const entry = getLemmataIndex().byId.get(id)
      const runden = entry ? await buildLueckenfuellerImWorker(entry.lemma, entry.pos) : null
      if (runden?.length) {
        // frisch lesen: Während der Worker rechnete, kann der Admin das Lemma gespeichert haben
        storeStmts.upsertLemma.run(lemmaToRow({ ...getLemmataIndex().byId.get(id), lueckenfueller: runden }))
        invalidateCache('lemmata.json')
        stand.neu++
      } else {
        stand.unveraendert++
      }
    } catch (err) {
      stand.fehler++
      logger.error({ err }, `Lückenfüller-Neubau: „${id}“ nicht neu gebaut`)
    }
    stand.fertig++
  }
  stand.laeuft = false
  stand.ende = new Date().toISOString()
  logger.info(`Lückenfüller-Neubau: ${stand.neu} von ${stand.gesamt} neu gebaut, ${stand.unveraendert} unverändert, ${stand.fehler} Fehler`)
}

/**
 * Startet den Neubau, falls keiner läuft. Antwortet sofort; der Stand steht danach in
 * `lueckenfuellerNeubauStatus()`. Rückgabe `fertig` ist ein Promise für Tests.
 */
export function starteLueckenfuellerNeubau({ heute } = {}) {
  if (lauf?.laeuft) return { status: 'laeuft', ...lauf }
  const ids = kommendeLueckenfuellerIds(heute)
  lauf = { laeuft: true, gesamt: ids.length, fertig: 0, neu: 0, unveraendert: 0, fehler: 0, beginn: new Date().toISOString(), ende: null }
  const stand = lauf
  const fertig = arbeite(ids, stand)
  logger.info(`Lückenfüller-Neubau gestartet: ${ids.length} Wörter`)
  return { status: 'gestartet', ...stand, fertig }
}
