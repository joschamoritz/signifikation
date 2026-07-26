/**
 * server/classroom/modes/wortzwilling.js
 *
 * Modus „Wort-Zwilling“ — gebuendeltes Modus-Wissen (Code-Review P2).
 * Besonderheit: paar-basiert (wortA/wortB) statt lemma-basiert; der
 * content_snapshot kennt beide Quellen (Live-Paar via wzPair, Fallback aufs
 * gespeicherte Feld).
 */

import { scoreWortzwilling } from '../scoring/index.js'
import { resolveWortzwilling } from '../content.js'
import { parseJsonSafe } from '../json-safe.js'
import { itemRow } from './_format.js'

export default {
  id: 'wortzwilling',

  score(contentSnapshot, rawAnswer /*, roundIndex */) {
    return scoreWortzwilling(contentSnapshot, rawAnswer)
  },

  async buildSnapshotEntry(lemma, deps) {
    const r = lemma.runden || {}
    if (r.wzPair) {
      // Paar-Flow (Vereinheitlichung): live aus wortprofil.db.
      const koll = await resolveWortzwilling(r.wzPair, {
        fetchWortZwilling: deps.fetchWortZwilling,
        logWarn: (err, paar) =>
          deps.logger?.warn({ err, paar }, 'classroom fetchWortZwilling fehlgeschlagen'),
      })
      return {
        lemma:        lemma.lemma,
        ipa:          lemma.ipa,
        definition:   lemma.definition || lemma.definitionen?.[0] || '',
        wortA:        r.wzPair.wortA,
        wortB:        r.wzPair.wortB,
        kollokatoren: koll,
      }
    }
    // Rueckwaertskompat: gespeichertes runden.wortzwilling-Feld.
    const wz = r.wortzwilling || r
    return {
      lemma:        lemma.lemma,
      ipa:          lemma.ipa,
      definition:   lemma.definition || lemma.definitionen?.[0] || '',
      wortA:        wz.wortA || lemma.lemma,
      wortB:        wz.wortB || '',
      kollokatoren: wz.kollokatoren || [],
    }
  },

  buildSafePrompt(snapshot) {
    return {
      // WHITELIST: wortA, wortB, Wort-Strings, KEINE zuordnung
      wortA: snapshot.wortA || '',
      wortB: snapshot.wortB || '',
      words: (snapshot.kollokatoren || []).map(k => String(k.wort || '')).filter(Boolean),
    }
  },

  extractDistractors(row) {
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    if (!detail) return []
    const zoneA = Array.isArray(detail.zoneA) ? detail.zoneA : []
    const zoneB = Array.isArray(detail.zoneB) ? detail.zoneB : []
    return [...zoneA, ...zoneB]
      .filter((d) => d && d.correct === false && d.word)
      .map((d) => String(d.word))
  },

  extractPicks(/* row */) {
    return []
  },

  extractItems(row) {
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    if (!detail) return []
    const a = Array.isArray(detail.zoneA) ? detail.zoneA : []
    const b = Array.isArray(detail.zoneB) ? detail.zoneB : []
    return [...a, ...b]
      .filter((d) => d && d.word)
      .map((d) => ({ key: String(d.word), isCorrect: d.correct === true }))
  },

  buildDistribution(snapshot, agg /*, denom */) {
    const koll = Array.isArray(snapshot?.kollokatoren) ? snapshot.kollokatoren : []
    if (koll.length === 0) return null
    return koll.map((k) => {
      const zone = k.zuordnung === 'A' ? 'Zone A' : k.zuordnung === 'B' ? 'Zone B' : null
      return itemRow(agg, String(k.wort), String(k.wort), zone)
    })
  },

  buildRevealItems(detail /*, snapshot */) {
    const a = (Array.isArray(detail.zoneA) ? detail.zoneA : []).map((d) => ({
      label: String(d.word), you: 'Zone A', correct: d.correct === true,
      solution: d.expected === 'A' ? 'Zone A' : d.expected === 'B' ? 'Zone B' : null,
    }))
    const b = (Array.isArray(detail.zoneB) ? detail.zoneB : []).map((d) => ({
      label: String(d.word), you: 'Zone B', correct: d.correct === true,
      solution: d.expected === 'A' ? 'Zone A' : d.expected === 'B' ? 'Zone B' : null,
    }))
    return { items: [...a, ...b], solution: null }
  },
}
