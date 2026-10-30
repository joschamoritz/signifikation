/**
 * lueckenfuellerRahmen.js – Wortform der Lückenfüller-Distraktoren aus dem Satzrahmen
 *
 * Bisher kam die Form eines Distraktors aus irgendeinem anderen Satz. Neben „einen
 * _____ Wind“ mit der Lösung „starken“ stand dann „kalte“, und die Lösung war schon an
 * der Endung zu erkennen. Jetzt wird jede mögliche Form des Distraktors in den Rahmen
 * der Lücke gesetzt (das Wort davor und danach) und im Korpus gezählt; gewählt wird die
 * Form, die dort belegt ist: „einen kalten Wind“.
 *
 * Bei Adjektiven hängt die Rückfallregel dieselbe Endung an wie bei der Lösung
 * (stark → starken, also kalt → kalten); Nomen bleiben ohne Treffer in der Grundform.
 *
 * Die Zählung kommt als Funktion herein (`zaehle(woerter) → Anzahl`, in der App
 * `zaehlePhrase` aus belege.js), damit sich die Auswahl ohne Korpus testen lässt.
 */

const LUECKE = '_____'

// Endungen, aus denen die Kandidaten gebildet werden. Was davon nicht deutsch ist
// („kaltem“ gibt es, „Windern“ nicht), findet im Rahmen einfach keinen Treffer.
const ENDUNGEN = {
  Adjektiv:   ['', 'e', 'en', 'er', 'es', 'em'],
  Substantiv: ['', 'e', 'en', 'n', 'er', 'ern', 's', 'es'],
}

/**
 * Das Wort direkt vor und direkt nach der Lücke. Steht ein Satzzeichen dazwischen
 * („Panik, _____“), gibt es auf dieser Seite keinen Rahmen: über ein Komma hinweg
 * sagt die Wortfolge nichts über die Form.
 *
 * `amSatzanfang`: Vor der Lücke stehen höchstens Anführungszeichen – nur dann wird ein
 * Adjektiv großgeschrieben.
 *
 * @returns {{ links: string|null, rechts: string|null, amSatzanfang?: boolean }}
 */
export function rahmenDerLuecke(satzMitLuecke) {
  const i = String(satzMitLuecke).indexOf(LUECKE)
  if (i < 0) return { links: null, rechts: null }
  const davor = satzMitLuecke.slice(0, i)
  const danach = satzMitLuecke.slice(i + LUECKE.length)
  return {
    links: davor.match(/(\p{L}[\p{L}\p{N}-]*)\s+$/u)?.[1] ?? null,
    rechts: danach.match(/^\s+(\p{L}[\p{L}\p{N}-]*)/u)?.[1] ?? null,
    amSatzanfang: !/[\p{L}\p{N}]/u.test(davor),
  }
}

/** Stämme eines Adjektivs, an die Endungen treten: leise → leis, dunkel → dunkl, teuer → teur, hoch → hoh. */
function staemme(lemma, pos) {
  const s = new Set([lemma])
  if (pos !== 'Adjektiv') return s
  if (lemma.endsWith('e')) s.add(lemma.slice(0, -1))
  if (lemma.endsWith('el')) s.add(`${lemma.slice(0, -2)}l`)
  if (lemma.endsWith('er')) s.add(`${lemma.slice(0, -2)}r`)
  if (lemma === 'hoch') s.add('hoh')
  return s
}

/** Mögliche Wortformen eines Distraktors (ungeprüft – der Rahmen entscheidet). */
export function formKandidaten(lemma, pos) {
  const endungen = ENDUNGEN[pos] ?? ['']
  const formen = new Set()
  for (const stamm of staemme(lemma, pos)) {
    for (const e of endungen) formen.add(stamm + e)
  }
  return [...formen].filter(f => f.length >= 2)
}

/**
 * Rückfallregel: dieselbe Endung wie die Lösung. Steht die Lösung nicht als
 * Lemma plus Endung im Satz (Umlaut, unregelmäßig), gibt es keine Regel.
 */
export function formNachEndung(lemma, pos, zielToken, zielLemma) {
  const token = String(zielToken ?? '').toLowerCase()
  const basis = String(zielLemma ?? '').toLowerCase()
  if (!token || !basis || !token.startsWith(basis)) return null
  const endung = token.slice(basis.length)
  if (!endung) return lemma
  // „leise“ + „en“ → „leisen“, nicht „leiseen“
  if (pos === 'Adjektiv' && lemma.endsWith('e') && endung.startsWith('e')) return lemma.slice(0, -1) + endung
  return lemma + endung
}

/**
 * Groß/klein wie im Satz: Nomen immer groß, Adjektive nur am Satzanfang. Ohne Angabe zum
 * Satzanfang wie die Lösung – die ist aber auch mitten im Satz groß, wenn sie ein Ortsadjektiv
 * ist („den Prenzlauer Berg“), und daraus wurden „Blau | Heilig | Steil“.
 */
function schreibung(form, pos, zielToken, amSatzanfang) {
  if (!form) return form
  const gross = pos === 'Substantiv' || (amSatzanfang ?? /^\p{Lu}/u.test(String(zielToken ?? '')))
  return (gross ? form[0].toUpperCase() : form[0].toLowerCase()) + form.slice(1)
}

