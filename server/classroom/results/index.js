/**
 * server/classroom/results/index.js
 *
 * Reine Auswertungs-/Reporting-Logik des Klassenraums. Aus store.js
 * herausgezogen (Code-Review P1), damit store.js auf Datenzugriff + Lifecycle
 * fokussiert bleibt. KEINE DB-Zugriffe, KEINE Verhaltensaenderung gegenueber
 * der vorherigen In-store.js-Variante — reine Pure Functions ueber den bereits
 * geladenen Submission-/Score-Zeilen und Content-Snapshots.
 *
 * Pseudonymitaet (D7): keine dieser Funktionen sieht display_name oder eine
 * Teilnehmer-Identitaet — sie arbeiten ausschliesslich auf der fachlichen
 * Bewertung (detail_json) bzw. dem Content-Snapshot.
 */

import { parseJsonSafe } from '../json-safe.js'

// ── Distraktoren / Picks / Items (fuer getSessionResults) ───────────
// Distraktoren / Falschantworten je Submission aus dem (bereits gescorten)
// detail_json ableiten. detail_json haelt KEINE Teilnehmer-Identitaet,
// nur die fachliche Bewertung — damit bleibt die Auswertung pseudonym.
// Rueckgabe: Array der "falschen" Auswahl-Labels dieser Abgabe (mehrfach
// moeglich), die fuer das Distraktor-Ranking gezaehlt werden.
export function extractDistractors(mode, row) {
  const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
  if (!detail) return []
  switch (mode) {
    case 'kollokationen': {
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
    }
    case 'zeitenwende': {
      // detail ist das Array der Wort-Einschaetzungen.
      const arr = Array.isArray(detail) ? detail : []
      return arr
        .filter((d) => d && d.correct === false && d.wort)
        .map((d) => String(d.wort))
    }
    case 'wortzwilling': {
      const zoneA = Array.isArray(detail.zoneA) ? detail.zoneA : []
      const zoneB = Array.isArray(detail.zoneB) ? detail.zoneB : []
      return [...zoneA, ...zoneB]
        .filter((d) => d && d.correct === false && d.word)
        .map((d) => String(d.word))
    }
    case 'lueckenfueller': {
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
    }
    default:
      return []
  }
}

// Alle gewaehlten Optionen einer Kollokationen-Abgabe (nicht nur Distraktoren)
// — Basis fuer die Options-Anteil-Verteilung (kind 'option').
export function extractPicks(mode, row) {
  const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
  if (!detail) return []
  switch (mode) {
    case 'kollokationen': {
      const hits = Array.isArray(detail.hits) ? detail.hits : []
      return hits.filter((h) => h && h.word).map((h) => String(h.word))
    }
    default:
      return []
  }
}

// Pro-Item-Korrektheit einer Abgabe (Wort-Zwilling / Zeitenwende / Lueckenfueller).
// Liefert [{ key, isCorrect }] je beantwortetem Item — Basis fuer die
// Trefferquote-je-Item-Verteilung (kind 'item'). Pseudonym (keine Identitaet).
export function extractItems(mode, row) {
  const detail = parseJsonSafe(row.detail_json, null, { field: 'detail_json' })
  if (!detail) return []
  switch (mode) {
    case 'wortzwilling': {
      const a = Array.isArray(detail.zoneA) ? detail.zoneA : []
      const b = Array.isArray(detail.zoneB) ? detail.zoneB : []
      return [...a, ...b]
        .filter((d) => d && d.word)
        .map((d) => ({ key: String(d.word), isCorrect: d.correct === true }))
    }
    case 'zeitenwende': {
      const arr = Array.isArray(detail) ? detail : []
      return arr
        .filter((d) => d && d.wort)
        .map((d) => ({ key: String(d.wort), isCorrect: d.correct === true }))
    }
    case 'lueckenfueller': {
      // Eine Runde pro Submission (round_index). Gilt als „richtig", wenn Punkte.
      return [{ key: `r${Number(row.round_index) || 0}`, isCorrect: (Number(row.score) || 0) > 0 }]
    }
    default:
      return []
  }
}

export function roundTypeLabel(type) {
  if (type === 'choice') return 'Auswahl'
  if (type === 'free') return 'Freie Eingabe'
  if (type === 'double') return 'Doppellücke'
  return type || ''
}

// logDice als Zahl normalisieren (Snapshot-Feld heisst `log_dice`).
export function lemmaLogDice(k) {
  const v = Number(k?.log_dice)
  return Number.isFinite(v) ? v : null
}

