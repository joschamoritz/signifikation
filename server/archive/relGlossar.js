/**
 * server/archive/relGlossar.js
 *
 * Laienverständliche Erklärungen der grammatischen Beziehungscodes, die als
 * relation_description in server/wortprofil.js (REL_DESC im Pipeline-Skript
 * wortprofil/04_score/build_wortprofil_fast.py) hinterlegt sind und in der
 * Spalte „Beziehung" der Muster-Tabelle erscheinen (z.B. „Akkusativobjekt",
 * „Koordination"). Nutzer-Feedback: diese Fachbegriffe sind ohne linguistische
 * Vorbildung nicht selbsterklärend.
 *
 * Reiner Text ohne HTML, geteilt für App-Tab und (potenziell) SSR-Seite.
 */
export const REL_EXPLAIN = {
  SUBJA:    'Das Partnerwort ist das Subjekt im Aktivsatz — es „tut" etwas, wozu „%lemma%" gehört, oder bezieht sich handelnd darauf.',
  SUBJP:    'Das Partnerwort ist das Subjekt im Passivsatz („%lemma% wird von … getan/beeinflusst").',
  OBJA:     'Das Partnerwort ist das Akkusativobjekt: die direkte Ergänzung im 4. Fall (wen/was?).',
  OBJD:     'Das Partnerwort ist das Dativobjekt: die Ergänzung im 3. Fall (wem?).',
  ATTR:     'Das Partnerwort ist ein Adjektiv, das „%lemma%" näher beschreibt.',
  GMOD:     'Das Partnerwort steht im Genitiv (2. Fall) bei „%lemma%", meist als „des/der …".',
  KON:      'Das Partnerwort ist mit „%lemma%" gleichrangig verbunden, meist durch „und" oder „oder".',
  ADV:      'Das Partnerwort ist ein Adverb, das „%lemma%" näher bestimmt (wie? wann? wo?).',
  PRED:     'Das Partnerwort steht als Satzaussage nach einem Verb wie „sein" oder „werden" („%lemma% ist …").',
  PP:       'Das Partnerwort steht in einer Präpositionalgruppe zusammen mit „%lemma%" (z. B. „mit …", „für …").',
  '~SUBJA': 'Umgekehrte Beziehung: „%lemma%" ist selbst das Subjekt zu diesem Verb.',
  '~OBJA':  'Umgekehrte Beziehung: „%lemma%" ist selbst das Akkusativobjekt zu diesem Verb.',
  '~OBJD':  'Umgekehrte Beziehung: „%lemma%" ist selbst das Dativobjekt zu diesem Verb.',
  '~ATTR':  'Umgekehrte Beziehung: „%lemma%" beschreibt selbst dieses Wort näher.',
  '~GMOD':  'Umgekehrte Beziehung: „%lemma%" steht selbst im Genitiv bei diesem Wort.',
  '~ADV':   'Umgekehrte Beziehung: „%lemma%" bestimmt selbst dieses Wort näher.',
}

/**
 * Baut eine deduplizierte Liste { label, text } NUR für die Beziehungen, die
 * in den übergebenen patterns tatsächlich vorkommen (kein globales Glossar,
 * sondern eins passend zum jeweiligen Wort), in der Reihenfolge ihres ersten
 * Auftretens in der Tabelle.
 *
 * @param {Array<{relation:string, muster:string}>} patterns
 * @param {string} lemma
 * @returns {Array<{label:string, text:string}>}
 */
export function glossaryForPatterns(patterns, lemma) {
  const seen = new Set()
  const items = []
  for (const p of patterns || []) {
    if (seen.has(p.relation)) continue
    seen.add(p.relation)
    const tpl = REL_EXPLAIN[p.relation]
    if (!tpl) continue
    items.push({ label: p.muster, text: tpl.replaceAll('%lemma%', lemma) })
  }
  return items
}
