/**
 * lueckenfueller.js – Content-Selektion für den Lückenfüller-Spielmodus
 *
 * Baut bis zu 6 Runden auf:
 *   - Runden 1–4 (type:'choice')  : Auswahl aus 4 Optionen, steigende Schwierigkeit
 *   - Runde 5   (type:'double')   : Zwei Sätze, je eine Lücke — 4 Optionen (2 korrekt)
 *   - Runde 6   (type:'free')     : Freie Texteingabe, keine Optionen
 *
 * Distraktor-Strategie (aufsteigende Schwierigkeit):
 *   R1: Distraktoren aus Pool-Positionen 5–8 (klar schwächere Kollokatoren)
 *   R2: Distraktoren aus Pool-Positionen 4–7
 *   R3: Pool[0] + Pool[1] als Distraktoren (die richtigen Antworten aus R1/R2!)
 *   R4: Pool[0..2] minus Target (alle vorherigen richtigen Antworten als Fallstrick)
 *
 * Punkte: [1, 1, 2, 2, 2, 2] → max. 10
 */

import { fetchRelation } from './wortprofil.js'
import { fetchBelegeRaw } from './belege.js'
import logger from './logger.js'

const LF_RELATIONS = {
  Substantiv: ['~OBJA', '~SUBJA'],
  Verb:       ['OBJA'],
  Adjektiv:   ['~ATTR'],
}

const MIN_LOG_DICE  = 5.0
const MIN_POOL_SIZE = 6
const PUNKTE        = [1, 1, 2, 2, 2, 2]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Ersetzt den ersten passenden Token im Satz durch '_____'.
 * Gibt { satzMitLuecke, token } zurück (token = exakte Wortform) oder null.
 */
function blankCollocate(satz, depLemma) {
  const lower = depLemma.toLowerCase()
  const parts = satz.split(/(\s+)/)
  let found = false
  let foundToken = null
  const result = parts.map(part => {
    if (found || /^\s+$/.test(part)) return part
    const clean = part.replace(/^[.,;:!?„"""''()[\]–—»«‹›]+|[.,;:!?„"""''()[\]–—»«‹›]+$/g, '').toLowerCase()
    if (clean === lower) {
      found = true
      foundToken = part.replace(/^[.,;:!?„"""''()[\]–—»«‹›]+|[.,;:!?„"""''()[\]–—»«‹›]+$/g, '')
      return '_____'
    }
    return part
  })
  if (!found) return null
  return { satzMitLuecke: result.join(''), token: foundToken || depLemma }
}

/**
 * Wählt 3 Distraktoren je Rundenindex.
 * Schwierigkeit steigt dadurch, dass stärkere Kollokatoren (die vorher richtig waren)
 * in späteren Runden als Distraktoren eingesetzt werden.
 */
function pickDistractors(roundIdx, target, pool, choiceTargets) {
  const usedLemmas = new Set(choiceTargets.map(t => t.lemma))
  const notTarget  = pool.filter(c => c.lemma !== target.lemma)
  const weak       = notTarget.filter(c => pool.indexOf(c) >= 5)
  const strong     = notTarget.filter(c => pool.indexOf(c) < 4 && !usedLemmas.has(c.lemma))
  const prevRight  = choiceTargets.filter(t => t.lemma !== target.lemma) // vorherige richtige Antworten

  function padTo3(preferred) {
    const result = [...preferred]
    const seen   = new Set(result.map(r => r.lemma))
    for (const c of [...notTarget]) {
      if (result.length >= 3) break
      if (!seen.has(c.lemma)) { result.push(c); seen.add(c.lemma) }
    }
    return result.slice(0, 3)
  }

  if (roundIdx === 0) return padTo3(weak.slice(0, 3))
  if (roundIdx === 1) return padTo3(weak.slice(1, 4))
  if (roundIdx === 2) return padTo3([...prevRight.slice(0, 2), ...strong.slice(0, 1)])
  // roundIdx === 3: alle vorherigen richtigen Antworten sind Distraktoren
  return padTo3(prevRight.slice(0, 3))
}

