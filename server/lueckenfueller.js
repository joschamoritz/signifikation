/**
 * lueckenfueller.js – Content-Selektion für den Lückenfüller-Spielmodus
 *
 * Baut bis zu 6 Runden auf:
 *   - Runden 1–4 (type:'choice')  : Auswahl aus 4 Optionen, steigende Schwierigkeit
 *   - Runde 5   (type:'double')   : Zwei Sätze, je eine Lücke — 4 Optionen (2 korrekt)
 *   - Runde 6   (type:'free')     : Freie Texteingabe, keine Optionen
 *
 * Distraktoren (`pickDistractors`): schwächere Kollokatoren (Pool-Position ≥ 5) in der
 * Wortart der Lösung, noch nicht gezeigte zuerst; andere Wortarten nur als letzter
 * Ausweg. Ihre Wortform kommt aus dem Rahmen der Lücke (lueckenfuellerRahmen.js), damit
 * die Endung die Lösung nicht verrät. Die Double-Runde nimmt je Satz einen davon.
 *
 * Punkte: [1, 1, 2, 2, 2, 2] → max. 10
 */

import { fetchRelation } from './wortprofil.js'
import { fetchBelegeRaw, zaehlePhrase } from './belege.js'
import { rahmenDerLuecke, waehleForm } from './lueckenfuellerRahmen.js'
import logger from './logger.js'

