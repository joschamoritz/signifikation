/**
 * server/archive/relGlossar.js
 *
 * Laienverständliche Erklärungen der grammatischen Beziehungscodes, die als
 * relation_description in server/wortprofil.js (REL_DESC im Pipeline-Skript
 * wortprofil/04_score/build_wortprofil_fast.py) hinterlegt sind und in der
 * Spalte „Beziehung“ der Muster-Tabelle erscheinen (z. B. „Akkusativobjekt“,
 * „Koordination“). Nutzer-Feedback: diese Fachbegriffe sind ohne linguistische
 * Vorbildung nicht selbsterklärend.
 *
 * Fachliche Korrekturen (Lektorat 2026-07-26):
 *   - SUBJP setzte im Beispiel das Lemma an die Subjektstelle, obwohl der Text
 *     das Partnerwort als Passivsubjekt beschreibt; „von …“ ist zudem die
 *     Agensangabe, nicht das Subjekt. Bei Verb-Lemmata rendert die alte Fassung
 *     zu „beschließen wird von … getan“.
 *   - PRED nannte das Prädikativ „Satzaussage“ — das ist der Schulterminus für
 *     das Prädikat.
 *   - ADV behauptete, das Partnerwort sei „ein Adverb“. Adverbiale Bestimmungen
 *     werden im Deutschen überwiegend von Adjektiven gefüllt („scharf
 *     kritisieren“), nicht von Adverbien.
 *   - OBJA/OBJD waren asymmetrisch erklärt; „direkte Ergänzung“ ist kein
 *     etablierter deutscher Terminus.
 *
 * Kasusgenaue Objekte (2026-08-06): Die Objekt-Relation heißt in der Tabelle
 * nicht mehr pauschal „Akkusativobjekt“, sondern trägt den Kasus, den das Verb
 * regiert — oder das neutrale „Objekt“, wenn die Korpusdaten ihn nicht hergeben
 * (siehe `verbRektion` in server/wortprofil.js). Die Erklärung muss deshalb dem
 * **Etikett** folgen, nicht dem Relationscode: sonst stünde neben „Dativobjekt“
 * die Erklärung „… im 4. Fall (wen oder was?)“.
 *
 * `SUBJP`, `OBJD` und `~OBJD` bleiben bewusst stehen, obwohl v2 sie nicht mehr
 * erzeugt (`nsubj:pass` → `SUBJA`, `iobj` feuert nie). Sie kosten nichts, sind
 * aber nötig, falls auf die v1-DB zurückgerollt wird.
 *
 * Reiner Text ohne HTML, geteilt für App-Tab und (potenziell) SSR-Seite.
 */

/**
 * Erklärungen je Objekt-Etikett. Schlüssel ist das, was in der Spalte
 * „Beziehung“ steht — nicht der Relationscode.
 */
const OBJEKT_EXPLAIN = {
  'Akkusativobjekt': 'Der Kollokator ist das Akkusativobjekt zu „%lemma%“: die Ergänzung im 4. Fall (wen oder was?).',
  'Dativobjekt':     'Der Kollokator ist das Dativobjekt zu „%lemma%“: die Ergänzung im 3. Fall (wem?).',
  'Genitivobjekt':   'Der Kollokator ist das Genitivobjekt zu „%lemma%“: die Ergänzung im 2. Fall (wessen?).',
  'Objekt':          'Der Kollokator ist ein Objekt zu „%lemma%“ – eine Ergänzung, die das Verb fordert. Welchen Fall „%lemma%“ hier regiert, geben die Korpusdaten nicht eindeutig her.',
  'ist Akkusativobjekt von': 'Umgekehrte Beziehung: „%lemma%“ ist selbst das Akkusativobjekt zu diesem Verb (4. Fall).',
  'ist Dativobjekt von':     'Umgekehrte Beziehung: „%lemma%“ ist selbst das Dativobjekt zu diesem Verb (3. Fall).',
  'ist Genitivobjekt von':   'Umgekehrte Beziehung: „%lemma%“ ist selbst das Genitivobjekt zu diesem Verb (2. Fall).',
  'ist Objekt von':          'Umgekehrte Beziehung: „%lemma%“ ist selbst ein Objekt zu diesem Verb. Welchen Fall das Verb hier regiert, geben die Korpusdaten nicht eindeutig her.',
}

