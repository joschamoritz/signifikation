// Korrekturschicht für Kollokatoren aus wortprofil_v2.db (Spiel „Kollokationen“).
//
// Die Korpus-DB ist statisch und readonly, ihre Lemmatisierung hat aber
// systematische Fehler, die mit der neuen Rangfolge (frequency × logDice) bis
// in die Top 3 kommen (Bestandsaufnahme: planning/Kollokatoren-Datenfehler.md):
//
//   • gebeugte Formen als Lemma: „Preisen“ (612.686 Vorkommen) statt „Preis“
//     (21.083), Titeln, Abfällen, Hängen, Wasserräder, Elter (= Eltern)
//   • kaputte Verbformen: eingeleiten, niedergedrücken, komponiern, erschraken
//   • Partizip neben dem Verb in derselben Liste: gebaut + bauen, gedrückt + drücken
//   • Kleinschreibung bei Namen und Abkürzungen: berliner Zeitung, Us-präsident
//   • Fachsprache aus Gerichts- und Patentkorpora: Schutzhindernis, Anmelderin
//
// Dieses Modul ist rein (keine DB): Wer Häufigkeiten braucht (Ortsadjektive,
// Fachquellen), reicht sie hinein. Die Listen sind von Hand gesichtet; neue
// Funde liefert `node scripts/kollokatoren-datenfehler.mjs`.

/**
 * Funktionswörter, Mengen- und Ordnungswörter, Hilfs- und Stützverben: passen zu
 * fast allem und sind keine Kollokatoren im Sinne des Spiels (Kollokationen-Umkehr.md,
 * Stufe 0: Verben starteten sonst mit kommen/machen/lassen).
 */
export const FUNKTIONSWOERTER = new Set([
  'so', 'hier', 'noch', 'wie', 'mal', 'einmal', 'auch', 'nur', 'schon', 'dann',
  'jetzt', 'da', 'dort', 'immer', 'sehr', 'wieder', 'nicht', 'gar', 'bereits',
  'etwa', 'erst', 'eben', 'doch', 'ja', 'nun', 'heute', 'bald', 'oft', 'selbst',
  'also', 'ebenfalls', 'zudem', 'dabei', 'damit', 'dazu', 'darauf', 'davon',
  'aber', 'wo', 'zunächst', 'sogar', 'vielleicht', 'wohl', 'gerade', 'natürlich',
  'überhaupt', 'trotzdem', 'dennoch', 'jedoch', 'allerdings',
  'erste', 'zweite', 'dritte', 'letzt', 'letzte', 'nächst', 'nächste',
  'solch', 'solche', 'entsprechend', 'weiter', 'weitere', 'ander', 'andere',
  'jede', 'jeder', 'viel', 'viele', 'mehr', 'mehrere', 'wenig', 'wenige',
  'einige', 'beide', 'sonstig', 'sogenannt', 'jeweilig', 'betreffend', 'genannt',
  'folgend', 'bestimmt', 'gewiss', 'ganz', 'eigen', 'haben', 'sein', 'werden',
  'einzig', 'gesamt', 'übrig', 'damalig', 'heutig', 'ehemalig',
  'kommen', 'gehen', 'machen', 'lassen', 'nehmen', 'geben', 'sagen', 'stellen',
  'sehen', 'bringen', 'finden', 'halten', 'legen', 'liegen', 'stehen', 'setzen',
  'zeigen', 'führen', 'bleiben', 'tun', 'dass',
])

// Historische Quellen in lemma_corpus_freq (DTA, historische Schulbücher gei_digital,
// Reichstag, Literatur): zusammen 37 % des Korpus.
const HISTORISCHE_QUELLEN = /^(dta|gei_digital|dibilit|dibiphil|reichtagsprotokolle|humboldt|jean-paul|neuer_pitaval|ref_|bgh_strafsachen_hist)/

/**
 * Quellenprofil eines Kollokators aus den Zeilen von lemma_corpus_freq.
 * @param {Array<{ quelle: string, f: number }>} zeilen Summen je Quelle
 * @returns {{ summe: number, modern: number, topQuelle: string|null, topAnteil: number }}
 *   modern = Anteil moderner Quellen (0–1), topAnteil = Anteil der stärksten Einzelquelle
 */
export function quellenProfil(zeilen) {
  const summe = zeilen.reduce((s, r) => s + r.f, 0)
  if (!summe) return { summe: 0, modern: 0, topQuelle: null, topAnteil: 0 }
  const modern = zeilen.filter((r) => !HISTORISCHE_QUELLEN.test(r.quelle)).reduce((s, r) => s + r.f, 0) / summe
  const top = zeilen.reduce((a, b) => (b.f > a.f ? b : a))
  return { summe, modern, topQuelle: top.quelle, topAnteil: top.f / summe }
}

