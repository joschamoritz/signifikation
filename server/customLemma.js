/**
 * customLemma.js – Eignungsprüfung für selbst gewählte Lemmata (Premium-Feature
 * „Eigenes Lemma“). Spiegelt die Admin-Analyse-Tools, prüft aber gegen die
 * tatsächlichen Spielanforderungen pro Modus (nicht die laxere Admin-`usable`-
 * Heuristik), damit nur wirklich spielbare Wörter durchgelassen werden.
 *
 * Schwellen (aus den Spielgeneratoren abgeleitet):
 *   - Kollokationen : ≥10 distinkte Kollokationen (buildOptions braucht 10 Optionen)
 *   - Wort-Zwilling : ≥5 distinkte Kollokatoren pro Seite (erzwingt fetchWortZwilling)
 *   - Zeitenwende   : 5 vor + 5 nach 2000 (erzwingt fetchZeitenwende, via Analyze.usable)
 *   - Lückenfüller  : Pool ≥6 und ≥4 blankbare Belegsätze (erzwingt buildLueckenfueller)
 *
 * Der Spieldaten-Aufbau (play) folgt in 2b zusammen mit der UI.
 */

import { POS_ROUNDS, fetchRelation, fetchLemma, fetchZeitenwende, fetchZeitenwendeAnalyze } from './wortprofil.js'
import { fetchWortZwilling } from './wortzwilling.js'
import { buildLueckenfueller } from './lueckenfueller.js'
import { fetchWiktionary } from './wiktionary.js'

export const MIN_KOLLOKATIONEN = 10
const POS_CANDIDATES = ['Substantiv', 'Verb', 'Adjektiv']

/**
 * Führt alle Relations-Runden einer Wortart zusammen, dedupliziert nach Lemma
 * (höchstes logDice gewinnt) und sortiert absteigend. Identisch zur Admin-
 * Kollokations-Analyse, nur ohne das Slicing auf 20.
 */
async function mergeKollokatoren(lemma, pos) {
  const rounds = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
  const results = await Promise.allSettled(rounds.map((r) => fetchRelation(lemma, pos, r.relCode)))
  const seen = new Map()
  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    for (const it of r.value) {
      if (it.lemma.includes(' ') || it.lemma.length <= 1) continue
      const key = it.lemma.toLowerCase()
      const existing = seen.get(key)
      if (!existing || parseFloat(it.logDice) > parseFloat(existing.logDice)) {
        seen.set(key, it)
      }
    }
  }
  return [...seen.values()].sort((a, b) => parseFloat(b.logDice) - parseFloat(a.logDice))
}

/**
 * Ermittelt die Wortart mit den meisten Kollokationen (Auto-Erkennung, wenn der
 * Nutzer keine POS angibt) – analog zur Admin-`/analyze-kollokation`-Route.
 */
async function bestKollokationPos(lemma) {
  const analyses = await Promise.all(
    POS_CANDIDATES.map(async (pos) => ({ pos, count: (await mergeKollokatoren(lemma, pos)).length })),
  )
  analyses.sort((a, b) => b.count - a.count)
  return analyses[0]
}

async function validateKollokationen(q, pos) {
  const word = q.trim()
  const resolved = pos
    ? { pos, count: (await mergeKollokatoren(word, pos)).length }
    : await bestKollokationPos(word)
  const usable = resolved.count >= MIN_KOLLOKATIONEN
  return {
    mode: 'kollokationen',
    usable,
    pos: resolved.pos,
    count: resolved.count,
    reason: usable
      ? null
      : `Nicht genug Kollokationen in der Datenbank (${resolved.count} von ${MIN_KOLLOKATIONEN} nötig).`,
  }
}

async function validateWortzwilling(a, b, pos) {
  const result = await fetchWortZwilling(a.trim(), b.trim(), pos || 'Substantiv')
  const usable = !!result
  return {
    mode: 'wortzwilling',
    usable,
    reason: usable ? null : 'Nicht genug distinkte Kollokatoren – mindestens 5 pro Wort nötig.',
  }
}

async function validateZeitenwende(q) {
  const result = await fetchZeitenwendeAnalyze(q.trim())
  const usable = !!result?.usable
  return {
    mode: 'zeitenwende',
    usable,
    reason: usable
      ? null
      : 'Nicht genug zeittypische Kollokatoren – mindestens 5 vor und 5 nach 2000 nötig.',
  }
}