const LF_RELATIONS = {
  // Substantiv: ATTR (Adjektiv-Attribute) + KON (koordinierte Nomen)
  // Früher: ['~OBJA', '~SUBJA'] (Verb-Kollokate) – NICHT verwendbar, weil:
  //   1. FTS5 findet nur Sätze mit exakter Infinitivform (unicode61-Tokenizer, kein Stemming)
  //   2. blankCollocate/startsWith scheitert an konjugierten Formen (z.B. "gestaltet" ≠ startsWith("gestalten"))
  // ATTR-Adjektive und KON-Nomen behalten ihren Stamm als Präfix bei der Flexion:
  //   "spannende".startsWith("spannend") ✓   "Friedens".startsWith("Frieden") ✓
  Substantiv: ['ATTR', 'KON'],
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

const RAND = /^([.,;:!?„“""''()[\]–—»«‹›]*)(.*?)([.,;:!?„“""''()[\]–—»«‹›]*)$/s

/** Passt ein Wort (ohne Satzzeichen) zu einem Lemma? Ab vier Zeichen genügt der Anfang („spannende“ zu „spannend“). */
function passtZu(wort, lemma) {
  const w = wort.toLowerCase()
  const l = lemma.toLowerCase()
  return w === l || (l.length >= 4 && w.startsWith(l))
}

/** Wortanfang, an dem das Grundwort auch flektiert erkennbar ist: „öffnen“ → „öffn“ (öffnet, geöffnet). */
function grundwortStamm(lemma) {
  const l = lemma.toLowerCase()
  const stamm = l.length > 5 ? l.replace(/e?n$/, '') : l
  return stamm.length >= 3 ? stamm : l
}

/**
 * Ersetzt den Kollokator im Satz durch '_____' – das Vorkommen, das dem Grundwort am
 * nächsten steht. Bisher war es das erste passende Wort im Satz; stand der Kollokator
 * vorher schon einmal ohne Bezug zum Grundwort, saß die Lücke an der falschen Stelle.
 * Satzzeichen am Wort bleiben stehen („_____.“ statt eines verschluckten Punkts).
 * Gibt { satzMitLuecke, token } zurück (token = exakte Wortform) oder null.
 */
export function blankCollocate(satz, depLemma, basisLemma = '') {
  const parts = satz.split(/(\s+)/)
  const kern = parts.map(p => (/^\s+$/.test(p) ? null : p.match(RAND)))
  const stamm = basisLemma ? grundwortStamm(basisLemma) : null
  const istBasis = (i) => !!(stamm && kern[i] && kern[i][2].toLowerCase().includes(stamm))

  const treffer = []
  const basis = []
  kern.forEach((k, i) => {
    if (!k || !k[2]) return
    if (istBasis(i)) basis.push(i)
    else if (passtZu(k[2], depLemma)) treffer.push(i)
  })
  if (!treffer.length) return null

  const abstand = (i) => (basis.length ? Math.min(...basis.map(b => Math.abs(b - i))) : 0)
  const wahl = treffer.reduce((beste, i) => (abstand(i) < abstand(beste) ? i : beste), treffer[0])

  const [, vorne, wort, hinten] = kern[wahl]
  const result = [...parts]
  result[wahl] = `${vorne}_____${hinten}`
  return { satzMitLuecke: result.join(''), token: wort || depLemma }
}

/**
 * Wählt 3 Distraktoren für eine Runde.
 * usedOptions enthält alle bisher gezeigten Optionen (richtig + falsch) –
 * es werden ausschließlich frische, noch nie gezeigte Distraktoren gewählt,
 * damit Spieler aus vorherigen Runden keine Rückschlüsse ziehen können.
 */
function pickDistractors(target, pool, usedOptions, anzahl = 3, ausser = []) {
  const notTarget       = pool.filter(c => c.lemma !== target.lemma && !ausser.includes(c.lemma))
  const fresh           = notTarget.filter(c => !usedOptions.has(c.lemma))
  // Gleiche Wortart wie das Target – bevorzugte Distraktor-Quelle
  const samePOS         = notTarget.filter(c => c.pos === target.pos)
  const freshSamePOS    = fresh.filter(c => c.pos === target.pos)
  const weakSamePOS     = freshSamePOS.filter(c => pool.indexOf(c) >= 5)

  // Auffüllen: zuerst schwächere gleicher Wortart, dann frische gleicher Wortart, dann schon gezeigte
  // gleicher Wortart – erst danach andere Wortarten. Ein Adjektiv zwischen drei Nomen verrät die
  // Lösung sofort („es herrscht ___“: moralischen | ausbreitenden | ausgelösten | Chaos).
  const result = []
  const seen   = new Set()
  for (const c of [...weakSamePOS, ...freshSamePOS, ...samePOS, ...fresh, ...notTarget]) {
    if (result.length >= anzahl) break
    if (!seen.has(c.lemma)) { result.push(c); seen.add(c.lemma) }
  }
  return result
}

/** Form eines Distraktors für eine Lücke, über den Satzrahmen (lueckenfuellerRahmen.js). */
function distraktorForm(distraktor, ziel) {
  return waehleForm(distraktor, rahmenDerLuecke(ziel.satzMitLuecke), ziel, zaehlePhrase)
}

/**
 * Findet den ersten blankbaren Beleg für einen Kollokator.
 */
const MIN_SATZ_LEN = 50
const MAX_SATZ_LEN = 220

function findBlankableSatz(lemma, target) {
  const belege = fetchBelegeRaw(lemma, target.lemma, { limit: 30, prefixCollocate: true })

  // Alle blankbaren Sätze sammeln, nach Länge sortieren (längster zuerst),
  // dabei Sätze unter MIN_SATZ_LEN und über MAX_SATZ_LEN ausschließen.
  // Fallback: wenn kein Satz die Mindestlänge erfüllt, kürzeste akzeptable nehmen.
  const candidates = []
  for (const b of belege) {
    const blanked = blankCollocate(b.satz, target.lemma, lemma)
    if (blanked) candidates.push({ satz: b.satz, quelle: b.quelle, ...blanked })
  }
  if (!candidates.length) return null

  const inRange = candidates.filter(c => c.satz.length >= MIN_SATZ_LEN && c.satz.length <= MAX_SATZ_LEN)
  const pool = inRange.length ? inRange : candidates
  pool.sort((a, b) => b.satz.length - a.satz.length)
  return pool[0]
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
  const choiceCount   = Math.min(4, targets.length - 2)
  const choiceTargets = targets.slice(0, choiceCount)
  // Alle bisher als Option gezeigten Lemmas – verhindert Distraktoren-Wiederholung
  const usedOptions = new Set()

  for (let i = 0; i < choiceTargets.length; i++) {
    const target = choiceTargets[i]
    const distractors = pickDistractors(target, pool, usedOptions)

    // Korrekte Antwort: token-Form wenn vorhanden (z.B. "Säugetierarten"),
    // sonst Lemma – so stimmen Optionsbutton und Lückenfüllung überein
    const correctLabel = target.token || target.lemma

    // Distraktoren in der Form, die in genau diese Lücke passt („einen _____ Wind“ → „kalten“)
    const distractorLabels = distractors.map(d => distraktorForm(d, target))

    // Alle gezeigten Optionen dieser Runde für Folgerunden merken
    usedOptions.add(target.lemma)
    for (const d of distractors) usedOptions.add(d.lemma)

    rounds.push({
      type:          'choice',
      kollokator:    correctLabel,
      token:         target.token,
      logDice:       parseFloat(parseFloat(target.logDice).toFixed(1)),
      satz:          target.satz,
      satzMitLuecke: target.satzMitLuecke,
      quelle:        target.quelle,
      punkte:        PUNKTE[i],
      optionen:      shuffle([correctLabel, ...distractorLabels]),
    })
  }

  // ── Runde 5: Double (zwei separate Sätze) ─────────────
  const idxA = choiceCount
  const idxB = choiceCount + 1
  if (targets[idxA] && targets[idxB]) {
    const tA = targets[idxA]
    const tB = targets[idxB]
    const labelA = tA.token || tA.lemma
    const labelB = tB.token || tB.lemma
    // Bisher die zwei STÄRKSTEN Kollokatoren – die passen fast immer auch in einen der Sätze.
    // Jetzt wie in den Choice-Runden schwächere gleicher Wortart, je einer passend gebeugt
    // für Satz A und für Satz B.
    const [falschA] = pickDistractors(tA, pool, usedOptions, 1, [tB.lemma])
    const [falschB] = pickDistractors(tB, pool, usedOptions, 1, [tA.lemma, falschA?.lemma].filter(Boolean))
    const wrongOptions = [
      falschA && distraktorForm(falschA, tA),
      falschB && distraktorForm(falschB, tB),
    ].filter(Boolean)

    rounds.push({
      type:    'double',
      punkte:  PUNKTE[4],
      optionen: shuffle([labelA, labelB, ...wrongOptions]),
      sentences: [
        { satzMitLuecke: tA.satzMitLuecke, quelle: tA.quelle, kollokator: labelA, token: tA.token },
        { satzMitLuecke: tB.satzMitLuecke, quelle: tB.quelle, kollokator: labelB, token: tB.token },
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