/** Gebeugte oder kaputte Formen → richtiges Lemma. Schlüssel `Wortart:lemma` (klein). */
export const ERSETZT = new Map(Object.entries({
  // Substantive: Plural- und Dativformen als Lemma
  'Substantiv:abfallen': 'Abfall', 'Substantiv:abfällen': 'Abfall',
  'Substantiv:abhangen': 'Abhang', 'Substantiv:abhängen': 'Abhang',
  'Substantiv:alexande': 'Alexander',
  'Substantiv:alarmglock': 'Alarmglocke',
  'Substantiv:anmerkungen': 'Anmerkung', 'Substantiv:anschauungen': 'Anschauung',
  'Substantiv:arbeiten': 'Arbeit',
  'Substantiv:auerochsen': 'Auerochse',
  'Substantiv:bandnamen': 'Bandname', 'Substantiv:beinamen': 'Beiname',
  'Substantiv:beethove': 'Beethoven',
  'Substantiv:blättern': 'Blatt', 'Substantiv:blicken': 'Blick',
  'Substantiv:bohrlöcher': 'Bohrloch', 'Substantiv:buchen': 'Buche',
  'Substantiv:bundesvorsitzenden': 'Bundesvorsitzende',
  'Substantiv:dachse': 'Dachs', 'Substantiv:decken': 'Decke',
  'Substantiv:dichtungen': 'Dichtung', 'Substantiv:drachen': 'Drache',
  'Substantiv:drucken': 'Druck', 'Substantiv:ehren': 'Ehre', 'Substantiv:eilen': 'Eile',
  'Substantiv:elter': 'Eltern',
  'Substantiv:erlassen': 'Erlass',
  'Substantiv:ferngläser': 'Fernglas', 'Substantiv:feste': 'Fest', 'Substantiv:filmen': 'Film',
  'Substantiv:folgerunge': 'Folgerung', 'Substantiv:handlunge': 'Handlung',
  'Substantiv:geburtstage': 'Geburtstag', 'Substantiv:gesimse': 'Gesims', 'Substantiv:gewände': 'Gewand',
  'Substantiv:hangen': 'Hang', 'Substantiv:hängen': 'Hang',
  'Substantiv:hengste': 'Hengst', 'Substantiv:kobolde': 'Kobold', 'Substantiv:komplimente': 'Kompliment',
  'Substantiv:küssen': 'Kuss', 'Substantiv:lachse': 'Lachs', 'Substantiv:landsknechte': 'Landsknecht',
  'Substantiv:lichte': 'Licht', 'Substantiv:mikroskope': 'Mikroskop', 'Substantiv:mysterie': 'Mysterium',
  'Substantiv:nachlassen': 'Nachlass', 'Substantiv:nachnam': 'Nachname',
  'Substantiv:objektive': 'Objektiv', 'Substantiv:oden': 'Ode',
  'Substantiv:pauken': 'Pauke', 'Substantiv:pfeifen': 'Pfeife', 'Substantiv:plane': 'Plan',
  'Substantiv:preisen': 'Preis', 'Substantiv:psalmen': 'Psalm',
  'Substantiv:schußwaff': 'Schusswaffe',
  'Substantiv:rehe': 'Reh', 'Substantiv:robben': 'Robbe', 'Substantiv:ruhen': 'Ruhe',
  'Substantiv:sekunden': 'Sekunde', 'Substantiv:seminarräume': 'Seminarraum',
  'Substantiv:sommerspiel': 'Sommerspiele', 'Substantiv:sommerspielen': 'Sommerspiele',
  'Substantiv:winterspiel': 'Winterspiele', 'Substantiv:winterspielen': 'Winterspiele',
  'Substantiv:sowjetrepubliken': 'Sowjetrepublik', 'Substantiv:staatsanleihen': 'Staatsanleihe',
  'Substantiv:stammen': 'Stamm', 'Substantiv:stereotype': 'Stereotyp', 'Substantiv:steuern': 'Steuer',
  'Substantiv:stoßen': 'Stoß', 'Substantiv:strahlen': 'Strahl', 'Substantiv:streichen': 'Streich',
  'Substantiv:streichquartette': 'Streichquartett', 'Substantiv:strömen': 'Strom', 'Substantiv:stürmen': 'Sturm',
  'Substantiv:teleskope': 'Teleskop', 'Substantiv:titeln': 'Titel',
  'Substantiv:transformatore': 'Transformator', 'Substantiv:trockentäler': 'Trockental', 'Substantiv:türe': 'Tür',
  'Substantiv:umstehen': 'Umstehende',
  'Substantiv:verbindungsdate': 'Verbindungsdaten',
  'Substantiv:videobänder': 'Videoband', 'Substantiv:volker': 'Volk', 'Substantiv:vorschauen': 'Vorschau',
  'Substantiv:vorsitzen': 'Vorsitz',
  'Substantiv:wasserfälle': 'Wasserfall', 'Substantiv:wasserräder': 'Wasserrad',
  'Substantiv:weichen': 'Weiche', 'Substantiv:weilen': 'Weile', 'Substantiv:zeugen': 'Zeuge',
  // Verben: kaputte Infinitive
  'Verb:eingeleiten': 'einleiten', 'Verb:niedergedrücken': 'niederdrücken',
  'Verb:zusammengeleben': 'zusammenleben', 'Verb:hereinenbringen': 'hereinbringen',
  'Verb:komponiern': 'komponieren', 'Verb:erschraken': 'erschrecken', 'Verb:ruhn': 'ruhen',
  // Adjektive
  'Adjektiv:bewußen': 'bewusst', 'Adjektiv:bös': 'böse',
}))

