/**
 * server/course/lesson/station-2.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ② „Wörter mit Funktion"
 * (Wortarten als Werkzeug). Folgt VERBINDLICH Kurs-Didaktik-Standards §1/§1a/§2/§3/§4.
 *
 * Quelle: planning/Kurs-Station-2-Wortarten.md §6 + planning/Kurs-Didaktik-Standards.
 * Phasenmodell: von Brand, Modell 1 (Sprach-/Grammatikstunde).
 * KLP: Sek I G9 2019 IF 1 Sprache (Wortarten); Sek II 2025 IF Sprache (morphologisch).
 */

export const entwurf2 = {
  stationNo: 2,
  niveau: 'SekI',
  uv: 'Sprache unter der Lupe – Wortverbindungen zwischen freier Wahl und festem Muster',
  sequenz: 'Station ② · Wörter mit Funktion (Wortarten als Werkzeug)',
  stundenthema: '„Baupläne der Sprache" – Wortarten als Werkzeug nutzen, um typische Wortverbindungen zu beschreiben und selbst zu bilden',
  phasenmodell: 'von Brand, Modell 1 (neu erlernen · sichern · anwenden)',

  uvZiele: [
    { text: 'einen zunehmend differenzierten Wortschatz funktional einsetzen', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'einfache sprachliche Mittel und stilistische Merkmale auf Wortebene in ihrer Wirkung beschreiben', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'Sprachvarietäten und ihre stilistischen Merkmale auf Wort- und Satzebene in ihrer Wirkung beurteilen (Bildungssprache)', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: false },
    { text: 'sprachsystematische Aspekte erläutern: morphologische und syntaktische Aspekte der Sprache', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Wortarten sind kein Lernziel im engeren Sinne, sondern das grammatische Beschreibungsinstrument für Kollokationen, die in ① eingeführt wurden. Die Fähigkeit, Baupläne (Adjektiv+Nomen, Verb+Nomen) zu benennen, schärft das Bewusstsein für strukturelle Muster und bereitet die Slot-Perspektive von Station ③ vor. Die Sek-II-Erweiterung (Wortart über Funktion) greift die im KLP 2025 geforderten morphologischen/syntaktischen Aspekte auf.',

  dreiklang: {
    gegenstand: 'Wortarten als funktionale Kategorien (Nomen, Verb, Adjektiv); Kollokationen folgen Wortart-Bauplänen (Adjektiv+Nomen: „scharfe Kritik"; Verb+Nomen: „Kritik üben"); Wortartbestimmung über Funktion im Satz, nicht über Bedeutung.',
    thema: '„Baupläne der Sprache" – Wortarten als Werkzeug nutzen, um typische Wortverbindungen zu beschreiben und selbst zu bilden.',
    splz: 'Die SuS beschreiben typische Wortverbindungen mithilfe von Wortarten, indem sie die Bausteine als Nomen, Verb oder Adjektiv bestimmen und das Wortart-Muster (z. B. Adjektiv+Nomen) benennen; Sek II: d. h. im Einzelnen die Wortart von „üben" in „Kritik üben" über seine syntaktische Funktion als Prädikat begründen.',
    wwlz: 'Die SuS beurteilen den Nutzen der Wortart-Kategorien, indem sie vergleichen, was die Bauplan-Beschreibung gegenüber bloßem Auswendiglernen leistet.',
    kompetenzbezug: 'KLP Deutsch Sek I (G9) 2019, Inhaltsfeld 1 Sprache – Wortebene: Wortarten unterscheiden; sprachliche Mittel auf Wortebene beschreiben. KLP Deutsch Sek II 2025, Inhaltsfeld Sprache – morphologische und syntaktische Aspekte.',
  },
  begruendungStunde: 'Der Einstieg knüpft an die aus ① bekannten Kollokationen an und erzeugt durch die Frage „Aus welchen Bausteinen?" den Bedarf für eine Beschreibungssprache (Wortarten). Die Erarbeitung nutzt ein Worked Example (Blaupause §5: CLT), bevor die SuS selbst kategorisieren. Die Plateaubildung sichert die Probe „Was tut das Wort im Satz?" für alle, bevor die differenzierte Anwendung (Niveau-AB) folgt. Das Form-vs-Funktion-Aha bei „Kritik üben" verankert das Sek-II-Ziel als kognitive Überraschung.',

  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Rückgriff ①: „schwerer Fehler" und „Entscheidung treffen" an der Tafel. Impuls: „Aus welchen Bausteinen bestehen diese Verbindungen?"', kommentar: 'Aktiviert Vorwissen aus ①; formuliert den Bedarf nach Beschreibungssprache (Wortarten).', interaktion: 'Plenum / LSG', medien: 'Beamer-Folie 1 (Anknüpfung)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Worked Example gemeinsam: „scharfe Kritik" → scharf = Adjektiv, Kritik = Nomen → Bauplan Adjektiv+Nomen.', kommentar: 'Modelliert das Vorgehen vor der ersten eigenen Übung (CTML: Worked Example, extraneous load senken).', interaktion: 'LSG', medien: 'Beamer-Folie 2 (Baupläne)' },
        { schritt: 'Baupläne A (Adj+N) und B (V+N) an echten Kollokationen entwickeln; Probe einführen: „Was tut das Wort im Satz?"', kommentar: 'Satzfunktion als Kriterium; Blaupause §4: Funktion vor Auswendigdefinition.', interaktion: 'Plenum → EA', medien: 'Beamer-Folie 2, Tafel' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Tafelbild sichern: Bauplan-Übersicht + Probe „Was tut das Wort im Satz?" → alle können weiterarbeiten.', kommentar: 'Plateau: strukturelles Ergebnis so sichern, dass ALLE die nachfolgende differenzierte Anwendung beginnen können.', interaktion: 'Plenum', medien: 'Tafel' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'AB differenziert: Sek I F1–F3 (Bausteine sortieren/markieren/Beispiel bilden); Sek II F3–F5 (Funktion bestimmen; „Kritik üben" begründen; Form-vs-Funktion).', kommentar: 'Differenzierung nach Niveau-AB; Sek-II-SpLz: Wortart über Funktion begründen.', interaktion: 'Partnerarbeit', medien: 'Arbeitsblatt (differenziert)' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Form-vs-Funktion-Aha: „Kritik üben" – „üben" ist Prädikat → Verb, auch wenn es nicht „trainieren" bedeutet. Merksatz: „Die Wortart folgt der Funktion, nicht der Bedeutung."', kommentar: 'Verankert das Sek-II-Lernziel; kontrastiver Transfer (Konversion: „das Üben" → Nomen) als Rückschau.', interaktion: 'Plenum', medien: 'Beamer-Folie 3 (Schluss)' },
        { schritt: 'Transfer/HA: eigenes Nomen wählen, Baupläne sammeln; am Kurs-Tab überprüfen.', kommentar: 'wwLz: Übertrag auf eigenes Vokabular.', interaktion: 'EA', medien: 'Kurs-Tab' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: Bauplan-Tabelle (Adj+N / V+N) + Probe „Was tut das Wort im Satz?" + Beispielpaare.',
    'Material: Arbeitsblatt + Erwartungshorizont (Sek I / Sek II differenziert), Beamer-Folien.',
    'Differenzierung: Sek I bis „Bausteine + Muster benennen"; Sek II bis „Wortart über Funktion begründen + Konversion".',
    'Reihenbezug: Station ① (Kollokationen) → ② (Wortart-Baupläne) → ③ (Slots/Dependenz).',
  ],

  belege: ['hoffmann-leimbrink-wortarten', 'didaktik-wortarten-d2', 'vonbrand-2010', 'klp-deutsch-sek1-g9-2019', 'klp-deutsch-sek2-2025', 'script-leitfaden-2020'],
}

export const beamer2 = {
  slides: [
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ②', title: 'Wörter mit Funktion', lead: '„scharfe Kritik" – aber warum nicht „starke Kritik"? Aus welchen Bausteinen besteht das?' },
    { kind: 'bullets', kicker: 'Anknüpfung an Station ①', title: 'Aus welchen Bausteinen?', bullets: [
      '„schwerer Fehler" · „Entscheidung treffen" – Kollokationen aus Station ①.',
      'Frage heute: Welche Wortarten stecken in diesen Mustern?',
      'Bauplan A: Adjektiv + Nomen · Bauplan B: Verb + Nomen.',
    ] },
    { kind: 'bullets', kicker: 'Form vs. Funktion', title: '„Kritik üben" – welche Wortart ist üben?', bullets: [
      '„üben" bedeutet hier nicht trainieren – und trotzdem ist es ein Verb.',
      'Wortart = Funktion im Satz: „üben" ist das Prädikat (konjugierbar: „übte").',
      'Merksatz: Die Wortart folgt der Funktion, nicht der Bedeutung.',
    ] },
    { kind: 'merksatz', title: 'Wortarten sind Werkzeuge – sie beschreiben Muster, erklären aber nicht die Bedeutung.', quelle: 'Hoffmann/Leimbrink' },
  ],
}

export const lesson2 = { entwurf: entwurf2, beamer: beamer2 }
export default lesson2
