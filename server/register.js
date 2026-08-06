/**
 * register.js – Registerprofil eines Lemmas („In welcher Textsorte ist dieses
 * Wort auffällig häufig?“)
 *
 * Grundlage ist `lemma_corpus_freq` in wortprofil_v2.db: 25.871.807 Zeilen mit
 * der Häufigkeit je (Lemma, Wortart, Korpus) über 34 Korpora und 2,19 Mrd.
 * Token. Die Tabelle lag seit dem v2-Aufbau ungenutzt herum — der Backlog führte
 * dieses Feature unter „Langfristig“, weil er noch vom v1-Stand ausging, wo es
 * die Tabelle nicht gab und ein mehrstündiger spaCy-Lauf nötig gewesen wäre.
 *
 * ── Warum Auffälligkeit und nicht Häufigkeit ─────────────────────────────────
 * Der ursprüngliche Plan war ein Rang („Top-10-Wort im Bundestagskorpus?“).
 * Gemessen liefert das für fast jedes Wort dieselbe Antwort, weil die größten
 * Korpora gewinnen: `Wasser` steht unter `gei_digital` und `wikipedia`, die
 * häufigsten Verben im Bundestag sind `haben`/`geben`/`machen`/`sagen`.
 *
 * Stattdessen: **beobachtete gegen erwartete Dichte**. Erwartet wird der Anteil,
 * den das Lemma über alle Korpora hat; beobachtet der Anteil im jeweiligen
 * Register. Das Verhältnis ist der angezeigte Faktor. Gemessene Beispiele:
 * `Dampfmaschine` 16,6× in Wissenschaft & Technik, `Liebe` 7,3× in Briefen,
 * `Antrag` 4,6× im Parlament — und `Jahr`/`Tor` bleiben flach bei ~1,6×, was
 * korrekt „dieses Wort hat kein Profil“ heißt.
 *
 * ── Warum Register statt einzelner Korpora ───────────────────────────────────
 * Intern heißen die Korpora `gei_digital`, `dta-dingler`, `bverfg_amtlich`,
 * `jean-paul-briefe` … Für Lernende sagt das nichts, und die kleinsten Korpora
 * (`dta-soldatenbriefe`: 100k Token) schwanken stark. Die Bündelung glättet das
 * und ergibt greifbare Kategorien.
 *
 * ⚠️ **Dieses Modul bleibt abhängigkeitsfrei** — der Archiv-Tab im Frontend
 * importiert es direkt (wie `blurb.js` und `relGlossar.js`), damit die App
 * dieselben Register-Namen und denselben Erklärtext zeigt wie die SSR-Seite.
 * Ein `import logger` würde pino ins Browser-Bundle ziehen. Befunde deshalb
 * zurückgeben statt loggen; das Logging macht der Aufrufer.
 */

/**
 * Korpus → Register. Vollständig: jedes der 34 Korpora aus `lemma_corpus_freq`
 * steht hier oder in AUSGESCHLOSSEN — `pruefeVollstaendigkeit()` erzwingt das.
 *
 * Genrezuordnung nach `wortprofil/KORPORA.md`. Zwei Entscheidungen sind nicht
 * selbsterklärend:
 *  - **Schulbuch (19. Jh.)** ist GEI-Digital und mit 333 Mio. Token das
 *    zweitgrößte Korpus. Die Jahresangabe steht bewusst im Namen: es sind
 *    Lesebücher und Geografiewerke des 19. Jahrhunderts, keine Texte über
 *    Schule. Ohne den Zusatz wirkt `Schüler` → 0,9× wie ein Fehler.
 *  - **Historische Textsammlung** sammelt `dta_kern`/`dta_erweiterungen`. Beide
 *    sind gemischt (Literatur, Sachtext, Wissenschaft, 1600–1900) und lassen
 *    sich keinem Genre zuordnen; die Gruppe ist deshalb nach Epoche benannt.
 */