/** Lemmata, die nie als Kollokator erscheinen sollen (Parserreste, Fachjargon ohne Alltagsbezug). */
export const GESPERRT = new Set([
  // Parserreste und kaputte Lemmata
  'Substantiv:jch', 'Substantiv:du', 'Substantiv:suit', 'Substantiv:demosthen',
  'Substantiv:widerstehen', 'Verb:pfarren', 'Verb:weiten', 'Verb:meisen', 'Verb:dagesessen',
  'Verb:zusammenfangen',
  // Fachjargon unter der Schwelle von istFachsprache
  'Substantiv:schutzhindernis', 'Substantiv:regelungslücke', 'Substantiv:spritzversteller',
  'Substantiv:beratungsdienstleistung',
  // Nicht für ein Schulspiel: sexualisierte Gewalt, Missbrauch, Schimpfwörter
  'Adjektiv:kinderpornographisch', 'Adjektiv:kinderpornografisch',
  'Verb:vergewaltigen', 'Substantiv:vergewaltigung', 'Substantiv:krüppel',
])

/**
 * Korrekturen, die nur bei einer bestimmten Basis gelten. Schlüssel `basis|kollokator`
 * (klein), Wert = richtiges Lemma oder null (bei dieser Basis sperren).
 * „Datum“ steht im Korpus fast immer für „Daten“, ist aber auch ein eigenes Wort.
 */
export const PAAR = new Map(Object.entries({
  'speichern|datum': 'Daten', 'verarbeiten|datum': 'Daten', 'übermitteln|datum': 'Daten',
  'erheben|datum': 'Daten', 'archivieren|datum': 'Daten', 'erfassen|datum': 'Daten',
  'erklären|herr': null, // Parlamentsfloskel „Herr … erklärt“
  'immatrikulieren|leiden': null, // Universität Leiden
  // Verfolgungskontext aus historischen Quellen, im Spiel ohne Einordnung nicht vertretbar
  'verstecken|jude': null, 'beschuldigen|jude': null,
  'filmen|missbrauchen': null,
  // Neubau-Probelauf 2026-11-21: Parserreste und Zufallstreffer in den Top 3
  'heiraten|anna': null, // Vorname aus Biografien
  'artig|nuss': null, // zerlegtes „nussartig“
  'knien|handschuh': null, 'knien|juda': null, 'knien|staufe': null, 'frieren|schenken': null,
  'antarktisch|ross': null, 'antarktisch|name': null, // Rossmeer, „antarktischer Name“
}))

// Abkürzungen, die im Korpus kleingeschrieben vorliegen (DB-Lemmata sind klein).
const ABKUERZUNGEN = new Map(Object.entries({
  us: 'US', usa: 'USA', ddr: 'DDR', brd: 'BRD', eu: 'EU', uno: 'UNO', nato: 'NATO',
  cd: 'CD', dvd: 'DVD', tv: 'TV', ip: 'IP', pc: 'PC', sos: 'SOS',
}))
// Feste Schreibungen, die keine Regel trifft („rom“ allein ist die Stadt Rom)
const SONDERSCHREIBUNG = new Map(Object.entries({ 'cd-rom': 'CD-ROM', 'ec-karte': 'EC-Karte', versailler: 'Versailler' }))
const EINHEITEN = new Set(['cm', 'mm', 'km', 'kg', 'mg', 'ml', 'kw', 'kwh'])

