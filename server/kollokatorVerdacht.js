// Verdachtsmarken für Kollokatoren im Tag-Editor (Admin › Tag › Kollokationen prüfen).
//
// Heuristiken aus scripts/kollokatoren-datenfehler.mjs (Bestandsaufnahme:
// planning/Kollokatoren-Datenfehler.md). Sie sind bewusst Vorschläge: Jeder Fund muss
// gesichtet werden, bevor jemand eine Kollokator-Korrektur anlegt. Das Modul ist rein;
// Häufigkeiten und Quellenprofile reicht der Aufrufer hinein (server/wortprofil.js).
import { partizipFormen } from './kollokatorKorrektur.js'

export const VERDACHT = {
  /** Paarfrequenz darunter: zu wenig Belege, um die Verbindung zu tragen */
  wenigeBelege: 20,
  /** Anteil moderner Quellen darunter: historisch (der Filter der Rangfolge liegt bei 8 %) */
  historisch: 0.15,
  /** Anteil der stärksten Einzelquelle ab hier, wenn sie keine breite Quelle ist */
  eineQuelle: 0.6,
  /** Plural: Singular mindestens so häufig (absolut) … */
  pluralMinSingular: 2000,
  /** … und mehr als so viel mal häufiger als die Form selbst */
  pluralFaktor: 2,
  /** geprüfte Plätze (Top 3 und die starken Ablenker) */
  plaetze: 10,
}

// Zeitungen, Wikipedia, Parlament und die großen historischen Sammlungen: Ein hoher
// Anteil daraus ist kein Zeichen für Fachjargon.
const BREITE_QUELLEN = new Set(['deu_news', 'deu_newscrawl', 'wikipedia', 'gei_digital', 'dta_erweiterungen', 'dta_kern', 'bundestagskorpus_pdf', 'reichtagsprotokolle', 'dibilit'])

// Häufige Vornamen, die in Biografien als Objekt oder Subjekt auftauchen (heiraten → Anna).
// Bewusst ohne Vornamen, die zugleich Wörter sind (Ernst, Rose, Frank, Max).
const VORNAMEN = new Set([
  'anna', 'maria', 'marie', 'elisabeth', 'katharina', 'margarete', 'luise', 'sophie', 'johanna',
  'christina', 'helene', 'martha', 'clara', 'emma', 'lena', 'julia', 'lisa', 'sabine', 'susanne',
  'ursula', 'monika', 'petra', 'andrea', 'barbara', 'eva', 'gertrud', 'charlotte', 'dorothea',
  'peter', 'hans', 'karl', 'johann', 'heinrich', 'friedrich', 'wilhelm', 'georg', 'josef', 'joseph',
  'franz', 'otto', 'paul', 'thomas', 'michael', 'klaus', 'martin', 'stefan', 'andreas', 'christian',
  'wolfgang', 'jürgen', 'hermann', 'walter', 'kurt', 'helmut', 'gerhard', 'werner', 'günter',
  'ludwig', 'rudolf', 'gustav', 'albert', 'richard', 'johannes', 'jakob', 'lukas', 'felix', 'jonas',
  'alexander', 'daniel', 'david', 'tobias', 'matthias', 'markus', 'philipp', 'fritz', 'august', 'adolf',
])

const TRENNBAR = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'fort', 'her', 'hin', 'los', 'mit', 'nach', 'nieder', 'vor', 'weg', 'zu', 'zurück', 'zusammen', 'dar', 'durch', 'um', 'über', 'unter', 'wieder', 'heim', 'herum']
const DOPPELPRAEFIXE = ['herein', 'heraus', 'herauf', 'herab', 'herunter', 'hinein', 'hinaus', 'hinauf', 'hinab', 'hinunter', 'voran', 'vorbei', 'davon', 'empor']
const UMLAUT_ZURUECK = { ä: 'a', ö: 'o', ü: 'u', äu: 'au' }

const gross = (w) => w.charAt(0).toUpperCase() + w.slice(1)
const zahl = (n) => Number(n).toLocaleString('de-DE')

/**
 * Singular-Kandidaten einer möglichen Pluralform: Wasserräder → Wasserrad, Oden → Ode.
 * „-er“ nur mit Umlaut (Bohrlöcher → Bohrloch), sonst träfe es Krieger → Krieg.
 */
