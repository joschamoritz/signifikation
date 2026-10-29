/**
 * Satzwahl im Lückenfüller: Unter den blankbaren Sätzen eines Kollokators gewinnt der mit den
 * wenigsten Makeln, bei Gleichstand der längste (der Kontext hilft beim Raten).
 *
 * Vorher gewann allein der längste Satz. Das zog genau die Korpusstücke nach oben, die am
 * längsten sind, weil sie keine sauberen Sätze sind: zwei aneinandergeklebte Sätze, Seitenköpfe
 * aus Plenarprotokollen, OCR-Reste, frühneuhochdeutsche Drucke („gewaltiger _____ Krafft“).
 */

const MIN_SATZ_LEN = 50
const MAX_SATZ_LEN = 220

const ABKUERZUNGEN = new Set(['prof', 'bzw', 'usw', 'vgl', 'ggf', 'inkl', 'evtl', 'geb', 'gest', 'sog', 'ehem',
  'jan', 'feb', 'aug', 'sept', 'okt', 'nov', 'dez', 'mio', 'mrd', 'tsd', 'abs', 'str', 'chr', 'hrsg', 'jhd', 'jhs'])
const SATZGRENZE = /(?<![\p{L}\d])(\p{L}+|\d+)[.!?]["“”»'’)]*\s+["„“»‚']?\p{Lu}/gu

/**
 * Zwei Sätze in einem Stück: „…begannen 1941. Die Publicity-Abteilung …“. Keine Grenze sind
 * Abkürzungen („Prof. Dr.“, „bzw. Die“), Initialen und Ordnungszahlen („Ludwig VI. dem“,
 * „Dr. L. L. Zamenhof“): Vor der Grenze muss ein Wort mit mindestens drei Kleinbuchstaben am
 * Ende oder eine Jahreszahl stehen.
 */
function geklebt(s) {
  for (const [, wort] of s.matchAll(SATZGRENZE)) {
    if (ABKUERZUNGEN.has(wort.toLowerCase())) continue
    if (/^\d{4}$/.test(wort) || /\p{Ll}{3}$/u.test(wort)) return true
  }
  return false
}

// Gewicht je Makel: Was den Satz unlesbar macht, wiegt schwerer als alte Schreibung
const MAKEL = [
  ['geklebt', 2, { test: geklebt }],
  ['auslassung', 2, /(?:…|\.\.\.)\s+\S/u],
  // Seitenumbruch im Plenarprotokoll: „Scha- 18286 Deutscher Bundestag — 12. Wahlperiode“
  ['seitenkopf', 3, /\p{Ll}-\s+\d|Wahlperiode\s*[—–-]\s*\d+\.\s*Sitzung|\(Beifall\b/u],
  // OCR: „I)cTTcU“, Ziffern mitten im Wort
  ['ocr', 3, /\p{L}[)(\]|]\p{L}|\p{Ll}\p{Lu}{2,}|\p{L}\d+\p{L}/u],
  // Buchstaben jenseits von Latin-1: Fremdsprachiges („gyakoriak … esőt“) oder alte Drucke („wordē“)
  ['fremdschrift', 1, /[Ā-ɏḀ-ỿ]/u],
  // Inschriften und Überschriften in Versalien: „DE MI NICH GVET IS …“
  ['versalien', 2, /(?<!\p{L})\p{Lu}{2,}(?!\p{L})[\s,.-]+\p{Lu}{2,}(?!\p{L})[\s,.-]+\p{Lu}{2,}(?!\p{L})/u],
  // Virgel als Satzzeichen (Drucke vor 1700): „frecherer / sicherer“
  ['virgel', 2, /\p{L} \/ \p{L}/u],
  // Satzanfang mitten im Text: „15. sondern …“, „14.4769 Aber …“
  ['anfang', 1, /^(?:\d[\d.,]*\s|\p{Ll})/u],
]

/** Summe der Makel-Gewichte eines Satzes (0 = sauber); `jahr` aus der Quelle, falls bekannt. */
export function satzMakel(satz, jahr = null) {
  const s = String(satz ?? '').trim()
  let summe = 0
  for (const [, gewicht, muster] of MAKEL) if (muster.test(s)) summe += gewicht
  // Alte Rechtschreibung („Vertheilungsfläche“, „Krafft“) – nur als Vorrang, nicht als Ausschluss
  if (jahr && jahr < 1800) summe += 2
  else if (jahr && jahr < 1900) summe += 1
  return summe
}

/** Namen der Makel eines Satzes (für Tests und Auswertungen). */
export function satzMakelNamen(satz) {
  const s = String(satz ?? '').trim()
  return MAKEL.filter(([, , muster]) => muster.test(s)).map(([name]) => name)
}

/**
 * Der beste Satz im Längenfenster (sonst aus allen): wenigste Makel, dann der längste.
 * @param {Array<{satz:string, jahr?:number|null}>} candidates
 */
export function waehleSatz(candidates) {
  if (!candidates.length) return null
  const inRange = candidates.filter(c => c.satz.length >= MIN_SATZ_LEN && c.satz.length <= MAX_SATZ_LEN)
  const pool = (inRange.length ? inRange : candidates)
    .map(c => ({ c, makel: satzMakel(c.satz, c.jahr) }))
  pool.sort((a, b) => a.makel - b.makel || b.c.satz.length - a.c.satz.length)
  return pool[0].c
}