async function validateLueckenfueller(q, pos) {
  const word = q.trim()
  const resolvedPos = pos || (await bestKollokationPos(word)).pos
  const rounds = await buildLueckenfueller(word, resolvedPos)
  const usable = Array.isArray(rounds) && rounds.length > 0
  return {
    mode: 'lueckenfueller',
    usable,
    pos: resolvedPos,
    rounds: usable ? rounds.length : 0,
    reason: usable ? null : 'Nicht genug Belegsätze für eine spielbare Runde.',
  }
}

/**
 * Prüft ein selbst gewähltes Lemma für genau einen Spielmodus.
 * @param {{ mode: string, q?: string, a?: string, b?: string, pos?: string }} input
 * @returns {Promise<{ mode: string, usable: boolean, reason: string|null, [k:string]: any }>}
 */
export async function validateCustomLemma({ mode, q, pos, a, b }) {
  switch (mode) {
    case 'kollokationen':  return validateKollokationen(q, pos)
    case 'wortzwilling':   return validateWortzwilling(a, b, pos)
    case 'zeitenwende':    return validateZeitenwende(q)
    case 'lueckenfueller': return validateLueckenfueller(q, pos)
    default:
      throw new Error(`Unbekannter Modus: ${mode}`)
  }
}

/**
 * Baut die Spieldaten für ein selbst gewähltes Lemma – dieselbe Datenform wie
 * das jeweilige Tageslemma, damit die bestehenden Spielkomponenten unverändert
 * laufen. Gibt { usable:false, reason } zurück, wenn das Wort die Eignung nicht
 * besteht, sonst { usable:true, mode, lemma|… }.
 *
 * Weitere Modi (wortzwilling/zeitenwende/lueckenfueller) folgen je mit ihrer
 * UI-Phase, sobald die exakte Frontend-Datenform verifiziert ist.
 */
export async function buildCustomPlay({ mode, q, pos, a, b }) {
  switch (mode) {
    case 'kollokationen': {
      const verdict = await validateKollokationen(q, pos)
      if (!verdict.usable) return { usable: false, reason: verdict.reason }
      const lemma = await fetchLemma(q.trim(), verdict.pos)
      // isCustom: markiert reines Üben – das Frontend persistiert solche Plays
      // NICHT in die Tageswertung.
      return { usable: true, mode, lemma: { ...lemma, isCustom: true } }
    }

    case 'zeitenwende': {
      const word = q.trim()
      const result = await fetchZeitenwende(word)
      if (!result) {
        return { usable: false, reason: 'Nicht genug zeittypische Kollokatoren – mindestens 5 vor und 5 nach 2000 nötig.' }
      }
      // Wiktionary-Anreicherung wie beim Tageslemma (IPA + Definitionen).
      let wikt = { ipa: '', definitionen: [] }
      try { wikt = await fetchWiktionary(result.lemma) } catch { /* optional */ }
      return {
        usable: true,
        mode,
        data: {
          lemma: result.lemma,
          words: result.words,
          ipa: wikt.ipa || '',
          definitionen: wikt.definitionen || [],
          notiz: '',
          link: '',
          isCustom: true,
        },
      }
    }

    case 'wortzwilling': {
      const result = await fetchWortZwilling(a.trim(), b.trim(), pos || 'Substantiv')
      if (!result) {
        return { usable: false, reason: 'Nicht genug distinkte Kollokatoren – mindestens 5 pro Wort nötig.' }
      }
      return {
        usable: true,
        mode,
        data: {
          wortA: result.wortA,
          wortB: result.wortB,
          pos: result.pos,
          // Scores nicht ans Frontend senden (spielrelevante Antwort steckt in zuordnung).
          kollokatoren: result.kollokatoren.map(({ wort, zuordnung }) => ({ wort, zuordnung })),
          notiz: '',
          link: '',
          isCustom: true,
        },
      }
    }

    case 'lueckenfueller': {
      const word = q.trim()
      const resolvedPos = pos || (await bestKollokationPos(word)).pos
      const rounds = await buildLueckenfueller(word, resolvedPos)
      if (!Array.isArray(rounds) || rounds.length === 0) {
        return { usable: false, reason: 'Nicht genug Belegsätze für eine spielbare Runde.' }
      }
      return {
        usable: true,
        mode,
        data: { lemma: word, lueckenfueller: rounds, isCustom: true },
      }
    }

    default:
      throw new Error(`Unbekannter Modus: ${mode}`)
  }
}
