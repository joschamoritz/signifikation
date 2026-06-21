/**
 * server/course/corpusAdapter.js
 *
 * Bindet die echten Korpus-DBs (wortprofil.db via queryRelation, belege.db via
 * fetchBelegeRaw) an die reine resolve.js-Logik. Synchron (better-sqlite3),
 * passend zum 1-Prozess-Deployment.
 *
 * Aus pdf/generate.js (AP5) herausgelöst, damit sowohl die PDF-Pipeline als auch
 * die interaktive Kurs-API (AP8) denselben Adapter nutzen — ohne dass die
 * Request-Route das ganze PDF-Modul (html-Builder, Playwright-Renderer) zieht.
 *
 * Robust gegen fehlende DBs: queryRelation/fetchBeleg fangen Fehler ab und
 * liefern leere Ergebnisse (corpus-Items lösen dann strukturell gültig, aber
 * ohne Korpuswerte auf — kein harter Abbruch).
 */

import logger from '../logger.js'
import { queryRelation } from '../wortprofil.js'
import { fetchBelegeRaw } from '../belege.js'

/** Echter Korpus-Adapter (wortprofil.db + belege.db). */
export function makeCorpusAdapter() {
  return {
    queryRelation(q) {
      try {
        const limit = q.limit ?? 30
        let rows = queryRelation(q.lemma, q.pos, q.relation, Math.max(limit, 30), q.minFrequency ?? 5, q.minLogDice ?? 0)
        if (q.filter?.singleWordOnly) rows = rows.filter(r => !/\s/.test(r.lemma))
        if (q.filter?.depPos) rows = rows.filter(r => r.pos === q.filter.depPos)
        if (Array.isArray(q.exclude) && q.exclude.length) rows = rows.filter(r => !q.exclude.includes(r.lemma))
        return rows.slice(0, limit)
      } catch (err) {
        logger.warn({ err, lemma: q?.lemma }, 'corpusAdapter: queryRelation fehlgeschlagen (DB fehlt?)')
        return []
      }
    },
    fetchBeleg(lemma, partner) {
      if (!lemma || !partner) return null
      try {
        const rows = fetchBelegeRaw(lemma, partner, { limit: 5 })
        return rows[0] ?? null
      } catch (err) {
        logger.warn({ err, lemma, partner }, 'corpusAdapter: fetchBeleg fehlgeschlagen (DB fehlt?)')
        return null
      }
    },
  }
}

export default makeCorpusAdapter
