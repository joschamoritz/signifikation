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

const MONTHS = /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/

/**
 * Heuristik-Score: „wirkt das wie ein vollständiger Satz?". Höher = besser.
 * Bestraft typische Korpus-Fragmente (Monats-Reste, Dialog-Präfixe „Name:",
 * Klein-Anfang, Klammer-/Gleichheits-Rauschen) und sehr kurze/lange Sätze.
 */
function scoreBeleg(satz) {
  const s = String(satz ?? '').trim()
  if (!s) return -1e9
  let sc = 0
  const wc = s.split(/\s+/).length
  if (wc < 5) sc -= 25
  else if (wc <= 22) sc += 10 - Math.abs(12 - wc) * 0.4
  else sc -= (wc - 22) * 0.6
  if (/[.!?]['"»)\]]?$/.test(s)) sc += 4         // vollständige Satz-Endung
  if (/^[A-ZÄÖÜ]/.test(s)) sc += 2               // Groß-Anfang
  else sc -= 6                                    // Klein-Anfang → Fragment
  if (MONTHS.test(s)) sc -= 20                    // „Februar eine … treffen." & Co.
  if (/[=()[\]]/.test(s)) sc -= 8                 // Klammern/Gleichheits-Rauschen
  if (/^\p{Lu}[\wäöüß-]*:/u.test(s)) sc -= 6      // „Kiesinger:" Redner-Präfix
  return sc
}

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
        const rows = fetchBelegeRaw(lemma, partner, { limit: 12 })
        if (!rows.length) return null
        // Besten Satz wählen statt blind den ersten: viele Korpus-Belege sind
        // abgeschnittene Fragmente (z. B. „Februar eine Entscheidung treffen.").
        // Wir bevorzugen einen vollständig wirkenden Satz.
        return [...rows].sort((a, b) => scoreBeleg(b.satz) - scoreBeleg(a.satz))[0] ?? rows[0]
      } catch (err) {
        logger.warn({ err, lemma, partner }, 'corpusAdapter: fetchBeleg fehlgeschlagen (DB fehlt?)')
        return null
      }
    },
    // Mehrere möglichst vollständige Belegsätze (AP21-QA „Anschaulichkeit"):
    // Relevanz-Pool holen, nach Vollständigkeit sortieren, die besten `limit` nehmen.
    fetchBelege(lemma, partner, { limit = 3 } = {}) {
      if (!lemma || !partner) return []
      try {
        const rows = fetchBelegeRaw(lemma, partner, { limit: 15 })
        return [...rows]
          .sort((a, b) => scoreBeleg(b.satz) - scoreBeleg(a.satz))
          .slice(0, limit)
      } catch (err) {
        logger.warn({ err, lemma, partner }, 'corpusAdapter: fetchBelege fehlgeschlagen (DB fehlt?)')
        return []
      }
    },
  }
}

export default makeCorpusAdapter
