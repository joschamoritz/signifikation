/**
 * server/jobs/zeitenwendePrefetch.js
 *
 * Vorwärmen des Wiktionary-Caches für die Zeitenwende des Tages.
 *
 * Problem (Audit 2026-06-15, #6): /api/v1/zeitenwende holt IPA + Definitionen
 * beim ERSTEN Tagesaufruf synchron-blockierend von de.wiktionary.org (bis ~6 s
 * TTFB, AbortSignal-Timeout). Der erste echte Nutzer des Tages zahlt diese
 * Latenz, danach liefert der Beleg-Cache (cacheGet/cacheSet) den Treffer.
 *
 * Lösung: Den Cache proaktiv füllen — beim Server-Start (Boot-Warm) und per
 * Cron mehrmals täglich. Der Beleg-Cache hat 6 h TTL; darum re-warmen wir alle
 * 6 h (Minute 1), damit sowohl der Mitternachts-Rollover (neues Tageslemma ab
 * 00:01) als auch die Morgen-Stoßzeit (Push 08:00) auf einen gefüllten Cache
 * treffen. Der Job ist date-aware (zielt immer auf das heutige Berlin-Datum),
 * idempotent (überspringt bereits gewärmte Keys) und neustart-fest.
 */

import cron from 'node-cron'
import logger from '../logger.js'
import { loadZeitenwendeEntry, cacheGet, cacheSet } from '../store.js'
import { fetchWiktionary } from '../wiktionary.js'

const TIMEZONE = process.env.TIMEZONE || 'Europe/Berlin'

function todayDatum(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(now)
}

/**
 * Wärmt den Wiktionary-Cache für das heutige Zeitenwende-Lemma vor.
 * Verwendet exakt denselben Cache-Key (`wikt:<lemma>`) wie der Endpunkt in
 * routes/public.js, damit der erste echte Aufruf einen Cache-Hit bekommt.
 * @returns {Promise<boolean>} true, wenn frisch gefetcht/gewärmt wurde
 */
export async function prefetchZeitenwendeWiktionary(now = new Date()) {
  const datum = todayDatum(now)
  const entry = loadZeitenwendeEntry(datum)
  if (!entry?.lemma) return false

  const cacheKey = `wikt:${entry.lemma}`
  if (cacheGet(cacheKey)) return false // bereits warm – kein externer Fetch nötig

  const wikt = await fetchWiktionary(entry.lemma)
  cacheSet(cacheKey, wikt)
  logger.info({ lemma: entry.lemma, datum }, 'Zeitenwende-Wiktionary vorgewärmt')
  return true
}

/**
 * Startet den Prefetch: sofort beim Boot + Cron alle 6 h (Minute 1).
 * Gibt das cron-Task-Objekt zurück.
 */
export function startZeitenwendePrefetch() {
  const task = cron.schedule('1 */6 * * *', () => {
    prefetchZeitenwendeWiktionary().catch(err =>
      logger.warn({ err }, 'Zeitenwende-Prefetch (cron) fehlgeschlagen')
    )
  }, { timezone: TIMEZONE })

  // Boot-Warm: läuft fire-and-forget, blockiert den Server-Start nicht.
  prefetchZeitenwendeWiktionary().catch(err =>
    logger.warn({ err }, 'Zeitenwende-Prefetch (boot) fehlgeschlagen')
  )

  logger.info('Zeitenwende-Prefetch gestartet (Boot + alle 6 h, Europe/Berlin)')
  return task
}

export default startZeitenwendePrefetch