export const REGISTER = {
  'Enzyklopädie':              ['wikipedia', 'wikibooks', 'wikivoyage'],
  'Presse':                    ['deu_news', 'deu_newscrawl'],
  'Parlament':                 ['bundestag', 'bundestagskorpus_pdf', 'pol_reden', 'reichtagsprotokolle'],
  'Schulbuch (19. Jh.)':       ['gei_digital'],
  'Historische Textsammlung':  ['dta_kern', 'dta_erweiterungen'],
  'Recht':                     ['gesetze', 'bgh', 'bpatg', 'bverwg', 'bgh_strafsachen_hist',
                                'bfh', 'bag', 'bverfg', 'bverfg_amtlich'],
  'Literatur':                 ['dibilit', 'dta-novellenschatz', 'dta-stimm-los', 'neuer_pitaval'],
  'Wissenschaft & Technik':    ['dta-dingler', 'humboldt-publizistik', 'humboldt-digital', 'dibiphil'],
  'Briefe & Alltagszeugnisse': ['jean-paul-briefe', 'dta-soldatenbriefe', 'dta-patiententexte'],
}

/**
 * Bewusst nicht angezeigt: Referenzkorpora für Mittel- und Frühneuhochdeutsch.
 * Phase F3 hat sie aus den Belegen ausgeschlossen („für Spieler unlesbar“) —
 * ein Registerprofil „Mittelhochdeutsch 12×“ wäre aus demselben Grund unnütz.
 * Sie zählen deshalb auch nicht in die Gesamtsumme, aus der sich der
 * Erwartungswert ergibt.
 */
export const AUSGESCHLOSSEN = ['ref_fnh', 'ref_mhd']

/**
 * Erklärung der Kennzahl, für die aufklappbare „Anm."-Box unter dem Block.
 *
 * Steht bewusst NICHT dauerhaft unter jedem Eintrag: Der Text ist länger als der
 * Inhalt, den er erklärt, und wiederholt sich auf jeder Wortseite. Das Archiv hat
 * für genau diesen Fall schon ein Muster — die „Anm."-Klappbox unter der
 * Muster-Tabelle.
 *
 * Die Tokenzahl ist gerundet und steht nur hier; die exakten Werte loggt
 * `waermeRegisterAuf()` beim Start, damit beide nicht auseinanderlaufen.
 */
export const REGISTER_METHODIK =
  'Verglichen wird, wie dicht ein Wort in einer Textsorte vorkommt — gemessen am '
  + 'Durchschnitt über alle Texte. „9-mal so oft wie üblich" heißt also: In dieser '
  + 'Textsorte steht das Wort auf gleich viel Text neunmal so häufig wie sonst. '
  + 'Grundlage sind 34 Korpora mit rund 2,2 Milliarden Wortvorkommen, von '
  + 'Gerichtsentscheidungen über Zeitungstexte bis zu historischen Briefen. '
  + 'Aufgeführt sind nur Textsorten, in denen das Wort mindestens doppelt so dicht '
  + 'vorkommt wie im Schnitt — bei vielen Wörtern trifft das auf keine zu.'

/** Überschrift der Klappbox, im Duktus des Beziehungs-Glossars darüber. */
export const REGISTER_ANM_TITEL = 'Wie ist „so oft wie üblich" gemeint?'

/**
 * Die Kennzahl in Worten: „9-mal so oft wie üblich".
 *
 * **Gerundet auf ganze Zahlen.** Die Nachkommastelle (8,9×) täuscht eine
 * Genauigkeit vor, die die Daten nicht hergeben: Der Faktor hängt an der
 * Korpuszusammensetzung, nicht an einer Messung mit Fehlerbalken. Und „8,9×"
 * ist Statistiker-Deutsch — verglichen wird eine Dichte mit einer erwarteten
 * Dichte, was ohne Vorwissen nicht lesbar ist.
 */
export function faktorText(faktor) {
  return `${Math.round(faktor)}-mal so oft wie üblich`
}

const KORPUS_ZU_REGISTER = new Map()
for (const [reg, korpora] of Object.entries(REGISTER)) {
  for (const k of korpora) KORPUS_ZU_REGISTER.set(k, reg)
}

/**
 * Mindesthäufigkeit im Register, damit ein Eintrag angezeigt wird. Schützt vor
 * Zufallsausschlägen aus den kleinen Korpora: „Briefe & Alltagszeugnisse“ hat
 * nur 2 Mio. Token, dort reichen wenige Treffer für einen hohen Faktor.
 * Gemessen an den 40 häufigsten Substantiven ändert die Schwelle wenig
 * (30 → 300 verschiebt 4 auf 3 von 40 Spitzenplätzen), sie ist reiner Schutz
 * gegen den Randfall.
 */