export function singularKandidaten(w) {
  const low = String(w).toLowerCase()
  const k = new Set()
  for (const end of ['en', 'n', 'e', 's']) if (low.endsWith(end) && low.length > end.length + 2) k.add(low.slice(0, -end.length))
  const mitEr = low.endsWith('er') && low.length > 4 ? low.slice(0, -2) : null
  const mitE = low.endsWith('e') && low.length > 3 ? low.slice(0, -1) : null
  for (const s of [...k, mitEr, mitE].filter(Boolean)) {
    const i = Math.max(s.lastIndexOf('äu'), s.lastIndexOf('ä'), s.lastIndexOf('ö'), s.lastIndexOf('ü'))
    if (i < 0) continue
    const lang = s.slice(i, i + 2) === 'äu' ? 2 : 1
    k.add(s.slice(0, i) + UMLAUT_ZURUECK[s.slice(i, i + lang)] + s.slice(i + lang))
  }
  k.delete(low)
  return [...k]
}

/** Kaputte Verbform „Präfix + ge + Verb“ (eingeleiten → einleiten), sonst null. */
export function verbOhneGe(w) {
  const low = String(w).toLowerCase()
  // Längere Präfixe zuerst (herein vor her), dazu der Einschub „en“ (hereinenbringen)
  for (const p of [...TRENNBAR, ...DOPPELPRAEFIXE].sort((a, b) => b.length - a.length)) {
    for (const einschub of ['ge', 'en']) {
      if (!low.startsWith(p + einschub)) continue
      const rest = low.slice(p.length + einschub.length)
      if (rest.length >= 4 && /n$/.test(rest)) return p + rest
    }
  }
  return null
}

/**
 * Häufigster Kandidat, der als Wortart deutlich häufiger ist als die Form selbst
 * (Schwellen wie beim Plural), sonst null.
 */
function deutlichHaeufiger(form, kandidaten, pos, posFreq) {
  const eigen = posFreq(form, pos)
  const best = [...new Set(kandidaten)].filter((s) => s && s !== form)
    .map((s) => ({ s, f: posFreq(s, pos) }))
    .sort((a, b) => b.f - a.f)[0]
  if (!best || best.f <= VERDACHT.pluralMinSingular || best.f <= eigen * VERDACHT.pluralFaktor) return null
  return { ...best, eigen }
}

/** Vorschlag für eine auffällige Schreibung: jeder Teil nach Bindestrich groß. */
const schreibVorschlag = (wort) => wort.split('-').map((t) => (t.length ? gross(t) : t)).join('-')

/**
 * Verdachtsgründe für einen Kollokator.
 *
 * @param {object} p
 * @param {string} p.basis       Basis wie im Tag-Editor
 * @param {string} p.basisPos
 * @param {{ wort: string, dbLemma?: string, pos: string, frequenz?: number|null }} p.eintrag
 * @param {object} lookup
 * @param {(lemma: string, pos: string) => number} lookup.posFreq Korpusvorkommen als Wortart
 * @param {(lemma: string) => { summe: number, modern: number, topQuelle: string|null, topAnteil: number }} lookup.quellen
 * @param {{ wenigeBelege?: boolean }} [optionen] wenigeBelege: false im logDice-Rückfall
 * @returns {{ gruende: Array<{ code: string, text: string }>, ersatz: string|null, schreibung: string|null } | null}
 *   null = unverdächtig; ersatz = vorgeschlagenes Lemma, schreibung = vorgeschlagene Schreibweise
 */