/**
 * Lösung ist ein unbeugbares Ortsadjektiv mitten im Satz („den Prenzlauer Berg“): Ihre
 * fehlende Endung sagt über die Form der Distraktoren nichts – „blau“ gehört dort als
 * „blauen“ hin. Dann entscheidet der Rahmen wie bei Nomen.
 */
function istOrtsadjektivImSatz(ziel, amSatzanfang) {
  const token = String(ziel.token ?? '')
  return !amSatzanfang && /^\p{Lu}/u.test(token) && token.toLowerCase() === String(ziel.lemma ?? '').toLowerCase()
    && token.toLowerCase().endsWith('er')
}

/**
 * Nomen ohne Rahmen-Treffer, Lösung gebeugt (Plural in einer Aufzählung: „an Tannen, _____,
 * Ebereschen“ mit „Birken“): die häufigste Form mit demselben Endbuchstaben wie die Endung der
 * Lösung, die es als Wort gibt („Pappeln“, „Grafen“). Sonst stand „Pappel“ allein im Singular.
 */
function formWieLoesung(formen, lemma, ziel, zaehle) {
  const token = String(ziel.token ?? '').toLowerCase()
  const basis = String(ziel.lemma ?? '').toLowerCase()
  if (!basis || !token.startsWith(basis) || token === basis) return null
  const letzter = token.at(-1)
  const passend = formen.filter(f => f !== lemma && f.endsWith(letzter))
  return haeufigste(passend, f => [f], zaehle)
}

/** Die im Rahmen häufigste Form, oder null, wenn keine belegt ist. */
function haeufigste(kandidaten, bau, zaehle) {
  let beste = null
  let besteZahl = 0
  for (const f of kandidaten) {
    const n = zaehle(bau(f))
    if (n > besteZahl) { beste = f; besteZahl = n }
  }
  return beste
}

/**
 * Wählt die Form eines Distraktors für eine Lücke.
 *
 * Adjektive: Entscheidend für die Endung sind das Wort davor (Artikel) und danach (Nomen)
 * zusammen. Belegt im vollen Rahmen „links Form rechts“ gewinnt; sonst die Endungsregel –
 * ein halber Rahmen wie „Abend produziert“ sagt über die Endung nichts und führte zu
 * „heute Abend produziert Sat1 Sendung“. Erst ohne Regel zählen die halben Rahmen.
 *
 * Nomen: keine Endungsregel („Gedichten“ → „Lyriken“, „Regen“ → „Strömungn“ waren die
 * Folge), nur Rahmen-Treffer vom engsten zum weitesten; ohne Treffer bei gebeugter Lösung die
 * als Wort belegte Form mit passender Endung (formWieLoesung), sonst die Grundform.
 *
 * @param {{lemma: string, pos: string}} distraktor
 * @param {{links: string|null, rechts: string|null}} rahmen  aus rahmenDerLuecke()
 * @param {{token: string, lemma: string}} ziel  die Lösung dieser Lücke
 * @param {(woerter: string[]) => number} zaehle
 */
export function waehleForm(distraktor, rahmen, ziel, zaehle) {
  const { lemma, pos } = distraktor
  const { links, rechts, amSatzanfang } = rahmen
  const voll = links && rechts ? f => [links, f, rechts] : null
  const halbe = [links && (f => [links, f]), rechts && (f => [f, rechts])].filter(Boolean)
  const formen = formKandidaten(lemma, pos)
  const fertig = (f) => schreibung(f, pos, ziel.token, amSatzanfang)

  const regel = pos === 'Substantiv' || istOrtsadjektivImSatz(ziel, amSatzanfang)
    ? null
    : formNachEndung(lemma, pos, ziel.token, ziel.lemma)
  if (regel) {
    // Meist ist die Regel-Form im vollen Rahmen belegt – dann reicht eine Zählung
    if (voll && zaehle(voll(regel)) > 0) return fertig(regel)
    // Sonst darf der Rahmen nur den Stamm korrigieren (dunkel → dunklen), nicht die Endung:
    // „besonders günstiger Wind“ ist belegt, in „nach ganz besonders _____ Wind“ gehört aber „-em“
    const endung = String(ziel.token).toLowerCase().slice(String(ziel.lemma).length)
    const gleicheEndung = formen.filter(f => f !== regel && f.toLowerCase().endsWith(endung))
    const imRahmen = voll && endung && haeufigste(gleicheEndung, voll, zaehle)
    if (imRahmen) return fertig(imRahmen)
    // Unbeugbare Adjektive („Landshuter Hochzeit“): Steht vor dem Nomen nur die Grundform,
    // nie die Regel-Form, bleibt es bei der Grundform statt „landshuteren“. Das sind
    // Ableitungen von Ortsnamen auf -er, darum groß. Andere Adjektive nie: Zu „geringeren“
    // wurde „hoch“ sonst zu „Hoch“ (die Regel-Form „hocheren“ gibt es nicht).
    if (rechts && lemma.endsWith('er') && regel !== lemma && zaehle([regel, rechts]) === 0 && zaehle([lemma, rechts]) > 0) {
      return lemma[0].toUpperCase() + lemma.slice(1)
    }
    return fertig(regel)
  }

  for (const bau of [voll, ...halbe].filter(Boolean)) {
    const f = haeufigste(formen, bau, zaehle)
    if (f) return fertig(f)
  }
  if (pos === 'Substantiv') {
    const f = formWieLoesung(formen, lemma, ziel, zaehle)
    if (f) return fertig(f)
  }
  return fertig(lemma)
}
