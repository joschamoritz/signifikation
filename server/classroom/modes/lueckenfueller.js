/**
 * server/classroom/modes/lueckenfueller.js
 *
 * Modus „Lueckenfueller" — gebuendeltes Modus-Wissen (Code-Review P2).
 * Besonderheit: mehrere Runden pro Lemma (round_index). Drei Runden-Typen
 * (choice/double/free) mit je eigener Whitelist + Scoring.
 */

import { scoreLueckenfueller } from '../scoring/index.js'
import { resolveLueckenfueller } from '../content.js'
import { parseJsonSafe } from '../json-safe.js'
import { roundTypeLabel, itemRow } from './_format.js'

// ── Whitelist einer einzelnen Runde (R1) ───────────────────────────
// buildLueckenfueller liefert die Felder `satzMitLuecke` (Satz mit _____) und
// `optionen` — NICHT `sentence`/`options`. NIE `satz` (enthaelt das
// Loesungswort) und NIE `kollokator`/`token` exponieren.
function buildSafeRound(round) {
  if (!round || typeof round !== 'object') return null
  const sentence = round.satzMitLuecke || round.sentence || round.text || ''
  const options  = Array.isArray(round.optionen) ? round.optionen
                 : Array.isArray(round.options)  ? round.options : []
  const base = { type: round.type, sentence }
  if (round.type === 'choice') {
    return { ...base, options }
  }
  if (round.type === 'double') {
    return {
      ...base,
      options,
      // WHITELIST: nur der gelueckte Satz, KEIN kollokator/token
      sentences: (round.sentences || []).map(s => ({
        text: s.satzMitLuecke || s.text || s.sentence || '',
      })),
    }
  }
  // 'free': Schueler tippt, kein Hinweis noetig → nur Satz
  return base
}

export default {
  id: 'lueckenfueller',

  score(contentSnapshot, rawAnswer, roundIndex = 0) {
    const rounds = Array.isArray(contentSnapshot?.rounds) ? contentSnapshot.rounds : []
    return scoreLueckenfueller(rounds[roundIndex], rawAnswer)
  },

  // Gueltige Rundenzahl pro Lemma (mehrere Runden, anders als die Single-Round-
  // Modi). Genutzt zur server-seitigen round_index-Validierung beim Submit.
  roundCount(contentSnapshot) {
    return Array.isArray(contentSnapshot?.rounds) ? contentSnapshot.rounds.length : 0
  },

  async buildSnapshotEntry(lemma, deps) {
    // Vereinheitlichung: Lückenfüller live (buildLueckenfueller, belege.db),
    // Fallback aufs gespeicherte lemma.lueckenfueller.rounds.
    const rounds = await resolveLueckenfueller(lemma, {
      buildLueckenfueller: deps.buildLueckenfueller,
      logWarn: (err, l) =>
        deps.logger?.warn({ err, lemma: l }, 'classroom buildLueckenfueller fehlgeschlagen — Fallback aufs gespeicherte Feld'),
    })
    return {
      lemma:      lemma.lemma,
      ipa:        lemma.ipa,
      definition: lemma.definition || lemma.definitionen?.[0] || '',
      rounds,
    }
  },

  buildSafePrompt(snapshot) {
    return {
      // WHITELIST: pro Runde nur das, was zum Loesen noetig ist
      rounds: (snapshot.rounds || []).map(buildSafeRound),
    }
  },

  extractDistractors(row) {
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    if (!detail) return []
    if (detail.type === 'choice') {
      if (detail.selected != null && String(detail.selected) !== String(detail.kollokator)) {
        return [String(detail.selected)]
      }
      return []
    }
    if (detail.type === 'free') {
      // free hat keinen Distraktor-Pool; nur eine falsche Eingabe zaehlt.
      if (detail.value != null && (Number(row.correct) || 0) === 0) {
        return [String(detail.value)]
      }
      return []
    }
    if (detail.type === 'double') {
      const slots = Array.isArray(detail.slots) ? detail.slots : []
      return slots
        .filter((s) => s && s.correct === false && s.given != null && s.given !== '')
        .map((s) => String(s.given))
    }
    return []
  },

  extractPicks(/* row */) {
    return []
  },

  extractItems(row) {
    // Eine Runde pro Submission (round_index). Gilt als „richtig", wenn Punkte.
    return [{ key: `r${Number(row.round_index) || 0}`, isCorrect: (Number(row.score) || 0) > 0 }]
  },

  buildDistribution(snapshot, agg /*, denom */) {
    const rounds = Array.isArray(snapshot?.rounds) ? snapshot.rounds : []
    if (rounds.length === 0) return null
    return rounds.map((r, i) => {
      const solution = r.kollokator
        || (Array.isArray(r.sentences) ? r.sentences.map((s) => s && s.kollokator).filter(Boolean).join(' / ') : '')
        || `Runde ${i + 1}`
      return itemRow(agg, `r${i}`, String(solution), roundTypeLabel(r.type))
    })
  },

  buildRevealItems(detail /*, snapshot */) {
    if (detail.type === 'choice' || detail.type === 'free') {
      const you = detail.selected ?? detail.value ?? null
      const sol = detail.kollokator != null ? String(detail.kollokator) : null
      return {
        items: [{
          label: sol || '—',
          you: you != null ? String(you) : '—',
          correct: sol != null && String(you ?? '') === sol,
          solution: sol,
        }],
        solution: sol,
      }
    }
    if (detail.type === 'double') {
      const slots = Array.isArray(detail.slots) ? detail.slots : []
      const items = slots.map((s) => ({
        label: s.expected != null ? String(s.expected) : '—',
        you: s.given != null ? String(s.given) : '—',
        correct: s.correct === true,
        solution: s.expected != null ? String(s.expected) : null,
      }))
      return { items, solution: null }
    }
    return { items: [], solution: null }
  },
}
