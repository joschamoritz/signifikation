/**
 * dwds.js – DWDS-Wortprofil-Abfrage als wiederverwendbares Modul
 */

const BASE = 'https://www.dwds.de/wp/single_relation'

// Rundenstruktur je Wortart.
// desc: wird in Results.jsx als Beschreibung der Relation angezeigt
// relCode: Relationscode für die DWDS-API
export const POS_ROUNDS = {
  Substantiv: [
    { key: 'nomen',     relCode: 'KON',   label: 'Nomen',     desc: 'ist koordiniert mit' },
    { key: 'verben',    relCode: '~OBJ',  label: 'Verben',    desc: 'ist Objekt von' },
    { key: 'adjektive', relCode: 'ATTR',  label: 'Adjektive', desc: 'hat Adjektivattribut' },
  ],
  Verb: [
    { key: 'objekte',   relCode: 'OBJ',   label: 'Objekte',   desc: 'hat als Objekt' },
    { key: 'verben',    relCode: 'KON',   label: 'Verben',    desc: 'ist koordiniert mit' },
    { key: 'adverbien', relCode: 'ADV',   label: 'Adverbien', desc: 'wird begleitet durch' },
  ],
  Adjektiv: [
    { key: 'nomen',     relCode: '~ATTR', label: 'Nomen',     desc: 'ist Attribut bei' },
    { key: 'verben',    relCode: '~ADV',  label: 'Verben',    desc: 'ist Adverbialbestimmung von' },
    { key: 'adjektive', relCode: 'KON',   label: 'Adjektive', desc: 'ist koordiniert mit' },
  ],
}

// Bonuskandidaten je Wortart
const POS_BONUS = {
  Substantiv: [
    { relCode: 'PRED',   label: 'Prädikativ',      question: lemma => `Welches Adjektiv kann „${lemma}" prädikativ beschreiben?` },
    { relCode: 'GMOD',   label: 'Genitivattribut', question: lemma => `Welches Wort steht häufig mit „${lemma}" im Genitiv?` },
    { relCode: '~GMOD',  label: 'Genitivattribut', question: lemma => `Von welchem Nomen ist „${lemma}" oft ein Genitivattribut?` },
    { relCode: '~SUBJA', label: 'Subjekt-Verb',    question: lemma => `Welches Verb verbindet sich mit „${lemma}" als Subjekt?` },
  ],
  Verb: [
    // Kandidaten werden vor der Auswahl gemischt – wer zuerst ≥5 Einzelwörter hat, gewinnt
    { relCode: 'SUBJA', label: 'Subjekt',           question: lemma => `Welches Wort steht typisch als Subjekt von „${lemma}"?` },
    { relCode: 'PP',    label: 'Präpositionalgruppe', question: lemma => `Welche Präpositionalgruppe passt zu „${lemma}"?` },
  ],
  Adjektiv: [
    // KOM = "hat vergl. Wortgruppe" (z.B. schnell wie Wind) – Kandidaten werden gemischt
    { relCode: 'KOM',   label: 'Vergleich',            question: lemma => `Womit wird „${lemma}" typischerweise verglichen?` },
    { relCode: 'ADV',   label: 'Adverbialbestimmung',  question: lemma => `Welches Adverb modifiziert „${lemma}"?` },
  ],
}

function buildRelationId(lemma, pos, relCode) {
  const suffix = relCode.startsWith('~')
    ? `----${relCode.slice(1)}`
    : `-${relCode}`
  return `${lemma}-${pos}${suffix}`
}

export async function fetchRelation(lemma, pos, relCode) {
  const params = new URLSearchParams({
    relation: buildRelationId(lemma, pos, relCode),
    relName:  relCode,   // muss exakt dem Relationscode entsprechen
    limit: 20, by: 'logDice', minstat: 0, minfreq: 5, mwe: 0,
    lemma, lemmaId: '', pos, posId: pos, wanted: 'lemma',
  })
  const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`DWDS HTTP ${res.status} für ${relCode}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Unerwartetes Format für ${relCode}`)
  return data
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildOptions(items) {
  const top3        = items.slice(0, 3)
  const distractors = shuffle(items.slice(3)).slice(0, 7)
  return [...top3, ...distractors].map((item, i) => ({
    wort:     item.lemma,
    log_dice: parseFloat(parseFloat(item.logDice).toFixed(1)),
    rang:     i + 1,
  }))
}

export function toId(word) {
  return word.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

export async function fetchBonusQuestion(lemma, pos = 'Substantiv') {
  // Kandidaten mischen: zufällige Reihenfolge bei mehreren Optionen
  const candidates = shuffle([...(POS_BONUS[pos] ?? POS_BONUS.Substantiv)])
  for (const { relCode, label, question } of candidates) {
    try {
      const raw = await fetchRelation(lemma, pos, relCode)
      // Nur Einzelwörter (keine Phrasen wie "zu Mittag" oder "mit Pommes")
      const items = raw.filter(i => !i.lemma.includes(' '))
      if (items.length < 5) continue
      const correct     = items[0]
      const distractors = shuffle(items.slice(3, 10)).slice(0, 2)
      if (distractors.length < 2) continue
      return {
        correct: correct.lemma,
        options: shuffle([correct.lemma, ...distractors.map(d => d.lemma)]),
        label,
        question: question(lemma),
      }
    } catch { continue }
  }
  return null
}

export async function fetchLemma(lemma, pos = 'Substantiv') {
  const rounds  = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
  const results = await Promise.allSettled(
    rounds.map(round => fetchRelation(lemma, pos, round.relCode))
  )
  const runden = {}
  for (let i = 0; i < rounds.length; i++) {
    const r = results[i]
    runden[rounds[i].key] = r.status === 'fulfilled' ? buildOptions(r.value) : []
    if (r.status === 'rejected') console.warn(`fetchLemma: Relation ${rounds[i].relCode} fehlgeschlagen:`, r.reason.message)
  }
  return {
    id:         toId(lemma),
    lemma,
    pos,
    wortart:    pos,
    rundenInfo: rounds.map(({ key, label, relCode, desc }) => ({ key, label, relCode, desc })),
    runden,
  }
}