export const MIN_FREQ_REGISTER = 30

/**
 * Ab welchem Faktor ein Register als „auffällig“ gilt: **mindestens doppelt so
 * häufig wie erwartet**.
 *
 * An den 325 Archiv-Lemmata gemessen:
 *   1,5× → 97 % der Wörter bekommen ein Profil (Ø 2,0 Register)
 *   2,0× → 78 % (Ø 1,5 Register)   ← gewählt
 *   3,0× → 34 % (Ø 1,1 Register)
 *
 * Bei 1,5 rutscht Rauschen durch: `Jahr` stünde mit „Enzyklopädie 1,6×“ da,
 * `Tor` mit „Presse 1,6×“ — beides sind Allerweltswörter ohne Profil. Bei 2,0
 * fallen genau die weg (`alt`, `arbeiten`, `amerikanisch`, `Apotheke` zeigen
 * nichts mehr), während die aussagekräftigen bleiben: `Alkohol` 8,9× in
 * Wissenschaft & Technik, `analog` 3,4× in Recht, `abstürzen` 3,1× in Presse.
 * „Kein Profil“ ist damit eine belastbare Aussage und kein Datenloch.
 */
export const MIN_FAKTOR = 2.0

/**
 * Prüft beim Start, dass die Zuordnung zur Datenbank passt. Ein Korpus, das
 * niemand zugeordnet hat, würde sonst stillschweigend aus dem Erwartungswert
 * fallen und alle Faktoren leicht verfälschen.
 *
 * @param {string[]} korpusNamen  alle `quelle`-Werte aus lemma_corpus_freq
 * @returns {{fehlend: string[], unbekannt: string[]}}
 */
export function pruefeVollstaendigkeit(korpusNamen) {
  const zugeordnet = new Set([...KORPUS_ZU_REGISTER.keys(), ...AUSGESCHLOSSEN])
  const vorhanden = new Set(korpusNamen)
  return {
    fehlend: korpusNamen.filter(k => !zugeordnet.has(k)),
    unbekannt: [...zugeordnet].filter(k => !vorhanden.has(k)),
  }
}

/** Register eines Korpus, oder null wenn ausgeschlossen/unbekannt. */
export function registerFuer(korpus) {
  return KORPUS_ZU_REGISTER.get(korpus) ?? null
}

/**
 * Rechnet Korpus-Summen zu Register-Summen zusammen.
 *
 * @param {Array<{quelle: string, f: number}>} korpusSummen
 * @returns {{proRegister: Map<string, number>, gesamt: number}}
 */
export function fasseSummenZusammen(korpusSummen) {
  const proRegister = new Map()
  let gesamt = 0
  for (const { quelle, f } of korpusSummen) {
    const reg = registerFuer(quelle)
    if (!reg) continue                    // ausgeschlossen → zählt nirgends mit
    proRegister.set(reg, (proRegister.get(reg) ?? 0) + f)
    gesamt += f
  }
  return { proRegister, gesamt }
}

/**
 * Baut aus den Korpus-Häufigkeiten eines Lemmas das Registerprofil.
 *
 * @param {Array<{quelle: string, freq: number}>} zeilen  Zeilen für EIN Lemma
 * @param {{proRegister: Map<string, number>, gesamt: number}} summen
 * @param {{limit?: number}} opts
 * @returns {Array<{register: string, faktor: number, frequenz: number}>}
 */
export function baueProfil(zeilen, summen, { limit = 3 } = {}) {
  const jeRegister = new Map()
  let summeLemma = 0
  for (const { quelle, freq } of zeilen) {
    const reg = registerFuer(quelle)
    if (!reg) continue
    jeRegister.set(reg, (jeRegister.get(reg) ?? 0) + freq)
    summeLemma += freq
  }
  if (!summeLemma || !summen.gesamt) return []

  const erwartet = summeLemma / summen.gesamt
  return [...jeRegister]
    .filter(([reg, f]) => f >= MIN_FREQ_REGISTER && summen.proRegister.get(reg))
    .map(([reg, f]) => ({
      register: reg,
      frequenz: f,
      faktor: Number(((f / summen.proRegister.get(reg)) / erwartet).toFixed(1)),
    }))
    .filter(r => r.faktor >= MIN_FAKTOR)
    .sort((a, b) => b.faktor - a.faktor)
    .slice(0, limit)
}
