/**
 * server/course/literatur.js
 *
 * Beleg-Register für den Kurs-Tab: Kurz-Key → volle Zitation (Fußnoten).
 * Single Source ist planning/Kurs-Literatur.md (Belegpflicht, Kurs-Tab-Planung
 * §0a). Hier nur die Keys, die der Kurs-Content + die Stundenentwürfe tatsächlich
 * referenzieren — bewusst keine Voll-Spiegelung des Registers, damit nichts
 * doppelt gepflegt werden muss. Neue Belege im Content ⇒ Key hier ergänzen.
 *
 * Reine Daten, kein DB-/FS-Zugriff → unit-testbar und seiteneffektfrei.
 */

/** key → { kurz, voll }. `kurz` = kompakte Quellenangabe für die Fußzeile. */
export const LITERATUR = {
  // ── Kollokationen & usuelle Wortverbindungen ──────────────────────
  'bubenhofer-2015': {
    kurz: 'Bubenhofer 2015',
    voll: 'Bubenhofer, Noah (2015): Muster aus korpuslinguistischer Sicht. In: Dürscheid/Schneider (Hrsg.): Handbuch Satz – Äußerung – Schema. Berlin/New York: De Gruyter, S. 485–502.',
  },
  'reder-2006': {
    kurz: 'Reder 2006',
    voll: 'Reder, Anna (2006): Kollokationsforschung und Kollokationsdidaktik. In: Linguistik online 28, 3/06.',
  },
  'steyer-2000': {
    kurz: 'Steyer 2000',
    voll: 'Steyer, Kathrin (2000): Usuelle Wortverbindungen des Deutschen. In: Deutsche Sprache 28, H. 2, S. 101–125.',
  },
  'malloggi-2021': {
    kurz: 'Malloggi 2021',
    voll: 'Malloggi, Patrizio (2021): Zur Förderung der Kollokationskompetenz in der DaF-/DaZ-Didaktik anhand von DWDS-Korpora. In: KorDaF 1/1.',
  },
  'bildung-rp-kollokationen': {
    kurz: 'Bildung-RP: Kollokationen',
    voll: 'Kollokationen. Handreichung Sprachförderung, Pädagogisches Landesinstitut Rheinland-Pfalz (bildung-rp.de).',
  },
  'luedeling-walter-2009': {
    kurz: 'Lüdeling/Walter 2009',
    voll: 'Lüdeling, Anke / Walter, Maik (2009): Korpuslinguistik für Deutsch als Fremdsprache. Sprachvermittlung und Spracherwerbsforschung.',
  },
  // Hausmanns Basis–Kollokator-Dichotomie (die „Momo"-Passage: Anker lichten,
  // Tisch decken – Basis banal/übersetzbar, Kollokator unvorhersehbar) trägt die
  // Station-①-Terminologie (SekI: Basis + Kollokator).
  'hausmann-wortverbindungen': {
    kurz: 'Hausmann 2004',
    voll: 'Hausmann, Franz Josef (2004): Was sind eigentlich Kollokationen? In: Steyer, Kathrin (Hrsg.): Wortverbindungen – mehr oder weniger fest. (IDS Jahrbuch 2003). Berlin/New York: de Gruyter, S. 309–334 (Basis–Kollokator-Dichotomie).',
  },

  // ── Semantik: Bedeutung, Konnotation, semantische Prosodie (Station ①) ──
  // Löbner Kap. 2 (deskriptive vs. nichtdeskriptive – soziale/expressive –
  // Bedeutung) + §2.5 Konnotationen trägt den SekII-Block „Denotation/Konnotation".
  'loebner-semantik': {
    kurz: 'Löbner 2003',
    voll: 'Löbner, Sebastian (2003): Semantik. Eine Einführung. Berlin/New York: de Gruyter (de Gruyter Studienbuch), Kap. 2 (deskriptive/soziale/expressive Bedeutung, § 2.5 Konnotationen).',
  },
  // Hanks: „semantische Prosodie" (nach Louw 1993) + axiologisches Quale (incite
  // negativ vs. encourage neutral/positiv) trägt den LK-Block (Wörter „färben"
  // ihre Umgebung); Bedeutung ist Sache der Analyse, nicht der Frequenz.
  'hanks-bedeutungen': {
    kurz: 'Hanks 2011',
    voll: 'Hanks, Patrick (2011): Wie man aus Wörtern Bedeutungen macht: Semantische Typen treffen Valenzen. In: Engelberg/Holler/Proost (Hrsg.): Sprachliches Wissen zwischen Lexikon und Grammatik. (IDS Jahrbuch 2011). Berlin/Boston: de Gruyter, S. 483–503 (semantische Prosodie nach Louw 1993).',
  },

  // ── Wortarten & Syntax (Station ②/③) ──────────────────────────────
  'hoffmann-leimbrink-wortarten': {
    kurz: 'Hoffmann/Leimbrink',
    voll: 'Hoffmann, Ludger / Leimbrink, Kerstin: Didaktik der Wortarten – Wortarten als Schnittstelle von Wortschatz und Grammatik (DaF); Funktion vor Form.',
  },
  'didaktik-wortarten-d2': {
    kurz: 'Didaktik der Wortarten (D2)',
    voll: '„D2 Didaktik der Wortarten" – Kritik der rein formalen Wortartklassifikation im Grammatikunterricht.',
  },
  'schuetze-2018': {
    kurz: 'Schütze 2018',
    voll: 'Schütze, Hinrich (2018): Syntaktische Funktionen und Dependenzen. Foliensatz, CIS/LMU München (Kopf–Dependent, binäre Relationen, einfache Baumanalysen).',
  },
  // Satzglieder als funktionale Einheiten + Primat der Syntax (Valenz): trägt das
  // Valenz-/Satzglied-Framing in Station ③ (Ergänzung vs. Angabe, Rektion).
  'agel-2017': {
    kurz: 'Ágel 2017',
    voll: 'Ágel, Vilmos (2017): Grammatische Textanalyse. Textglieder, Satzglieder, Wortgruppenglieder. Berlin/Boston: de Gruyter (Satzglieder als funktionale Einheiten; Valenz/Dependenz).',
  },
  'gallmann-2015-topologie': {
    kurz: 'Gallmann 2015',
    voll: 'Gallmann, Peter (2015): Das topologische Modell. Basisartikel. In: Wöllstein (Hrsg.): Das topologische Modell für die Schule. Baltmannsweiler: Schneider Hohengehren (Felder/Satzklammer, Verschiebeprobe, drei Satzformen).',
  },
  // Operationale Proben (Ersatz-/Umstell-/Verschiebeprobe) empirisch untersucht –
  // trägt den Station-②-Baustein „Wortart/Satzglied durch Proben statt Raten".
  'lehmkuhle-2023': {
    kurz: 'Lehmkuhle 2023',
    voll: 'Lehmkuhle, Charlotte (2023): Didaktik der satzinternen Großschreibung. Eine Interventionsstudie zur Adjektiv- und Artikel(wort)probe in der 6. Jahrgangsstufe. Masterarbeit, Univ. Münster, Abt. Sprachdidaktik (operationale Proben: Form vs. syntaktische Funktion).',
  },

  // ── Korpus selbst (kontext: "korpus") ─────────────────────────────
  'korpus-pipeline': {
    kurz: 'Signifikation-Korpus (wortprofil.db)',
    voll: 'Eigene Korpus-Pipeline (öffentliche Korpora: Bundestag, DTA, Leipzig u. a.), spaCy-Dependenzparsing, logDice-Assoziationsmaß. Belegsätze aus belege.db (CC-BY-SA).',
  },
  // Schnupper-Variante für DaZ/SekI-Blätter (④/⑤): kein „logDice" im Zitattext,
  // da der Begriff auf diesen Stufen nicht eingeführt wird (Befund 1, AP11-QA).
  'korpus-pipeline-schnupper': {
    kurz: 'Signifikation-Korpus',
    voll: 'Eigene Korpus-Pipeline (öffentliche Korpora: Bundestag, DTA, Leipzig u. a.). Belegsätze aus belege.db (CC-BY-SA).',
  },

  // ── Didaktik/Methodik & Lehrplan (Stundenentwurf) ─────────────────
  'vonbrand-2010': {
    kurz: 'von Brand 2010',
    voll: 'von Brand, Tilman (2010): Deutsch unterrichten. Seelze: Klett/Kallmeyer, S. 111–114 (Phasenmodelle).',
  },
  'dreiklang-zfsl-re': {
    kurz: 'ZfsL Recklinghausen (GyGe)',
    voll: 'ZfsL Recklinghausen (GyGe): Der didaktische Dreiklang (Gegenstand – Thema – Schwerpunktlernziel).',
  },
  'klp-deutsch-sek1-g9-2019': {
    kurz: 'KLP Deutsch SI (G9) 2019',
    voll: 'MSB NRW (2019): Kernlehrplan Deutsch, Sekundarstufe I – Gymnasium (G9). Inhaltsfeld 1: Sprache.',
  },
  'klp-deutsch-sek2-2025': {
    kurz: 'KLP Deutsch Sek II 2025',
    voll: 'MSB NRW (2025): Kernlehrplan Deutsch, Sekundarstufe II (GOSt). Inhaltsfeld Sprache.',
  },
  'script-leitfaden-2020': {
    kurz: 'SCRIPT-Leitfaden 2020',
    voll: 'Kofler, Karolina (2020): Leitfaden für die Konzeption und Gestaltung didaktischer Materialien (Barrierearmut). Hrsg. SCRIPT, Luxemburg.',
  },
}

/** Volle Zitation oder ein lesbarer Fallback (statt leerer Fußnote). */
export function citation(key) {
  return LITERATUR[key]?.voll ?? `Quelle „${key}" (siehe Kurs-Literatur).`
}

/** Kurzform für enge Stellen (Item-Fuß). */
export function citationShort(key) {
  return LITERATUR[key]?.kurz ?? key
}

/**
 * Sammelt die Belege mehrerer Items zu einer geordneten, deduplizierten
 * Fußnotenliste. Reihenfolge = erstes Auftreten (stabil/reproduzierbar).
 *
 * @param {Array<{beleg?: Array<{key:string, seite?:string, kontext?:string}>}>} items
 * @returns {Array<{ n:number, key:string, voll:string }>}
 */
export function collectFootnotes(items) {
  const seen = new Map()
  for (const item of items) {
    for (const b of item?.beleg ?? []) {
      if (!b?.key || seen.has(b.key)) continue
      seen.set(b.key, { n: seen.size + 1, key: b.key, voll: citation(b.key) })
    }
  }
  return [...seen.values()]
}

export default LITERATUR
