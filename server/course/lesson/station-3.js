/**
 * server/course/lesson/station-3.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ③ „Wer hängt an wem?“
 * (grammatische Abhängigkeiten / Slots). Folgt Kurs-Didaktik-Standards §1/§1a/§2/§3/§4.
 *
 * Quelle: planning/Kurs-Station-3-Abhaengigkeiten.md §6 + planning/Kurs-Didaktik-Standards.
 * Phasenmodell: von Brand, Modell 1 (Sprachunterricht: Satzglieder/Dependenz).
 * KLP: Sek I G9 2019 IF 1 Sprache – Satzebene (Satzglieder); Sek II 2025 IF Sprache (syntaktisch).
 */

export const entwurf3 = {
  stationNo: 3,
  niveau: 'SekI',
  uv: 'Sprache unter der Lupe – Wortverbindungen zwischen freier Wahl und festem Muster',
  sequenz: 'Station ③ · Wer hängt an wem? (Grammatische Abhängigkeiten)',
  stundenthema: '„Feste Plätze im Satz“ – Grammatische Abhängigkeiten erkennen und typische Wortverbindungen in ihren Slots verorten',
  phasenmodell: 'von Brand, Modell 1 (neu erlernen · sichern · anwenden)',

  uvZiele: [
    { text: 'Satzglieder bestimmen und ihre Funktion im Satz beschreiben (Satzebene: Satzglieder, Satzbaupläne)', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'einfache sprachliche Mittel auf Satz- und Wortebene in ihrer Wirkung beschreiben', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'einen zunehmend differenzierten Wortschatz funktional einsetzen', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: false },
    { text: 'syntaktische Aspekte der Sprache erläutern; semantische und pragmatische Aspekte im Hinblick auf Bedeutung und Wirkung', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Station ③ integriert die Ergebnisse von ① (Kollokationen) und ② (Wortart-Baupläne) in die Satz-Ebene. Die Einsicht, dass dasselbe Nomen je nach syntaktischer Funktion (Subjekt vs. Objekt) andere typische Verbpartner hat, erschließt die eigentliche Tiefenstruktur von Kollokationen. Der KLP Sek I nennt Satzglieder explizit im Inhaltsfeld Sprache; die Dependenz-Perspektive (Kopf–Dependent) schließt an die wissenschaftspropädeutische Erweiterung für Sek II an.',

  dreiklang: {
    gegenstand: 'Syntaktische Funktionen und Dependenz',
    thema: '„Feste Plätze im Satz“ – grammatische Abhängigkeiten erkennen und typische Wortverbindungen in ihren Slots verorten.',
    splz: 'Die SuS verorten typische Wortverbindungen in der Satzstruktur, indem sie Subjekt, Prädikat und Objekt bestimmen und die Rolle des Kollokations-Nomens zeigen; Sek II: d. h. im Einzelnen die Kopf-Dependent-Relation darstellen und am Paar „eine Entscheidung treffen“ (Objekt-Slot) / „eine Entscheidung fällt“ (Subjekt-Slot) erklären, warum der Slot den Verbpartner bestimmt.',
    wwlz: 'Die SuS beurteilen den Nutzen von Strukturwissen, indem sie einschätzen, was die Slot-Perspektive für das Verstehen von Kollokationen über die bloße Wortliste hinaus leistet.',
    kompetenzbezug: 'KLP Deutsch Sek I (G9) 2019, Inhaltsfeld 1 Sprache – Satzebene: Satzglieder, Satzbaupläne. KLP Deutsch Sek II 2025, Inhaltsfeld Sprache – syntaktische Aspekte; semantische und pragmatische Aspekte.',
  },
  begruendungStunde: 'Die Stunde trennt die beiden Medien in zwei konzentrierte Blöcke, statt sie zu verzahnen – so entfällt der lernhemmende Medienwechsel mitten in der Bearbeitung (Kurs-Didaktik-Standards §5). Der Einstieg nutzt den Kontrast „Er trifft eine Entscheidung“ / „Die Entscheidung fällt“ als kognitiven Konflikt (gleicher Wortschatz, andere Verben → Bedarf für die Slot-Analyse). Das begleitende Arbeitsblatt trägt danach die Erarbeitung: Satzglieder + operationale Proben (Sek I) und Valenz/Dependenz Kopf–Dependent (Sek II) werden – nach kurzem Plenums-Auftakt – strukturiert erarbeitet und erstmals angewandt. Die digitale Station übernimmt die vertiefte Anwendung (S/P/O bestimmen, Kopf-Dependent markieren, Slot bestimmen) als eigener Block. S/P/O-Labels statt Farbcodierung entsprechen §5 (Bedeutung nie nur über Farbe).',

  verlauf: [
    {
      phase: 'I Stundeneröffnung – Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Zwei Sätze an der Tafel: „Er trifft eine Entscheidung.“ / „Die Entscheidung fällt morgen.“ Impuls: „Beide Male ‚Entscheidung\' – aber andere Verben. Warum?“', kommentar: 'Kognitiver Konflikt; macht Slot-Abhängigkeit als Problem sichtbar (Sachaspekt: Verb ≠ frei wählbar bei gegebenem Nomen).', interaktion: 'Plenum / LSG', medien: 'Beamer-Folie 1 (Slot-Kontrast)' },
      ],
    },
    {
      phase: 'II Stundenmitte – Erarbeitung (Arbeitsblatt, am Stück)', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Kurzer Plenums-Auftakt: „Das Gericht trifft eine Entscheidung.“ → S/P/O mit Buchstaben beschriften, Frageprobe einführen (Wer? / Was tut? / Wen-Was?).', kommentar: 'Modelliert das Werkzeug; Buchstaben-Label statt Farbe (§5 Barrierearmut).', interaktion: 'Plenum → LSG', medien: 'Beamer / Tafel' },
        { schritt: 'Begleit-Arbeitsblatt durchgehend bearbeiten: Wissensblöcke (Satzglieder + operationale Proben; Valenz/Dependenz Kopf–Dependent; „der Slot bestimmt den Partner“), Merksatz, dann die eigenen Aufgaben – differenziert nach Niveau.', kommentar: 'Neu erlernen + erste Anwendung auf Papier, am Stück; das Satzglied-/Dependenz-Wissen bleibt als Referenz. Belege (Gallmann, Lehmkuhle, Schütze, Ágel).', interaktion: 'EA → Partnerarbeit', medien: 'Arbeitsblatt (Wissen + Aufgaben)' },
      ],
    },
    {
      phase: 'II Stundenmitte – Plateaubildung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Plenums-Sicherung: Frageprobe (Wer?→S; Was tut?→P; Wen/Was?→O) + Slot-Übersicht (Objekt- vs. Subjekt-Slot); zentrale AB-Ergebnisse vergleichen.', kommentar: 'Plateau: alle für die Anwendungsphase arbeitsfähig; Übergang vom Papier zum Gerät.', interaktion: 'Plenum', medien: 'Tafel' },
      ],
    },
    {
      phase: 'II Stundenmitte – Anwendung (digitale Station, am Stück)', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Digitale Station ③ im Kurs-Tab durchgehend: Satzglieder S/P/O bestimmen, Kopf-Dependent markieren, den Slot bestimmen – mit Sofort-Feedback.', kommentar: 'Vertiefte Anwendung der gesicherten Werkzeuge als eigener Block; die App prüft die Bestimmung unmittelbar. Nach dem AB, kein Medienwechsel mitten in der Bearbeitung.', interaktion: 'Einzel-/Partnerarbeit', medien: 'Kurs-Tab (digitale Station)' },
      ],
    },
    {
      phase: 'III Stundenabschluss – Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Auflösung: Slot-Wechsel-Analyse – warum *treffen* ≠ *fallen* (Objekt- vs. Subjekt-Slot); Merksatz: „Kollokationen sind nicht nur Wortpaare, sie sitzen in grammatischen Slots.“', kommentar: 'Verankert wwLz (Nutzen von Strukturwissen); bereitet Brücke zu ④ (Korpus misst Slot-Besetzungen) vor.', interaktion: 'Plenum', medien: 'Beamer-Folie 3 (Schluss)' },
        { schritt: 'Transfer/HA: eigenes Nomen wählen, beide Slots suchen; am Kurs-Tab überprüfen.', kommentar: 'Produktive Anwendung des Slot-Konzepts auf eigenem Vokabular.', interaktion: 'EA', medien: 'Kurs-Tab' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: Frageprobe-Tabelle (Wer?→S / Was tut?→P / Wen/Was?→O) + Slot-Kontrast „Entscheidung“ (Objekt: treffen/fällen; Subjekt: fällt/ergeht).',
    'Material: begleitendes Arbeitsblatt (Wissen + eigene Aufgaben) + Erwartungshorizont (aus demselben Content-Modell) + Beamer-Folien; digitale Station ③ im Kurs-Tab. Buchstaben-Label S/P/O (nicht nur Farbe).',
    'Zusammenspiel der Medien (zwei getrennte Blöcke, kein Wechsel mitten in der Bearbeitung): Arbeitsblatt = Erarbeitung (Satzglieder/Proben + Dependenz sichern + erste Anwendung); digitale Station = vertiefte Anwendung (S/P/O, Kopf-Dependent, Slot interaktiv).',
    'Differenzierung: Sek I bis Satzglied-Bestimmung + Nomen-Rolle; Sek II bis Kopf-Dependent + Slot-Wechsel.',
    'Reihenbezug: Station ② (Wortart-Baupläne) → ③ (Slots) → ④ (Korpus misst Slot-Besetzungen).',
  ],

  belege: ['schuetze-2018', 'vonbrand-2010', 'klp-deutsch-sek1-g9-2019', 'klp-deutsch-sek2-2025', 'script-leitfaden-2020'],
}

