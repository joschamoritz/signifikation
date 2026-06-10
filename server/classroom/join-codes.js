import { randomInt } from 'node:crypto'

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
  'kohaerenz',
  'referenz',
  'bedeutung',
  'bezeichnung',
  'schreibung',
  'aussprache',
  'fremdwort',
  'lehnwort',
  'ableitung',
  'zusammensetzung',
  'wortgruppe',
  'satzglied',
  // ── Erweiterung 2026-06 (Security-Review H1): mehr Entropie ──
  // Laute & Schrift
  'vokal',
  'konsonant',
  'umlaut',
  'diphthong',
  'alphabet',
  'buchstabe',
  'anlaut',
  'auslaut',
  'ablaut',
  'lautschrift',
  'lautwandel',
  'betonung',
  // Grammatik
  'satzbau',
  'wortart',
  'infinitiv',
  'partizip',
  'imperativ',
  'indikativ',
  'konjunktiv',
  'passiv',
  'aktiv',
  'singular',
  'plural',
  'nominativ',
  'genitiv',
  'dativ',
  'akkusativ',
  'praesens',
  'praeteritum',
  'perfekt',
  'futur',
  'subjekt',
  'praedikat',
  'objekt',
  'attribut',
  'komparativ',
  'superlativ',
  'diminutiv',
  'reflexiv',
  'transitiv',
  'numerale',
  'interjektion',
  'praeposition',
  // Wörterbuch & Korpus
  'lemma',
  'eintrag',
  'verweis',
  'auflage',
  'edition',
  'woerterbuch',
  'umschrift',
  'korpus',
  'beleg',
  'quelle',
  'fundstelle',
  'konkordanz',
  'frequenz',
  'etymologie',
  'herkunft',
  'wortschatz',
  // Typografie & Buch
  'ligatur',
  'initiale',
  'majuskel',
  'minuskel',
  'kursive',
  'antiqua',
  'fraktur',
  'geviert',
  'spatium',
  'serife',
  'marginalie',
  'vignette',
  'kolophon',
  'titelei',
  'vorwort',
  'nachwort',
  'anhang',
  'einband',
  'klappentext',
  'leseprobe',
  'typografie',
  'kalligrafie',
  'handschrift',
  'gliederung',
  'einleitung',
  // Zeichensetzung
  'satzzeichen',
  'bindestrich',
  'apostroph',
  'semikolon',
  'doppelpunkt',
  'fragezeichen',
  // Rhetorik & Stilfiguren
  'allegorie',
  'assonanz',
  'hyperbel',
  'ironie',
  'litotes',
  'oxymoron',
  'parabel',
  'pleonasmus',
  'tautologie',
  'chiasmus',
  'klimax',
  'euphemismus',
  'metonymie',
  // Sprache & Varietäten
  'sprichwort',
  'redensart',
  'floskel',
  'jargon',
  'soziolekt',
  'idiolekt',
  'hochsprache',
  'sprachwandel',
  'jugendsprache',
  // Vers & Reim
  'binnenreim',
  'endreim',
  'stabreim',
  'versmass',
  'metrum',
  'jambus',
  'trochaeus',
  'daktylus',
  'hexameter',
  'strophe',
  'kadenz',
  'zaesur',
  // Wortspiele
  'palindrom',
  'anagramm',
  'akronym',
  'abkuerzung',
]

const JOIN_CODE_REGEX = /^[a-z]+-[a-z]+$/
const MIN_LEN = 10
const MAX_LEN = 20

// Kryptografisch sicherer Default: Math.random ist vorhersagbar und für
// Codes mit Security-Relevanz ungeeignet (Security-Review H1).
function secureRandom() {
  // randomInt verlangt range < 2^48 (exklusiv), daher 2^48 - 1
  return randomInt(0, 2 ** 48 - 1) / (2 ** 48 - 1)
}

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

export function generateJoinCode(randomFn = secureRandom) {
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
