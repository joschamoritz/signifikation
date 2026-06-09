/**
 * server/classroom/modes/kollokationen.js
 *
 * Modus „Kollokationen" — gebuendeltes Modus-Wissen (Code-Review P2).
 * Ein Objekt mit allen Pflicht-Funktionen, die die Klassenraum-Pipeline pro
 * Modus braucht: Scoring, Content-Snapshot, Schueler-Whitelist, Reporting,
 * Reveal. Reine Funktionen + Delegation an die bestehenden Bausteine
 * (scoring/, content.js) — KEINE Verhaltensaenderung gegenueber den frueher
 * verstreuten switch-Bloecken.
 */

import { scoreKollokationen } from '../scoring/index.js'
import { resolveKollokatoren } from '../content.js'
import { parseJsonSafe } from '../json-safe.js'
import { lemmaLogDice, fmtDice } from './_format.js'

export default {
  id: 'kollokationen',

  // ── Scoring (R6, server-autoritativ) ──────────────────────────────
  score(contentSnapshot, rawAnswer /*, roundIndex */) {
    return scoreKollokationen(contentSnapshot, rawAnswer)
  },

  // ── Content-Snapshot (eingefroren beim Anlegen, D4) ───────────────
  async buildSnapshotEntry(lemma, deps) {
    // Kollokatoren IMMER live aus wortprofil.db (fetchLemma → buildMixedRound),
    // Fallback auf gespeichertes Feld. Gemischt (Top-3 nicht oben).
    const kollokatoren = await resolveKollokatoren(lemma, {
      fetchLemma: deps.fetchLemma,
      logWarn: (err, l) =>
        deps.logger?.warn({ err, lemma: l }, 'cr2 fetchLemma Kollokationen fehlgeschlagen — Fallback aufs gespeicherte Feld'),
    })
    return {
      lemma:       lemma.lemma,
      ipa:         lemma.ipa,
      // Aufgeloeste, oeffentliche Definition (Fallback auf erste definitionen-
      // Eintrag) — der content_snapshot ist seit P3 die alleinige View-Quelle.
      definition:  lemma.definition || lemma.definitionen?.[0] || '',
      kollokatoren,
    }
  },

  // ── Schueler-Whitelist (R1) ───────────────────────────────────────
  buildSafePrompt(snapshot) {
    return {
      // WHITELIST: nur Wort-Strings, KEIN rang (wuerde Ranking verraten)
      words:      (snapshot.kollokatoren || []).map(k => String(k.wort || '')).filter(Boolean),
      definition: snapshot.definition || '',
    }
  },

  // ── Reporting (pseudonym, D7) ─────────────────────────────────────
  extractDistractors(row) {
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    if (!detail) return []
    // hits: [{ word, rang, points }] — als Distraktor gilt eine gewaehlte,
    // aber nicht optimale Kollokation (Rang > 3 ⇒ points < 3). Der haeufigste
    // ist der groesste "Stolperstein".
    // rang != null schliesst „nicht gefundene" Phantom-Picks aus (Scoring
    // setzt rang:null/points:0 fuer Woerter ausserhalb der Optionen) — sonst
    // verschmutzen sie die Distraktor-Statistik (Code-Review M2).
    const hits = Array.isArray(detail.hits) ? detail.hits : []
    return hits
      .filter((h) => h && h.word && h.rang != null && (Number(h.points) || 0) < 3)
      .map((h) => String(h.word))
  },

  // Alle gewaehlten Optionen (nicht nur Distraktoren) — Basis fuer die
  // Options-Anteil-Verteilung (kind 'option').
  extractPicks(row) {
    const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
    if (!detail) return []
    const hits = Array.isArray(detail.hits) ? detail.hits : []
    return hits.filter((h) => h && h.word).map((h) => String(h.word))
  },

  // Kollokationen kennt keine Pro-Item-Korrektheit (kind 'item').
  extractItems(/* row */) {
    return []
  },

  // kind 'option': jede Option mit Wahl-Anteil + Korrektheit; korrekte zuerst
  // (nach Rang), dann uebrige nach Haeufigkeit.
  buildDistribution(snapshot, agg, denom) {
    const koll = Array.isArray(snapshot?.kollokatoren) ? snapshot.kollokatoren : []
    if (koll.length === 0) return null
    return koll
      .map((k) => {
        const label = String(k.wort)
        const rang = Number(k.rang) || 99
        const count = agg.picks.get(label) || 0
        return {
          label, rang, correct: rang <= 3, count,
          pct: Math.round((count / denom) * 100),
          logDice: lemmaLogDice(k),
          kind: 'option',
        }
      })
      .sort((x, y) => {
        if (x.correct !== y.correct) return x.correct ? -1 : 1
        if (x.correct) return x.rang - y.rang
        return y.count - x.count || x.label.localeCompare(y.label)
      })
  },

  // ── Schueler-Aufloesung (nach Freigabe, R1) ───────────────────────
  buildRevealItems(detail, snapshot) {
    const koll = Array.isArray(snapshot?.kollokatoren) ? snapshot.kollokatoren : []
    const diceByWord = new Map(koll.map((k) => [String(k.wort), lemmaLogDice(k)]))
    const hits = Array.isArray(detail.hits) ? detail.hits : []
    const items = hits.map((h) => ({
      label: String(h.word),
      you: String(h.word),
      correct: (Number(h.points) || 0) >= 3,
      partial: (Number(h.points) || 0) > 0 && (Number(h.points) || 0) < 3,
      logDice: diceByWord.has(String(h.word)) ? diceByWord.get(String(h.word)) : null,
    }))
    const top3 = koll
      .filter((k) => (Number(k.rang) || 99) <= 3)
      .sort((a, b) => (Number(a.rang) || 99) - (Number(b.rang) || 99))
      .map((k) => {
        const d = lemmaLogDice(k)
        return d != null ? `${k.wort} (${fmtDice(d)})` : String(k.wort)
      })
    return { items, solution: top3.length ? top3.join(', ') : null }
  },
}
