/**
 * wortzwilling.js – Wort-Zwilling-Abfrage über DWDS-Wortprofil
 *
 * Strategie: Zwei separate Wortprofile abrufen, logDice-Scores vergleichen.
 * Hohe positive Differenz (A - B) → charakteristisch für Wort A.
 * Hohe negative Differenz → charakteristisch für Wort B.
 */

import { fetchRelation, POS_ROUNDS } from './dwds.js'

/** Aggregiert alle Relationen eines Wortes zu einem collocate→maxLogDice Map. */
async function buildProfile(lemma, pos) {
  const rounds = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
  const results = await Promise.allSettled(
    rounds.map(r => fetchRelation(lemma, pos, r.relCode))
  )
  const map = new Map()
  for (let i = 0; i < rounds.length; i++) {
    const r = results[i]
    if (r.status !== 'fulfilled') {
      console.warn(`WortZwilling: Relation ${rounds[i].relCode} fehlgeschlagen für ${lemma}:`, r.reason?.message)
      continue
    }
    for (const item of r.value) {
      const ld  = parseFloat(item.logDice)
      const cur = map.get(item.lemma) || 0
      if (ld > cur) map.set(item.lemma, ld)
    }
  }
  return map
}

/**
 * Berechnet ein Wort-Zwilling-Datensatz für wortA vs. wortB.
 * Gibt null zurück wenn nicht genug distinkte Kollokatoren gefunden werden.
 *
 * Rückgabeformat:
 * {
 *   wortA, wortB, pos,
 *   kollokatoren: [{ wort, zuordnung: 'A'|'B', scoreA, scoreB }]  // 5 pro Seite
 * }
 */
export async function fetchWortZwilling(wortA, wortB, pos = 'Substantiv') {
  const [profA, profB] = await Promise.all([
    buildProfile(wortA, pos),
    buildProfile(wortB, pos),
  ])

  const wortALower = wortA.toLowerCase()
  const wortBLower = wortB.toLowerCase()
  const wortAStamm = wortALower.slice(0, 4)
  const wortBStamm = wortBLower.slice(0, 4)

  // Alle Kandidaten beider Profile zusammenführen
  const allWords = new Set([...profA.keys(), ...profB.keys()])
  const candidates = []
  for (const w of allWords) {
    const wl = w.toLowerCase()
    if (wl === wortALower || wl === wortBLower) continue
    if (wl.startsWith(wortAStamm) || wl.startsWith(wortBStamm)) continue
    if (w.includes(' ') || w.endsWith('-') || w.length <= 2) continue

    const scoreA = profA.get(w) || 0
    const scoreB = profB.get(w) || 0
    candidates.push({ wort: w, scoreA, scoreB, diff: scoreA - scoreB })
  }

  // Sortieren: hoch → typisch für A, niedrig → typisch für B
  const byDiffDesc = [...candidates].sort((a, b) => b.diff - a.diff)
  const byDiffAsc  = [...candidates].sort((a, b) => a.diff - b.diff)

  // Top-5 für A: deutlich positiver Diff
  const top5A = []
  for (const c of byDiffDesc) {
    if (top5A.length >= 5) break
    if (c.diff < 0.5) break  // zu wenig Unterschied
    top5A.push(c)
  }

  // Top-5 für B: deutlich negativer Diff, kein Overlap mit A
  const usedInA = new Set(top5A.map(c => c.wort))
  const top5B = []
  for (const c of byDiffAsc) {
    if (top5B.length >= 5) break
    if (c.diff > -0.5) break // zu wenig Unterschied
    if (usedInA.has(c.wort)) continue
    top5B.push(c)
  }

  if (top5A.length < 5 || top5B.length < 5) {
    console.warn(`WortZwilling: Nicht genug distinkte Kollokatoren für „${wortA}" / „${wortB}" (A: ${top5A.length}/5, B: ${top5B.length}/5)`)
    return null
  }

  const kollokatoren = [
    ...top5A.map(c => ({ wort: c.wort, zuordnung: 'A', scoreA: c.scoreA, scoreB: c.scoreB })),
    ...top5B.map(c => ({ wort: c.wort, zuordnung: 'B', scoreA: c.scoreA, scoreB: c.scoreB })),
  ]

  console.log(`  WortZwilling ${wortA}/${wortB}: A=[${top5A.map(c=>c.wort).join(',')}] B=[${top5B.map(c=>c.wort).join(',')}]`)
  return { wortA, wortB, pos, kollokatoren }
}