/**
 * Findet den ersten blankbaren Beleg für einen Kollokator.
 */
function findBlankableSatz(lemma, target) {
  const belege = fetchBelegeRaw(lemma, target.lemma, { limit: 30 })
  for (const b of belege) {
    const blanked = blankCollocate(b.satz, target.lemma)
    if (blanked) return { satz: b.satz, quelle: b.quelle, ...blanked }
  }
  return null
}

/**
 * Baut bis zu 6 Lückenfüller-Runden für ein Lemma auf.
 * Gibt Array mit Runden-Objekten zurück oder null wenn nicht genug Material.
 */
export async function buildLueckenfueller(lemma, pos) {
  const relCodes = LF_RELATIONS[pos] ?? LF_RELATIONS.Substantiv

  // Kollokatoren über alle relevanten Relationen sammeln und deduplizieren
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

  // Blankbare Sätze für die stärksten Pool-Mitglieder suchen (max. 10 versuchen)
  const targets = []
  for (const candidate of pool.slice(0, 10)) {
    const found = findBlankableSatz(lemma, candidate)
    if (found) targets.push({ ...candidate, ...found })
    if (targets.length >= 7) break
  }

  if (targets.length < 4) {
    logger.debug({ lemma, pos, found: targets.length }, 'Lückenfüller: zu wenig blankbare Sätze')
    return null
  }

  const rounds = []

  // ── Runden 1–4: Choice ────────────────────────────────
  const choiceCount  = Math.min(4, targets.length - 2)
  const choiceTargets = targets.slice(0, choiceCount)

  for (let i = 0; i < choiceTargets.length; i++) {
    const target = choiceTargets[i]
    const distractors = pickDistractors(i, target, pool, choiceTargets.slice(0, i))

    // Fehlende Distraktoren auffüllen
    const distSet = new Set([target.lemma, ...distractors.map(d => d.lemma)])
    while (distractors.length < 3) {
      const extra = pool.find(c => !distSet.has(c.lemma))
      if (!extra) break
      distractors.push(extra)
      distSet.add(extra.lemma)
    }

    rounds.push({
      type:          'choice',
      kollokator:    target.lemma,
      token:         target.token,
      logDice:       parseFloat(parseFloat(target.logDice).toFixed(1)),
      satz:          target.satz,
      satzMitLuecke: target.satzMitLuecke,
      quelle:        target.quelle,
      punkte:        PUNKTE[i],
      optionen:      shuffle([target.lemma, ...distractors.map(d => d.lemma)]),
    })
  }

  // ── Runde 5: Double (zwei separate Sätze) ─────────────
  const idxA = choiceCount
  const idxB = choiceCount + 1
  if (targets[idxA] && targets[idxB]) {
    const tA = targets[idxA]
    const tB = targets[idxB]
    const wrongOptions = pool
      .filter(c => c.lemma !== tA.lemma && c.lemma !== tB.lemma)
      .slice(0, 2)
      .map(c => c.lemma)

    rounds.push({
      type:    'double',
      punkte:  PUNKTE[4],
      optionen: shuffle([tA.lemma, tB.lemma, ...wrongOptions]),
      sentences: [
        { satzMitLuecke: tA.satzMitLuecke, quelle: tA.quelle, kollokator: tA.lemma, token: tA.token },
        { satzMitLuecke: tB.satzMitLuecke, quelle: tB.quelle, kollokator: tB.lemma, token: tB.token },
      ],
    })
  }

  // ── Runde 6: Free (freie Texteingabe) ─────────────────
  const idxF = choiceCount + 2
  if (targets[idxF]) {
    const tF = targets[idxF]
    rounds.push({
      type:          'free',
      kollokator:    tF.lemma,
      token:         tF.token,
      logDice:       parseFloat(parseFloat(tF.logDice).toFixed(1)),
      satz:          tF.satz,
      satzMitLuecke: tF.satzMitLuecke,
      quelle:        tF.quelle,
      punkte:        PUNKTE[5],
    })
  }

  logger.info({ lemma, pos, rounds: rounds.length }, 'Lückenfüller: Runden generiert')
  return rounds
}
