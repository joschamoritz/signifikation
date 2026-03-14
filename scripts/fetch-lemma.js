#!/usr/bin/env node
/**
 * fetch-lemma.js – Holt DWDS-Wortprofil-Daten für ein Lemma
 * und gibt einen fertigen lemmata.json-Eintrag aus.
 *
 * Verwendung:
 *   node scripts/fetch-lemma.js "Frühling"
 *   node scripts/fetch-lemma.js "laufen" Verb
 *
 * Ausgabe: JSON-Objekt auf stdout → in lemmata.json einfügen.
 *
 * Rundenstruktur:
 *   Runde 1 (nomen)     – ist in Koordination mit  [KON]
 *   Runde 2 (verben)    – ist Akkusativ-Objekt von  [~OBJ]
 *   Runde 3 (adjektive) – hat Adjektivattribut      [ATTR]
 */

const lemma = process.argv[2]
const pos   = process.argv[3] || 'Substantiv'

if (!lemma) {
  console.error('Fehler: Kein Lemma angegeben.')
  console.error('Verwendung: node scripts/fetch-lemma.js "Wort" [POS]')
  process.exit(1)
}

const BASE = 'https://www.dwds.de/wp/single_relation'

// Welche Relationen für welche Runden
const ROUNDS = [
  { key: 'nomen',     relCode: 'KON',   relName: 'KON'  },
  { key: 'verben',    relCode: '~OBJ',  relName: '~OBJ' },
  { key: 'adjektive', relCode: 'ATTR',  relName: 'ATTR' },
]

/**
 * Baut den `relation`-Parameter für die DWDS-API.
 * ~ am Anfang wird zu ---- im Relation-Key.
 */
function buildRelationId(lemma, pos, relCode) {
  const suffix = relCode.startsWith('~')
    ? `----${relCode.slice(1)}`
    : `-${relCode}`
  return `${lemma}-${pos}${suffix}`
}

async function fetchRelation(lemma, pos, relCode, relName) {
  const relation = buildRelationId(lemma, pos, relCode)
  const params = new URLSearchParams({
    relation,
    relName,
    limit:   20,
    by:      'logDice',
    minstat: 0,
    minfreq: 5,
    mwe:     0,
    lemma,
    lemmaId: '',
    pos,
    posId:   pos,
    wanted:  'lemma',
  })
  const url = `${BASE}?${params}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} bei ${relCode}: ${url}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Unerwartetes Format für ${relCode}`)
  // Selbstreferenzen rausfiltern (Lemma taucht manchmal in eigener KON-Liste auf)
  return data.filter(item => item.lemma.toLowerCase() !== lemma.toLowerCase())
}

/** Fisher-Yates */
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Aus bis zu 20 DWDS-Einträgen:
 * – Top 3 (Rang 1–3) sind Pflicht
 * – 7 zufällig aus den restlichen (Rang 4–10 im Output)
 * Gibt exakt 10 Einträge zurück, sortiert: top3 zuerst, dann Distraktoren.
 */
function buildOptions(items) {
  if (items.length < 3) {
    console.error(`  Warnung: nur ${items.length} Einträge – Top-3 nicht vollständig.`)
  }
  const top3       = items.slice(0, 3)
  const distractors = shuffle(items.slice(3)).slice(0, 7)

  return [...top3, ...distractors].map((item, i) => ({
    wort:      item.lemma,
    log_dice:  parseFloat(parseFloat(item.logDice).toFixed(1)),
    rang:      i + 1,   // 1–3 = korrekte Antworten, 4–10 = Distraktoren
  }))
}

/** Lemma → ID (Umlaute ersetzen, Kleinbuchstaben) */
function toId(word) {
  return word
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

async function main() {
  console.error(`Lade Wortprofil für „${lemma}" (${pos}) …`)
  const runden = {}

  for (const round of ROUNDS) {
    console.error(`  → ${round.key} [${round.relCode}] …`)
    const items = await fetchRelation(lemma, pos, round.relCode, round.relName)
    console.error(`     ${items.length} Einträge erhalten`)
    runden[round.key] = buildOptions(items)
  }

  const entry = {
    id:      toId(lemma),
    lemma,
    wortart: pos === 'Substantiv' ? 'Nomen' : pos,
    runden,
  }

  // Ausgabe auf stdout (stderr-Meldungen gehen separat raus)
  console.log(JSON.stringify(entry, null, 2))
  console.error('Fertig.')
}

main().catch(err => {
  console.error('Fehler:', err.message)
  process.exit(1)
})
