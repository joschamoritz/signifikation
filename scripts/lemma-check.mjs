// lemma-check.mjs – Batch-Eignungsprüfung für Lemma-Kandidaten gegen die
// lokalen Wortprofil-/Belege-DBs, für die wöchentliche Lemma-Planung
// (signifikation-lemma-Skill). Nutzt dieselbe Logik wie die App
// (server/wortprofil.js, wortzwilling.js, lueckenfueller.js) statt eigene
// Schwellenwerte neu zu erfinden — was hier "ok" meldet, sollte beim
// Speichern im Admin-Panel nicht mehr an "nicht genug distinkte
// Kollokatoren" scheitern.
//
// Aufruf:
//   node scripts/lemma-check.mjs '[{"type":"wort","lemma":"Haus","pos":"Substantiv"}, ...]'
//
// Check-Typen:
//   { type: "wort",           lemma, pos }              – Kollokationen-Eignung
//   { type: "zwilling",       wortA, wortB, pos }        – Wort-Zwilling-Eignung
//   { type: "zeitenwende",    lemma }                    – Zeitenwende-Eignung
//   { type: "lueckenfueller", lemma, pos }                – Lückenfüller-Eignung
//
// Gibt ein JSON-Array auf stdout zurück, ein Eintrag pro Check, jeweils
// mit "ok: true/false" und den Kennzahlen, die zur Einschätzung führten.

import '../server/env.js'
import { fetchLemma, fetchZeitenwende } from '../server/wortprofil.js'
import { fetchWortZwilling } from '../server/wortzwilling.js'
import { buildLueckenfueller } from '../server/lueckenfueller.js'
import { belegeVerfuegbar } from '../server/belege.js'

// Ab hier gilt ein Kollokationen-Wort als "gut bespielbar": die gemischte
// Top-Runde (buildMixedRound) braucht min. 3 Treffer + Distraktoren aus
// Platz 4-25 (buildOptions) – 10 ist der Idealfall (3 Lösung + 7 Distraktoren),
// darunter wird die Auswahl an Falsch-Antworten dünn.
const MIN_MIXED_COUNT = 10
const MIN_ROUND_COUNT = 4

function summarizeWort(lemma, pos, data) {
  const roundEntries = Object.entries(data.runden).filter(([key]) => key !== 'kollokatoren')
  const roundSizes = Object.fromEntries(roundEntries.map(([key, items]) => [key, items.length]))
  const weakRounds = roundEntries.filter(([, items]) => items.length < MIN_ROUND_COUNT).map(([key]) => key)
  const mixedCount = data.runden.kollokatoren.length

  return {
    mixedCount,
    roundSizes,
    weakRounds,
    top3: data.runden.kollokatoren.slice(0, 3).map((o) => o.wort),
    ok: mixedCount >= MIN_MIXED_COUNT && weakRounds.length === 0,
  }
}

async function runCheck(spec) {
  const pos = spec.pos || 'Substantiv'

  if (spec.type === 'wort') {
    const data = await fetchLemma(spec.lemma, pos)
    return { type: 'wort', lemma: spec.lemma, pos, ...summarizeWort(spec.lemma, pos, data) }
  }

  if (spec.type === 'zwilling') {
    const wz = await fetchWortZwilling(spec.wortA, spec.wortB, pos)
    return {
      type: 'zwilling',
      wortA: spec.wortA,
      wortB: spec.wortB,
      pos,
      ok: !!wz,
      ...(wz
        ? {
            topA: wz.kollokatoren.filter((k) => k.zuordnung === 'A').map((k) => k.wort),
            topB: wz.kollokatoren.filter((k) => k.zuordnung === 'B').map((k) => k.wort),
          }
        : { reason: 'weniger als 5+5 distinkte Kollokatoren mit |Diff| >= 0.5 logDice' }),
    }
  }

  if (spec.type === 'zeitenwende') {
    const zw = await fetchZeitenwende(spec.lemma)
    return {
      type: 'zeitenwende',
      lemma: spec.lemma,
      ok: !!zw,
      ...(zw
        ? {
            pre: zw.words.filter((w) => w.periode === 'pre').map((w) => w.wort),
            post: zw.words.filter((w) => w.periode === 'post').map((w) => w.wort),
          }
        : { reason: 'weniger als 5+5 nicht-ueberlappende Top-Kollokatoren vor/nach 2000, oder zu wenig Korpusbelege ab 1950' }),
    }
  }

  if (spec.type === 'lueckenfueller') {
    const rounds = await buildLueckenfueller(spec.lemma, pos)
    return {
      type: 'lueckenfueller',
      lemma: spec.lemma,
      pos,
      ok: !!rounds,
      ...(rounds
        ? {
            rounds: rounds.length,
            preview: rounds.slice(0, 4).map((r) => r.kollokator || r.sentences?.map((s) => s.kollokator).join(' / ')),
          }
        : { reason: 'Pool < 6 distinkte Kollokatoren (logDice >= 5.0) oder < 4 blankbare Belegsaetze' }),
    }
  }

  return { type: spec.type, ok: false, reason: `unbekannter type "${spec.type}"` }
}

async function main() {
  const raw = process.argv[2]
  if (!raw) {
    console.error('Usage: node scripts/lemma-check.mjs \'[{"type":"wort","lemma":"Haus","pos":"Substantiv"}]\'')
    process.exit(1)
  }

  let specs
  try {
    specs = JSON.parse(raw)
  } catch (err) {
    console.error(`Ungueltiges JSON: ${err.message}`)
    process.exit(1)
  }
  if (!Array.isArray(specs)) specs = [specs]

  if (!belegeVerfuegbar()) {
    console.error('Warnung: Belege-DB nicht erreichbar (BELEGE_DB) – Lückenfüller-Checks liefern moeglicherweise falsch-negative Ergebnisse.')
  }

  const results = []
  for (const spec of specs) {
    try {
      results.push(await runCheck(spec))
    } catch (err) {
      results.push({ ...spec, ok: false, error: err.message })
    }
  }

  console.log(JSON.stringify(results, null, 2))
}

main()