// logDice fuer die Anzeige formatieren: Dezimalpunkt → Komma (de-DE).
export function fmtDice(d) {
  return String(d).replace('.', ',')
}

// Antwortverteilung pro Lemma.
//   kind 'option' (Kollokationen): jede Option mit Wahl-Anteil + Korrektheit;
//     korrekte zuerst (nach Rang), dann uebrige nach Haeufigkeit.
//   kind 'item' (WZ/ZW/LF): jedes Item mit Trefferquote (% richtig); Snapshot-Reihenfolge.
// Pseudonym (reine Zaehlung, D7).
// denom = distinkte Teilnehmer (agg.participants.size). Die Options-Prozente
// (kind 'option') gelten je Teilnehmer, weil pro Teilnehmer jede Option max. 1×
// im picks-Zaehler steht (UNIQUE-Submission je Lemma/Runde — Code-Review H2).
export function buildDistribution(mode, snapshot, agg, denom) {
  if (denom <= 0) return null

  if (mode === 'kollokationen') {
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
  }

  const itemRow = (key, label, sub) => {
    const it = agg.items.get(key)
    const answered = it?.answered || 0
    const correct = it?.correct || 0
    return { label, sub: sub || null, count: correct, pct: answered > 0 ? Math.round((correct / answered) * 100) : 0, kind: 'item' }
  }

  if (mode === 'wortzwilling') {
    const koll = Array.isArray(snapshot?.kollokatoren) ? snapshot.kollokatoren : []
    if (koll.length === 0) return null
    return koll.map((k) => {
      const zone = k.zuordnung === 'A' ? 'Zone A' : k.zuordnung === 'B' ? 'Zone B' : null
      return itemRow(String(k.wort), String(k.wort), zone)
    })
  }

  if (mode === 'zeitenwende') {
    const words = Array.isArray(snapshot?.words) ? snapshot.words : []
    if (words.length === 0) return null
    return words.map((w) => {
      const period = w.periode === 'pre' ? 'vor 2000' : w.periode === 'post' ? 'nach 2000' : null
      return itemRow(String(w.wort), String(w.wort), period)
    })
  }

  if (mode === 'lueckenfueller') {
    const rounds = Array.isArray(snapshot?.rounds) ? snapshot.rounds : []
    if (rounds.length === 0) return null
    return rounds.map((r, i) => {
      const solution = r.kollokator
        || (Array.isArray(r.sentences) ? r.sentences.map((s) => s && s.kollokator).filter(Boolean).join(' / ') : '')
        || `Runde ${i + 1}`
      return itemRow(`r${i}`, String(solution), roundTypeLabel(r.type))
    })
  }

  return null
}

// Haeufigsten Distraktor aus einer Label→Count-Map waehlen.
// Deterministisch: hoechster Count, bei Gleichstand alphabetisch.
export function pickTopDistractor(distractorMap) {
  if (!distractorMap || distractorMap.size === 0) return null
  let best = null
  for (const [label, count] of distractorMap) {
    if (!best || count > best.count || (count === best.count && label.localeCompare(best.label) < 0)) {
      best = { label, count }
    }
  }
  return best
}

// ── Schueler-Aufloesung (fuer getParticipantReveal) ─────────────────
export function zwPeriodLabel(p) {
  return p === 'pre' ? 'vor 2000' : p === 'post' ? 'nach 2000' : '—'
}

export function buildRevealItems(mode, detail, snapshot) {
  if (!detail) return { items: [], solution: null }
  switch (mode) {
    case 'kollokationen': {
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
    }
    case 'wortzwilling': {
      const a = (Array.isArray(detail.zoneA) ? detail.zoneA : []).map((d) => ({
        label: String(d.word), you: 'Zone A', correct: d.correct === true,
        solution: d.expected === 'A' ? 'Zone A' : d.expected === 'B' ? 'Zone B' : null,
      }))
      const b = (Array.isArray(detail.zoneB) ? detail.zoneB : []).map((d) => ({
        label: String(d.word), you: 'Zone B', correct: d.correct === true,
        solution: d.expected === 'A' ? 'Zone A' : d.expected === 'B' ? 'Zone B' : null,
      }))
      return { items: [...a, ...b], solution: null }
    }
    case 'zeitenwende': {
      const arr = Array.isArray(detail) ? detail : []
      const items = arr.map((d) => ({
        label: String(d.wort), you: zwPeriodLabel(d.given), correct: d.correct === true,
        solution: zwPeriodLabel(d.expected),
      }))
      return { items, solution: null }
    }
    case 'lueckenfueller': {
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
    }
    default:
      return { items: [], solution: null }
  }
}