/** Klein geschriebene Adjektive auf -er, die keine Ortsadjektive sind (sauer ← Sau, inner ← Inn). */
const ADJEKTIVE_AUF_ER = new Set([
  'sicher', 'unsicher', 'düster', 'schwer', 'heiter', 'inner', 'äußer', 'leer', 'bieder', 'bitter',
  'finster', 'locker', 'munter', 'sauber', 'unsauber', 'sauer', 'vorder', 'hinter', 'ober', 'unter',
  'wacker', 'lecker', 'mager', 'tapfer', 'teuer', 'ungeheuer', 'menschenleer', 'integer', 'koscher',
  'heiser', 'lauter', 'schütter',
])

/**
 * Anzeige-Schreibweise eines Kollokators: Substantive groß, Abkürzungen in
 * Großbuchstaben, nach Bindestrich groß (US-Präsident, U-Bahn, CD-ROM), Einheiten
 * klein, Ortsadjektive groß (Berliner Zeitung, Weimarer Republik).
 * @param {string} lemma
 * @param {string} pos
 * @param {{ istOrtsadjektiv?: (lemma: string) => boolean }} [opts]
 */
export function schreibweise(lemma, pos, { istOrtsadjektiv } = {}) {
  const low = String(lemma).toLowerCase()
  if (EINHEITEN.has(low)) return low
  if (SONDERSCHREIBUNG.has(low)) return SONDERSCHREIBUNG.get(low)
  const teile = low.split('-')
  if (teile.length > 1 || ABKUERZUNGEN.has(low)) {
    // Abkürzungen und Einzelbuchstaben groß (US-, U-Bahn, D-Mark); bei Substantiven
    // jeder Teil groß (IP-Adresse), bei Adjektiven der Rest klein (deutsch-französisch, US-amerikanisch)
    return teile.map((t) => {
      if (ABKUERZUNGEN.has(t)) return ABKUERZUNGEN.get(t)
      if (t.length === 1) return t.toUpperCase()
      return pos === 'Substantiv' ? t.charAt(0).toUpperCase() + t.slice(1) : t
    }).join('-')
  }
  if (pos === 'Substantiv') return low.charAt(0).toUpperCase() + low.slice(1)
  if (pos === 'Adjektiv' && low.endsWith('er') && !ADJEKTIVE_AUF_ER.has(low) && istOrtsadjektiv?.(low)) {
    return low.charAt(0).toUpperCase() + low.slice(1)
  }
  return low
}

