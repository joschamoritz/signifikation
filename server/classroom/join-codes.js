const JOIN_CODE_WORDS = [
  'lektorat',
  'duden',
  'zwiebel',
  'chaos',
  'komma',
  'punkt',
  'silbe',
  'reim',
  'syntax',
  'morphem',
  'phonem',
  'lexikon',
  'glossar',
  'thesaurus',
  'korrektur',
  'redaktion',
  'manuskript',
  'zitat',
  'fussnote',
  'absatz',
  'kapitel',
  'verb',
  'adjektiv',
  'nomen',
  'pronomen',
  'artikel',
  'suffix',
  'praefix',
  'stamm',
  'deklination',
  'konjugation',
  'kasus',
  'genus',
  'numerus',
  'tempus',
  'modus',
  'kolumnentitel',
  'belegstelle',
  'randnotiz',
  'sprachbild',
  'wortfeld',
  'stichwort',
  'wortliste',
  'begriff',
  'metapher',
  'idiom',
  'anmerkung',
  'dialekt',
  'orthografie',
  'grammatik',
  'linguistik',
  'semantik',
  'pragmatik',
  'rhetorik',
  'stilistik',
  'textsorte',
  'diskurs',
  'kontext',
  'valenz',
  'adverb',
  'partikel',
  'konjunktion',
  'phrase',
  'nebensatz',
  'hauptsatz',
  'synonym',
  'antonym',
  'homonym',
  'polysem',
  'kollokation',
  'phraseologie',
  'flexion',
  'derivation',
  'komposition',
  'neologismus',
  'archaismus',
  'fachsprache',
  'schriftsprache',
  'mundart',
  'akzent',
  'intonation',
  'prosodie',
  'register',
  'paraphrase',
  'wendung',
  'ausdruck',
  'latinismus',
  'anglizismus',
  'apposition',
  'ellipse',
  'anapher',
  'deixis',
  'fokus',
  'textkohanz',
  'referenz',
  'bedeutung',
  'bezeichnung',
  'schreibung',
  'aussprache',
  'fremdwort',
  'lehnwort',
  'lehnuebersetzung',
  'ableitung',
  'zusammensetzung',
  'wortgruppe',
  'satzglied',
]

const JOIN_CODE_REGEX = /^[a-z]+-[a-z]+$/
const MIN_LEN = 10
const MAX_LEN = 20

function pickWord(randomFn) {
  const idx = Math.floor(randomFn() * JOIN_CODE_WORDS.length)
  return JOIN_CODE_WORDS[Math.max(0, Math.min(JOIN_CODE_WORDS.length - 1, idx))]
}

export function normalizeJoinCode(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function isValidJoinCodeFormat(code) {
  const normalized = normalizeJoinCode(code)
  return (
    normalized.length >= MIN_LEN
    && normalized.length <= MAX_LEN
    && JOIN_CODE_REGEX.test(normalized)
  )
}

export function generateJoinCode(randomFn = Math.random) {
  for (let i = 0; i < 80; i += 1) {
    const first = pickWord(randomFn)
    const second = pickWord(randomFn)
    if (first === second) continue
    const candidate = `${first}-${second}`
    if (isValidJoinCodeFormat(candidate)) return candidate
  }

  for (let i = 0; i < JOIN_CODE_WORDS.length; i += 1) {
    for (let j = 0; j < JOIN_CODE_WORDS.length; j += 1) {
      if (i === j) continue
      const candidate = `${JOIN_CODE_WORDS[i]}-${JOIN_CODE_WORDS[j]}`
      if (isValidJoinCodeFormat(candidate)) return candidate
    }
  }

  throw new Error('Join-Code konnte nicht erzeugt werden')
}

export { JOIN_CODE_WORDS }
