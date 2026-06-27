/**
 * server/course/lesson/station-5.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ⑤ „Belegen statt raten"
 * (Mini-Recherche, Kulmination). Folgt Kurs-Didaktik-Standards §1/§1a/§2/§3/§4.
 *
 * Quelle: planning/Kurs-Station-5-Recherche.md §6 + planning/Kurs-Didaktik-Standards.
 * Phasenmodell: von Brand, Modell 2 „Erarbeitetes anwenden" (forschendes Lernen –
 *   keine neue Regel, sondern Werkzeuge aus ①–④ in eigenem Forschungszyklus anwenden).
 * KLP: Sek II/LK 2025 IF Sprache – semantische/pragmatische Aspekte, Methodenreflexion,
 *   wissenschaftspropädeutisches forschendes Lernen.
 */

export const entwurf5 = {
  stationNo: 5,
  niveau: 'SekII',
  uv: 'Sprache unter der Lupe – Wortverbindungen zwischen freier Wahl und festem Muster',
  sequenz: 'Station ⑤ · Belegen statt raten (Mini-Recherche)',
  stundenthema: '„Eine Frage an die Sprache" – eine eigene Hypothese am Korpus prüfen und begründet beantworten',
  phasenmodell: 'von Brand, Modell 2 (Erarbeitetes anwenden – forschendes Lernen)',

  uvZiele: [
    { text: 'das Verhältnis von Sprache, Denken und Wirklichkeit reflektieren; empirische Methoden zur Sprachuntersuchung einsetzen (wissenschaftspropädeutisch)', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'semantische und pragmatische Aspekte der Sprache erläutern; sprachliche Urteile an Belegen überprüfen', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'sprachlich-stilistische Mittel im Hinblick auf Bedeutung und Wirkung erläutern; Angemessenheit und syntaktische/semantische Variationsbreite überprüfen', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
    { text: 'innere und äußere Mehrsprachigkeit reflektieren; Sprachvarietäten und ihre Funktionen beurteilen', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Station ⑤ ist der didaktische Abschluss der Reihe: Die SuS wenden alle Werkzeuge (Kollokation ①, Wortart ②, Slot ③, logDice ④) in einem eigenen Forschungszyklus an. Das Muster Hypothese → Korpus-Prüfung → Befund-Deutung → Stellungnahme ist wissenschaftspropädeutisch und direkt an die KLP-Sek-II-Kompetenz „Verhältnis Sprache–Denken–Wirklichkeit" angebunden. Von Brand Modell 2 ist hier das richtige Phasenmodell, weil keine neue Regel eingeführt wird, sondern erarbeitetes Wissen in neuem Kontext angewandt wird.',

  dreiklang: {
    gegenstand: 'Forschendes Lernen mit dem Korpus; Zyklus Hypothese → Beleg-Prüfung → Befund-Deutung → begründete Stellungnahme; Korpusabhängigkeit von Befunden (z. B. parlamentarisch geprägtes Korpus → „Diskussion eröffnen" sehr stark).',
    thema: '„Eine Frage an die Sprache" – eine eigene Hypothese am Korpus prüfen und begründet beantworten.',
    splz: 'Die SuS deuten ihren am Korpus erhobenen Befund und nehmen begründet Stellung, indem sie den Befund mit der eigenen Hypothese abgleichen und die Abweichung erklären; LK: d. h. im Einzelnen zusätzlich die Aussagekraft kritisch einordnen (Korpusabhängigkeit, z. B. am Beispiel „Diskussion eröffnen").',
    wwlz: 'Die SuS reflektieren die Grenzen korpusbasierter Aussagen, indem sie beurteilen, wie das gewählte Korpus das Ergebnis beeinflusst (Korpusart, Frequenzhöhe, Homonyme).',
    kompetenzbezug: 'KLP Deutsch Sek II 2025, Inhaltsfeld Sprache: Verhältnis von Sprache, Denken und Wirklichkeit; semantische und pragmatische Aspekte; wissenschaftspropädeutisches forschendes Lernen; Medien- und Methodenreflexion.',
  },
  begruendungStunde: 'Der Einstieg nutzt eine Abstimmung („starker Regen" vs. „strömender Regen") als provokante Streitfrage, die das Bauchgefühl gegen den Befund stellt. Die Erarbeitung wiederholt den Forschungszyklus und die logDice-Werkzeuge aus ④ knapp; die Anwendungsphase bildet den Kern (eigene Frage, eigene Hypothese, eigener Befund). Die Ergebnissicherung lässt Befunde vorstellen und führt die Methodenkritik (LK: Korpusabhängigkeit) in die Klasse. Warum Modell 2: Keine neue Regel wird eingeführt – die SuS arbeiten mit dem aus ①–④ Erarbeiteten.',

  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Abstimmung: „Welches Adjektiv passt typischer zu ‚Regen\': stark oder strömend?" – Ergebnisse sammeln. Offene Streitfrage stehen lassen.', kommentar: 'Fast alle tippen auf „stark" (Bauchgefühl); der Befund wird der Korpus liefern. Forschungsbedürfnis erzeugen.', interaktion: 'Plenum', medien: 'Beamer-Folie 1 (Provokation)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Worked Example am Beamer: Forschungszyklus mit Regen-Beispiel durchspielen (Hypothese → Profil ansehen → Befund „strömend" → deuten → Stellung nehmen).', kommentar: 'Modelliert den Prozess, bevor die SuS selbst forschen (CTML: Worked Example). logDice-Werkzeug aus ④ reaktivieren.', interaktion: 'LSG', medien: 'Beamer-Folie 2 (Forschungszyklus)' },
        { schritt: 'Hypothesen für eigene/gewählte Fragen notieren (vor dem Blick ins Profil).', kommentar: 'Hypothese-vor-Befund ist methodisch essentiell: Profil beeinflusst das Urteil, wenn es vorher gesehen wird.', interaktion: 'EA', medien: 'AB / Kurs-Tab' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Eigene/gewählte Frage: Hypothese → Profil im Kurs-Tab befragen → Top-Verbindungen + Werte notieren → Befund deuten (AB Sek II F1–F4, LK F1–F5 + Methodenkritik).', kommentar: 'Kern der Stunde (Modell 2: Anwenden steht im Zentrum). Feedback-System unterstützt Prozess, gibt nicht die Lösung vor.', interaktion: 'Partner-/Einzelarbeit', medien: 'Kurs-Tab + Arbeitsblatt (differenziert)' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Befunde vorstellen: Stimmte die Hypothese? Was überrascht? LK: Korpusabhängigkeit am Beispiel „Diskussion eröffnen" (parlamentarisches Korpus → sehr hoher logDice).', kommentar: 'Verankert wwLz (Grenzen des Befunds); zeigt: Befund ≠ Wahrheit, sondern Korpus-Sicht.', interaktion: 'Plenum', medien: 'Beamer-Folie 3 (Auflösung + Bias)' },
        { schritt: 'Mini-Stellungnahme verschriftlichen: 3–4 Sätze, datengestützt. HA: LK-Methodenkritik ausformulieren.', kommentar: 'Sichert das SpLz schriftlich; LK-Mehrwert durch Methodenreflexion.', interaktion: 'EA', medien: 'AB' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: Forschungszyklus-Schema (Hypothese → Prüfen → Deuten → Stellung), Regen-Auflösung.',
    'Material: AB Sek II (Leitfaden F1–F4) + LK (F1–F5 + Methodenkritik); Worked Example mit Regen-Zyklus.',
    'Differenzierung: Sek II bis Befund-Deutung + Stellungnahme; LK bis Methodenkritik (Korpusabhängigkeit, Frequenzhöhe, Homonyme).',
    'LK-Bias-Beispiel: „Diskussion eröffnen" (logDice sehr hoch) als Effekt parlamentarisch geprägter Korpora.',
    'Reihenbezug: Kulmination ①–④; alle Werkzeuge (Kollokation, Wortart, Slot, logDice) fließen zusammen.',
  ],

  belege: ['luedeling-walter-2009', 'malloggi-2021', 'bubenhofer-2015', 'vonbrand-2010', 'klp-deutsch-sek2-2025', 'script-leitfaden-2020'],
}

/**
 * Beamer-Spec Station ⑤. dataFrom bindet live die Regen-Daten ein
 * (s5-f3-befund-deuten-sek2 – Regen/ATTR, logDice-Spalte) → keine harten Zahlen.
 */
export const beamer5 = {
  slides: [
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ⑤', title: 'Belegen statt raten', lead: '„starker Regen" oder „strömender Regen"? Stimmte dein Bauchgefühl – und was sagt das Korpus?' },
    { kind: 'bullets', kicker: 'Der Forschungszyklus', title: 'Vier Schritte zur Antwort', bullets: [
      '① Hypothese: Was vermutest du – vor dem Blick ins Profil?',
      '② Prüfen: Top-Verbindungen + Werte im Kurs-Tab nachschlagen.',
      '③ Deuten: Stimmt die Hypothese? Was überrascht dich?',
      '④ Stellung nehmen: Beleg schlägt Bauchgefühl – oder auch nicht?',
    ] },
    // Datenfolie live aus wortprofil.db (Regen-Profil, insertAfter 1).
    { kind: 'bullets', kicker: 'Methodenkritik (wwLz, LK)', title: 'Beleg ≠ Wahrheit', bullets: [
      'Ein Befund hängt immer vom Korpus ab: parlamentarische Texte → andere Muster als Romane.',
      'Beispiel: „Diskussion eröffnen" sehr stark – weil das Korpus viele Plenarprotokolle enthält.',
      'Niedrige Frequenz = weniger belastbar. Homonyme verzerren. Befund ist eine Korpus-Sicht, keine Naturwahrheit.',
    ] },
    { kind: 'merksatz', title: 'Belegen statt raten – aber Belege sind immer Korpus-Sichten, keine Wahrheiten.', quelle: 'Bubenhofer 2015' },
  ],
  dataFrom: {
    itemId: 's5-f3-befund-deuten-sek2',
    insertAfter: 1,
    title: 'Regen-Profil live – Hypothese vs. Befund',
    kicker: 'Datenblick · „Regen"',
  },
}

export const lesson5 = { entwurf: entwurf5, beamer: beamer5 }
export default lesson5