export function pruefeVerdacht({ basis, basisPos, eintrag }, { posFreq, quellen }, { wenigeBelege = true } = {}) {
  const db = String(eintrag.dbLemma ?? eintrag.wort)
  const dbLow = db.toLowerCase()
  const wort = String(eintrag.wort)
  // Hat die Korrekturschicht das Wort schon ersetzt, sind Plural- und Verbform-Funde erledigt
  const korrigiert = wort.toLowerCase() !== dbLow
  const gruende = []
  let ersatz = null
  let schreibung = null

  if (eintrag.pos === 'Substantiv' && !korrigiert) {
    const eigen = posFreq(dbLow, 'Substantiv')
    const sing = singularKandidaten(dbLow).map((s) => ({ s, f: posFreq(s, 'Substantiv') })).sort((a, b) => b.f - a.f)[0]
    if (sing && sing.f > VERDACHT.pluralMinSingular && sing.f > eigen * VERDACHT.pluralFaktor) {
      gruende.push({ code: 'plural', text: `gebeugte Form? „${gross(sing.s)}“ ist als Substantiv häufiger (${zahl(sing.f)} zu ${zahl(eigen)})` })
      ersatz = gross(sing.s)
    }
  }

  // Abgeschnittenes Substantiv (Nachnam → Nachname, Alarmglock → Alarmglocke)
  if (eintrag.pos === 'Substantiv' && !korrigiert && !ersatz) {
    const voll = deutlichHaeufiger(dbLow, [`${dbLow}e`, `${dbLow}en`], 'Substantiv', posFreq)
    if (voll) {
      gruende.push({ code: 'abgeschnitten', text: `abgeschnittene Form? „${gross(voll.s)}“ ist als Substantiv häufiger (${zahl(voll.f)} zu ${zahl(voll.eigen)})` })
      ersatz = gross(voll.s)
    }
  }

  if (eintrag.pos === 'Verb' && !korrigiert) {
    const ohne = verbOhneGe(dbLow)
    if (ohne && posFreq(ohne, 'Verb') > posFreq(dbLow, 'Verb')) {
      gruende.push({ code: 'verbform', text: `kaputte Verbform? „${ohne}“ ist als Verb häufiger` })
      ersatz = ohne
    } else {
      // Präteritum als Lemma (schwatzten → schwatzen)
      const inf = /te?n?$/.test(dbLow) && dbLow.length > 5
        ? deutlichHaeufiger(dbLow, [dbLow.replace(/te?n?$/, 'en'), dbLow.replace(/te?n?$/, 'n')], 'Verb', posFreq)
        : null
      if (inf) {
        gruende.push({ code: 'verbform', text: `gebeugte Verbform? „${inf.s}“ ist als Verb häufiger` })
        ersatz = inf.s
      }
    }
  }

  // Gebeugtes Adjektiv als Lemma (vermeintliche → vermeintlich)
  if (eintrag.pos === 'Adjektiv' && !korrigiert) {
    const stamm = deutlichHaeufiger(dbLow, ['e', 'en', 'er', 'es', 'em'].filter((end) => dbLow.endsWith(end) && dbLow.length > end.length + 3).map((end) => dbLow.slice(0, -end.length)), 'Adjektiv', posFreq)
    if (stamm) {
      gruende.push({ code: 'adjektivform', text: `gebeugte Form? „${stamm.s}“ ist als Adjektiv häufiger` })
      ersatz = stamm.s
    }
  }

  if (basisPos === 'Verb' && eintrag.pos !== 'Substantiv' && partizipFormen(basis).has(dbLow)) {
    gruende.push({ code: 'partizip', text: 'Partizip der Basis' })
  }

  const q = quellen(dbLow)
  if (q && q.summe > 0) {
    if (q.modern < VERDACHT.historisch) {
      gruende.push({ code: 'historisch', text: `historisch: nur ${Math.round(q.modern * 100)} % aus modernen Quellen` })
    }
    if (q.topAnteil >= VERDACHT.eineQuelle && q.topQuelle && !BREITE_QUELLEN.has(q.topQuelle)) {
      gruende.push({ code: 'eine_quelle', text: `${Math.round(q.topAnteil * 100)} % aus einer Quelle (${q.topQuelle})` })
    }
  }

  if (eintrag.pos === 'Substantiv' && VORNAMEN.has(dbLow)) {
    gruende.push({ code: 'vorname', text: 'Vorname' })
  }

  // Im logDice-Rückfall (seltene Basen) sind fast alle Paare selten: dort kein Hinweis
  if (wenigeBelege && eintrag.frequenz != null && eintrag.frequenz < VERDACHT.wenigeBelege) {
    gruende.push({ code: 'wenige_belege', text: `nur ${zahl(eintrag.frequenz)} Belege für das Paar` })
  }

  if (/\d/.test(wort) || (eintrag.pos === 'Substantiv' && /-[a-zäöü]/.test(wort))) {
    gruende.push({ code: 'schreibung', text: 'auffällige Schreibung' })
    if (!/\d/.test(wort)) schreibung = schreibVorschlag(wort)
  }

  return gruende.length ? { gruende, ersatz, schreibung } : null
}