/** Relationen, deren Erklärung vom Etikett abhängt statt vom Code. */
const KASUS_RELATIONEN = new Set(['OBJA', '~OBJA'])

const REL_EXPLAIN = {
  SUBJA:    'Der Kollokator ist das Subjekt im Aktivsatz – die handelnde Größe (z. B. „Der Ausschuss beschließt …“).',
  SUBJP:    'Der Kollokator ist das Subjekt im Passivsatz – dasjenige, mit dem etwas geschieht (z. B. „Das Gesetz wird beschlossen“).',
  OBJA:     OBJEKT_EXPLAIN['Akkusativobjekt'],
  OBJD:     'Der Kollokator ist das Dativobjekt zu „%lemma%“: die Ergänzung im 3. Fall (wem?).',
  ATTR:     'Der Kollokator steht als Attribut bei „%lemma%“ und beschreibt dieses Wort näher – meist ein Adjektiv oder Partizip.',
  GMOD:     'Der Kollokator ist ein Genitivattribut zu „%lemma%“: Er steht im 2. Fall, meist als „des/der …“.',
  KON:      'Der Kollokator ist mit „%lemma%“ gleichrangig verbunden, meist durch „und“ oder „oder“ (Koordination).',
  ADV:      'Der Kollokator ist eine adverbiale Bestimmung zu „%lemma%“: Er sagt, wie, wann oder wo (z. B. „scharf kritisieren“).',
  PRED:     'Der Kollokator ist ein Prädikativ: Er steht nach „sein“ oder „werden“ und sagt etwas über „%lemma%“ aus („%lemma% ist …“).',
  PP:       'Der Kollokator steht mit „%lemma%“ in einer Präpositionalgruppe (z. B. „mit …“, „für …“).',
  '~SUBJA': 'Umgekehrte Beziehung: „%lemma%“ ist selbst das Subjekt zu diesem Verb.',
  '~OBJA':  OBJEKT_EXPLAIN['ist Akkusativobjekt von'],
  '~OBJD':  'Umgekehrte Beziehung: „%lemma%“ ist selbst das Dativobjekt zu diesem Verb.',
  '~ATTR':  'Umgekehrte Beziehung: „%lemma%“ steht selbst als Attribut bei diesem Wort.',
  '~GMOD':  'Umgekehrte Beziehung: „%lemma%“ ist selbst ein Genitivattribut zu diesem Wort.',
  '~ADV':   'Umgekehrte Beziehung: „%lemma%“ ist selbst eine adverbiale Bestimmung zu diesem Wort.',
}

/**
 * Baut eine deduplizierte Liste { label, text } NUR für die Beziehungen, die
 * in den übergebenen patterns tatsächlich vorkommen (kein globales Glossar,
 * sondern eins passend zum jeweiligen Wort), in der Reihenfolge ihres ersten
 * Auftretens in der Tabelle.
 *
 * Bei den Objekt-Relationen wird nach **Etikett** unterschieden, nicht nur nach
 * Relationscode: Ein Substantiv kann in der Rückrichtung an mehreren Verben mit
 * verschiedener Rektion hängen („Hilfe leisten“ Akkusativ, „Hilfe rufen“
 * unbestimmt) und braucht dann beide Erklärungen. Für alle übrigen Relationen
 * bleibt es bei einem Eintrag je Code — sonst bekäme etwa `PP` je Präposition
 * einen eigenen Absatz („Präpositionalphrase (in)“, „(für)“, …).
 *
 * @param {Array<{relation:string, muster:string}>} patterns
 * @param {string} lemma
 * @returns {Array<{label:string, text:string}>}
 */
export function glossaryForPatterns(patterns, lemma) {
  const seen = new Set()
  const items = []
  for (const p of patterns || []) {
    const kasusRelation = KASUS_RELATIONEN.has(p.relation)
    const key = kasusRelation ? `${p.relation}|${p.muster}` : p.relation
    if (seen.has(key)) continue
    seen.add(key)
    const tpl = (kasusRelation && OBJEKT_EXPLAIN[p.muster]) || REL_EXPLAIN[p.relation]
    if (!tpl) continue
    items.push({ label: p.muster, text: tpl.replaceAll('%lemma%', lemma) })
  }
  return items
}