const TRENNBAR = ['ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'fort', 'her', 'hin', 'los', 'mit', 'nach', 'nieder', 'vor', 'weg', 'zu', 'zurück', 'zusammen', 'dar', 'durch', 'um', 'über', 'unter', 'wieder', 'heim', 'herum']

/** Mögliche Partizip-II-Formen eines Verbs (grob: schwache und starke Bildung, trennbare Präfixe). */
export function partizipFormen(verb) {
  const v = String(verb).toLowerCase()
  const stamm = v.replace(/e?n$/, '')
  const formen = new Set([`ge${stamm}t`, `${stamm}t`, `ge${v}`, `${stamm}et`, `ge${stamm}et`])
  for (const p of TRENNBAR) {
    if (v.startsWith(p) && v.length > p.length + 3) {
      const rest = v.slice(p.length)
      const rs = rest.replace(/e?n$/, '')
      for (const f of [`${p}ge${rs}t`, `${p}ge${rest}`, `${p}ge${rs}et`, `${p}${rs}t`]) formen.add(f)
    }
  }
  formen.delete(v)
  return formen
}

// Starke Partizipien mit Ablaut lassen sich nicht regelhaft bilden (erheben → erhoben).
// Häufige Fälle von Hand; greifen nur, wenn das Verb in derselben Liste steht.
const STARKE_PARTIZIPIEN = new Map(Object.entries({
  erhoben: 'erheben', geschrieben: 'schreiben', geboren: 'gebären', verboten: 'verbieten',
  gezogen: 'ziehen', geschlossen: 'schließen', abgeschlossen: 'abschließen', beschlossen: 'beschließen',
  getroffen: 'treffen', gefunden: 'finden', gesungen: 'singen', geschaffen: 'schaffen',
  verliehen: 'verleihen', ausgestorben: 'aussterben', gebrochen: 'brechen', zerbrochen: 'zerbrechen',
  gesprochen: 'sprechen', geworfen: 'werfen', gestohlen: 'stehlen', verborgen: 'verbergen',
  erschienen: 'erscheinen', bewiesen: 'beweisen', geritten: 'reiten', gegriffen: 'greifen',
  angegriffen: 'angreifen', ergriffen: 'ergreifen', vertrieben: 'vertreiben', getrieben: 'treiben',
  gewonnen: 'gewinnen', begonnen: 'beginnen', gesunken: 'sinken', versunken: 'versinken',
  gestiegen: 'steigen', gebunden: 'binden', verbunden: 'verbinden', geflohen: 'fliehen',
  gelungen: 'gelingen', gezwungen: 'zwingen', erfunden: 'erfinden', empfohlen: 'empfehlen',
  verloren: 'verlieren', gefroren: 'frieren', gelogen: 'lügen', betrogen: 'betrügen',
}))

/**
 * Korrigiert einen Kollokator für eine Basis.
 * @returns {{ lemma: string, pos: string } | null} null = sperren
 */
export function korrigiere(basis, lemma, pos) {
  const b = String(basis).toLowerCase()
  const low = String(lemma).toLowerCase()
  const paar = `${b}|${low}`
  if (PAAR.has(paar)) {
    const ziel = PAAR.get(paar)
    return ziel === null ? null : { lemma: ziel, pos }
  }
  const key = `${pos}:${low}`
  if (GESPERRT.has(key)) return null
  if (ERSETZT.has(key)) return { lemma: ERSETZT.get(key), pos }
  return { lemma, pos }
}

// Gerichts-, Patent- und Gesetzeskorpora. Kommt ein Kollokator zu ≥ 75 % aus
// einer davon, ist er Fachjargon (Anmelderin 98 % bpatg, Magnetaufzeichnungsträger
// 99 %, Leistungsbereitstellung 91 % bverwg). Darunter bleiben Alltagswörter mit
// starker Gerichtsquote drin (Marke 73 %, Ware 66 %).
const FACHQUELLEN = new Set(['bpatg', 'bgh', 'bag', 'bfh', 'bverfg', 'bverfg_amtlich', 'bverwg', 'gesetze', 'bgh_strafsachen_hist'])
export const FACHSPRACHE_ANTEIL = 0.75

/** @param {{ topQuelle: string|null, topAnteil: number }} q */
export function istFachsprache(q) {
  return !!q && q.topAnteil >= FACHSPRACHE_ANTEIL && FACHQUELLEN.has(q.topQuelle)
}

/**
 * Führt Einträge zusammen, die nach der Korrektur dasselbe Wort sind (Preisen + Preis),
 * und Partizipien in ihr Verb (gebaut → bauen), wenn beide in der Liste stehen.
 * Frequenzen werden addiert, logDice nimmt den höheren Wert.
 * @param {Array<{ lemma: string, pos: string, f: number, d: number }>} eintraege bereits korrigiert
 */
export function fuehreZusammen(eintraege) {
  const nachWort = new Map()
  for (const e of eintraege) {
    const k = e.lemma.toLowerCase()
    const da = nachWort.get(k)
    if (!da) nachWort.set(k, { ...e })
    else {
      if (e.d > da.d) Object.assign(da, { ...e, f: da.f + e.f })
      else da.f += e.f
    }
  }
  const verschmelze = (ziel, quelle, k) => {
    ziel.f += quelle.f
    ziel.d = Math.max(ziel.d, quelle.d)
    nachWort.delete(k)
  }
  // 1. Partizip ins Verb (gebaut → bauen, erhoben → erheben)
  const verben = [...nachWort.values()].filter((e) => e.pos === 'Verb')
  const formZuVerb = new Map()
  for (const v of verben) for (const f of partizipFormen(v.lemma)) if (!formZuVerb.has(f)) formZuVerb.set(f, v)
  for (const [form, inf] of STARKE_PARTIZIPIEN) {
    const v = verben.find((x) => x.lemma.toLowerCase() === inf)
    if (v && !formZuVerb.has(form)) formZuVerb.set(form, v)
  }
  for (const [k, e] of [...nachWort]) {
    if (e.pos === 'Substantiv') continue
    const v = formZuVerb.get(k)
    if (v && v !== e && nachWort.has(v.lemma.toLowerCase())) verschmelze(v, e, k)
  }
  // 2. Als Adjektiv getaggter Infinitiv ins Partizip („vereinbarte Waffenruhe“ steht
  //    teils als Adjektiv „vereinbaren“ in der DB, teils als „vereinbart“)
  for (const [k, e] of [...nachWort]) {
    if (e.pos !== 'Adjektiv' || !/e?n$/.test(k)) continue
    const partizip = [...partizipFormen(k)].map((f) => nachWort.get(f)).find((x) => x && x !== e && x.pos === 'Adjektiv')
    if (partizip) verschmelze(partizip, e, k)
  }
  return [...nachWort.values()]
}