// Beamer stützt Einstieg + Plenums-Auftakt (Werkzeug modellieren) + Sicherung.
// Fachbegriffe/Merksatz wie im AB; Slot-Kontrast an einem frischen Nomen
// („Antrag“) statt „Entscheidung treffen/fällt“ (= AB-Sek-II-Aufgabe 3).
export const beamer3 = {
  slides: [
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ③', title: 'Wer hängt an wem?', lead: '„einen Antrag stellen“ – aber „der Antrag scheitert“. Gleicher Wortschatz, andere Verben. Warum?' },
    { kind: 'bullets', kicker: 'Das Werkzeug', title: 'Derselbe Wortschatz – zwei Rollen', bullets: [
      '„Sie stellt [einen Antrag]O.“ → Antrag im Objekt-Slot → stellen / einbringen.',
      '„[Der Antrag]S scheitert.“ → Antrag im Subjekt-Slot → scheitern / eingehen.',
      'S/P/O mit Buchstaben-Label (nicht nur Farbe – wer die Farbe nicht sieht, sieht das Label).',
    ] },
    { kind: 'bullets', kicker: 'Das Werkzeug', title: 'Kopf und Dependent', bullets: [
      'stellen → Antrag: das Verb regiert sein Objekt (Kopf → Dependent).',
      'Slot = die grammatische Rolle, die das Nomen im Satz einnimmt.',
      'Slot-Wechsel (Objekt ↔ Subjekt) → anderer typischer Verbpartner.',
    ] },
    { kind: 'merksatz', title: 'Kollokationen sind nicht nur Wortpaare – sie sitzen in grammatischen Slots.' },
  ],
}

export const lesson3 = { entwurf: entwurf3, beamer: beamer3 }
export default lesson3
