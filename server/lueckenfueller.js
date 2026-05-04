/**
 * lueckenfueller.js – Content-Selektion für den Lückenfüller-Spielmodus
 *
 * Baut für ein Lemma 3 Runden mit echten Korpussätzen auf:
 *   - Runde 1 (2 Pkt, leicht):  stärkster Kollokator, Distraktoren deutlich schwächer
 *   - Runde 2 (3 Pkt, mittel):  zweitstärkster, #1 als Distraktor
 *   - Runde 3 (5 Pkt, schwer):  drittstärkster, #1 + #2 als Distraktoren
 *
 * Relation je POS:
 *   Substantiv → ~OBJA (Verben, die das Substantiv als Akkusativobjekt haben)
 *   Verb       → OBJA  (Nomen als Akkusativobjekt des Verbs)
 *   Adjektiv   → ~ATTR (Nomen, die das Adjektiv attributiv modifiziert)
 *
 * Blanking: FTS5 findet Sätze mit exaktem Token-Match (case-insensitiv).
 * Verben erscheinen dort als Infinitiv (zu-Konstruktionen), Adjektive
 * in uninflektierter Adverbialform – beide lassen sich exakt blanken.
 */

import { fetchRelation } from './wortprofil.js'
import { fetchBelegeRaw } from './belege.js'
import logger from './logger.js'

const LF_RELATIONS = {
  Substantiv: ['~OBJA', '~SUBJA'],
  Verb:       ['OBJA'],
  Adjektiv:   ['~ATTR'],
}

const MIN_LOG_DICE   = 5.0
const MIN_POOL_SIZE  = 4
const TARGET_ROUNDS  = 3
const PUNKTE         = [2, 3, 5]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Ersetzt den exakten Lemmatoken eines Kollokators im Satz durch '_____'.
 * Gibt den Satz mit Lücke zurück oder null wenn der Token nicht gefunden wird.
 * Setzt darauf, dass FTS5 nur Sätze liefert, in denen der Token exakt auftaucht
 * (Infinitiv bei Verben, uninflektiert bei Adjektiven in Adverbialstellung).
 */
function blankCollocate(satz, depLemma) {
  const lower = depLemma.toLowerCase()
  const parts = satz.split(/(\s+)/)
  let found = false
  const result = parts.map(part => {
    if (found || /^\s+$/.test(part)) return part
    const clean = part.replace(/[.,;:!?„"""''()[\]–—»«‹›]/g, '').toLowerCase()
    if (clean === lower) {
      found = true
      return '_____'
    }
    return part
  })
  return found ? result.join('') : null
}

/**
 * Wählt 3 Distraktoren aus dem Pool – mit aufsteigender Schwierigkeit je Runde.
 * Runde 0 (leicht):  Distraktoren aus Rang 4–7 (deutlicher logDice-Abstand)
 * Runde 1 (mittel):  #1-Kollokator als Distraktor + zwei weitere
 * Runde 2 (schwer):  #1 + #2 als Distraktoren + einer aus Rang 4+
 */
function pickDistractors(roundIdx, target, roundTargets, pool) {
  const exclude = new Set([target.lemma, ...roundTargets.map(r => r.lemma)])
  const others = pool.filter(c => !exclude.has(c.lemma))

  if (roundIdx === 0) {
    return others.slice(3, 6).slice(0, 3)
  }
  if (roundIdx === 1) {
    const forced = [roundTargets[0]]
    const rest = others.filter(c => c.lemma !== roundTargets[0].lemma).slice(1, 3)
    return [...forced, ...rest].slice(0, 3)
  }
  // roundIdx === 2
  const forced = roundTargets.slice(0, 2)
  const rest = others.filter(c => !forced.some(f => f.lemma === c.lemma)).slice(0, 1)
  return [...forced, ...rest].slice(0, 3)
}

/**
 * Baut 3 Lückenfüller-Runden für ein Lemma auf.
 * Gibt Array mit 3 Runden-Objekten zurück oder null wenn nicht genug Material.
 */
export async function buildLueckenfueller(lemma, pos) {
  const relCodes = LF_RELATIONS[pos] ?? LF_RELATIONS.Substantiv

  // Kollokatoren über alle relevanten Relationen sammeln
  const results = await Promise.allSettled(
    relCodes.map(rel => fetchRelation(lemma, pos, rel))
  )

  const seen = new Map()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const item of r.value) {
      const key = item.lemma.toLowerCase()
      const existing = seen.get(key)
      if (!existing || parseFloat(item.logDice) > parseFloat(existing.logDice)) {
        seen.set(key, item)
      }
    }
  }

  const pool = [...seen.values()]
    .filter(item => parseFloat(item.logDice) >= MIN_LOG_DICE && !item.lemma.includes(' '))
    .sort((a, b) => parseFloat(b.logDice) - parseFloat(a.logDice))

  if (pool.length < MIN_POOL_SIZE) {
    logger.debug({ lemma, pos, poolSize: pool.length }, 'Lückenfüller: Pool zu klein')
    return null
  }

  // Für jeden Kollokator in Reihenfolge: ersten blankbaren Satz suchen
  const roundTargets = []
  for (const target of pool) {
    if (roundTargets.length >= TARGET_ROUNDS) break

    const belege = fetchBelegeRaw(lemma, target.lemma, { limit: 20 })
    let found = null
    for (const b of belege) {
      const satzMitLuecke = blankCollocate(b.satz, target.lemma)
      if (satzMitLuecke) {
        found = { satz: b.satz, satzMitLuecke, quelle: b.quelle }
        break
      }
    }
    if (!found) continue

    roundTargets.push({ ...target, ...found })
  }

  if (roundTargets.length < TARGET_ROUNDS) {
    logger.debug({ lemma, pos, found: roundTargets.length }, 'Lückenfüller: nicht genug Sätze')
    return null
  }

  // Runden mit Distraktoren und Punkten aufbauen
  return roundTargets.map((target, i) => {
    const distractors = pickDistractors(i, target, roundTargets, pool)

    // Fallback: fehlende Distraktoren aus dem Rest des Pools auffüllen
    const distSet = new Set(distractors.map(d => d.lemma))
    distSet.add(target.lemma)
    while (distractors.length < 3) {
      const extra = pool.find(c => !distSet.has(c.lemma))
      if (!extra) break
      distractors.push(extra)
      distSet.add(extra.lemma)
    }

    return {
      kollokator:    target.lemma,
      logDice:       parseFloat(parseFloat(target.logDice).toFixed(1)),
      satz:          target.satz,
      satzMitLuecke: target.satzMitLuecke,
      quelle:        target.quelle,
      punkte:        PUNKTE[i],
      optionen:      shuffle([target.lemma, ...distractors.map(d => d.lemma)]),
    }
  })
}
