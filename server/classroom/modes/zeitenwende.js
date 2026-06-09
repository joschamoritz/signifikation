/**
 * server/classroom/modes/zeitenwende.js
 *
 * Modus „Zeitenwende" — gebuendeltes Modus-Wissen (Code-Review P2).
 * 10 Woerter, je 'pre'/'post' (vor/nach 2000) einschaetzen.
 */

import { scoreZeitenwende } from '../scoring/index.js'
import { resolveZeitenwende } from '../content.js'
import { parseJsonSafe } from '../json-safe.js'
import { zwPeriodLabel, itemRow } from './_format.js'

export default {
  id: 'zeitenwende',

  score(contentSnapshot, rawAnswer /*, roundIndex */) {
    return scoreZeitenwende(contentSnapshot, rawAnswer)
  },

  async buildSnapshotEntry(lemma, deps) {
    // Vereinheitlichung (Option A): Zeitenwende IMMER live aus wortprofil.db
    // (fetchZeitenwende), Fallback aufs gespeicherte runden.zeitenwende-Feld.
    const words = await resolveZeitenwende(lemma, {
      fetchZeitenwende: deps.fetchZeitenwende,
      logWarn: (err, l) =>
        deps.logger?.warn({ err, lemma: l }, 'cr2 fetchZeitenwende fehlgeschlagen — Fallback aufs gespeicherte Feld'),
    })
    return {
      lemma:  lemma.lemma,
      ipa:    lemma.ipa,
      words,
    }
  },

  buildSafePrompt(snapshot) {
    return {
      // WHITELIST: nur Wort-Strings, KEINE periode
      words: (snapshot.words || []).map(w => String(w.wort || '')).filter(Boolean),
    }
  },

  extractDistractors(row) {
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    if (!detail) return []
    // detail ist das Array der Wort-Einschaetzungen.
    const arr = Array.isArray(detail) ? detail : []
    return arr
      .filter((d) => d && d.correct === false && d.wort)
      .map((d) => String(d.wort))
  },

  extractPicks(/* row */) {
    return []
  },

  extractItems(row) {
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    if (!detail) return []
    const arr = Array.isArray(detail) ? detail : []
    return arr
      .filter((d) => d && d.wort)
      .map((d) => ({ key: String(d.wort), isCorrect: d.correct === true }))
  },

  buildDistribution(snapshot, agg /*, denom */) {
    const words = Array.isArray(snapshot?.words) ? snapshot.words : []
    if (words.length === 0) return null
    return words.map((w) => {
      const period = w.periode === 'pre' ? 'vor 2000' : w.periode === 'post' ? 'nach 2000' : null
      return itemRow(agg, String(w.wort), String(w.wort), period)
    })
  },

  buildRevealItems(detail /*, snapshot */) {
    const arr = Array.isArray(detail) ? detail : []
    const items = arr.map((d) => ({
      label: String(d.wort), you: zwPeriodLabel(d.given), correct: d.correct === true,
      solution: zwPeriodLabel(d.expected),
    }))
    return { items, solution: null }
  },
}
