/**
 * server/course/lesson/station-3.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ③ „Wer hängt an wem?"
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
  stundenthema: '„Feste Plätze im Satz" – Grammatische Abhängigkeiten erkennen und typische Wortverbindungen in ihren Slots verorten',
  phasenmodell: 'von Brand, Modell 1 (neu erlernen · sichern · anwenden)',

  uvZiele: [
    { text: 'Satzglieder bestimmen und ihre Funktion im Satz beschreiben (Satzebene: Satzglieder, Satzbaupläne)', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'einfache sprachliche Mittel auf Satz- und Wortebene in ihrer Wirkung beschreiben', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'einen zunehmend differenzierten Wortschatz funktional einsetzen', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: false },
    { text: 'syntaktische Aspekte der Sprache erläutern; semantische und pragmatische Aspekte im Hinblick auf Bedeutung und Wirkung', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Station ③ integriert die Ergebnisse von ① (Kollokationen) und ② (Wortart-Baupläne) in die Satz-Ebene. Die Einsicht, dass dasselbe Nomen je nach syntaktischer Funktion (Subjekt vs. Objekt) andere typische Verbpartner hat, erschließt die eigentliche Tiefenstruktur von Kollokationen. Der KLP Sek I nennt Satzglieder explizit im Inhaltsfeld Sprache; die Dependenz-Perspektive (Kopf–Dependent) schließt an die wissenschaftspropädeutische Erweiterung für Sek II an.',

  dreiklang: {
    gegenstand: 'Grammatische Abhängigkeiten (Dependenz Kopf–Dependent; syntaktische Funktionen Subjekt/Prädikat/Objekt); Kollokationen besetzen feste grammatische Slots; der Slot (Subjekt vs. Objekt) bestimmt den typischen Verbpartner.',
    thema: '„Feste Plätze im Satz" – grammatische Abhängigkeiten erkennen und typische Wortverbindungen in ihren Slots verorten.',
    splz: 'Die SuS verorten typische Wortverbindungen in der Satzstruktur, indem sie Subjekt, Prädikat und Objekt bestimmen und die Rolle des Kollokations-Nomens zeigen; Sek II: d. h. im Einzelnen die Kopf-Dependent-Relation darstellen und am Paar „eine Entscheidung treffen" (Objekt-Slot) / „eine Entscheidung fällt" (Subjekt-Slot) erklären, warum der Slot den Verbpartner bestimmt.',
    wwlz: 'Die SuS beurteilen den Nutzen von Strukturwissen, indem sie einschätzen, was die Slot-Perspektive für das Verstehen von Kollokationen über die bloße Wortliste hinaus leistet.',
    kompetenzbezug: 'KLP Deutsch Sek I (G9) 2019, Inhaltsfeld 1 Sprache – Satzebene: Satzglieder, Satzbaupläne. KLP Deutsch Sek II 2025, Inhaltsfeld Sprache – syntaktische Aspekte; semantische und pragmatische Aspekte.',
  },
  begruendungStunde: 'Der Einstieg nutzt den Kontrast „Er trifft eine Entscheidung" / „Die Entscheidung fällt" als kognitiven Konflikt: gleicher Wortschatz, andere Verben – warum? Das erzeugt den Bedarf für die Slot-Analyse. Die Erarbeitung führt Satzglieder (Sek I) und Kopf-Dependent (Sek II) am selben Beispiel ein; die Plateaubildung sichert die Frageprobe als Werkzeug für alle Niveaus. S/P/O-Labels statt Farbcodierung entsprechen §5 (Bedeutung nie nur über Farbe).',

  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Zwei Sätze an der Tafel: „Er trifft eine Entscheidung." / „Die Entscheidung fällt morgen." Impuls: „Beide Male ‚Entscheidung\' – aber andere Verben. Warum?"', kommentar: 'Kognitiver Konflikt; macht Slot-Abhängigkeit als Problem sichtbar (Sachaspekt: Verb ≠ frei wählbar bei gegebenem Nomen).', interaktion: 'Plenum / LSG', medien: 'Beamer-Folie 1 (Slot-Kontrast)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Worked Example: „Das Gericht trifft eine Entscheidung." → Subjekt S / Prädikat P / Objekt O mit Buchstaben beschriften; Frageprobe einführen (Wer? / Was tut? / Wen/Was?).', kommentar: 'Buchstaben-Label statt Farbe (§5 Barrierearmut); Probe als Werkzeug für alle Niveaus.', interaktion: 'LSG', medien: 'Arbeitsblatt / Beamer' },
        { schritt: 'Slot-Kontrast erarbeiten: Entscheidung als Objekt → treffen/fällen; als Subjekt → fällt/ergeht. Sek II: Kopf-Dependent-Kante zeichnen (Verb regiert Objekt).', kommentar: 'Kernbefund: gleiche Wortform, anderer Slot → anderer Verbpartner; Dependenz als formale Abbildung (Schütze 2018).', interaktion: 'Plenum → EA', medien: 'Beamer-Folie 2, Tafel' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Tafelbild: Frageprobe (Wer? → S; Was tut? → P; Wen/Was? → O) + Slot-Übersicht sichern.', kommentar: 'Plateau: alle können mit dem Werkzeug weiterarbeiten, bevor die differenzierte Anwendung beginnt.', interaktion: 'Plenum', medien: 'Tafel' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'AB differenziert: Sek I F1–F2 (Satzglieder mit S/P/O beschriften, Rolle von Nomen bestimmen); Sek II F3–F5 (Kante zeichnen, Slot-Wechsel-Analyse, Brücke zu ④ Korpus).', kommentar: 'Differenzierung: Sek I bis Satzglied-Bestimmung; Sek II bis Dependenz-Darstellung + Slot-Erklärung.', interaktion: 'Partnerarbeit', medien: 'Arbeitsblatt (differenziert)' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Auflösung: Slot-Wechsel-Analyse – warum *treffen* ≠ *fallen* (Objekt- vs. Subjekt-Slot); Merksatz: „Kollokationen sind nicht nur Wortpaare, sie sitzen in grammatischen Slots."', kommentar: 'Verankert wwLz (Nutzen von Strukturwissen); bereitet Brücke zu ④ (Korpus misst Slot-Besetzungen) vor.', interaktion: 'Plenum', medien: 'Beamer-Folie 3 (Schluss)' },
        { schritt: 'Transfer/HA: eigenes Nomen wählen, beide Slots suchen; am Kurs-Tab überprüfen.', kommentar: 'Produktive Anwendung des Slot-Konzepts auf eigenem Vokabular.', interaktion: 'EA', medien: 'Kurs-Tab' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: Frageprobe-Tabelle (Wer?→S / Was tut?→P / Wen/Was?→O) + Slot-Kontrast „Entscheidung" (Objekt: treffen/fällen; Subjekt: fällt/ergeht).',
    'Material: Arbeitsblatt + Erwartungshorizont (Sek I / Sek II); Buchstaben-Label S/P/O (nicht nur Farbe).',
    'Differenzierung: Sek I bis Satzglied-Bestimmung + Nomen-Rolle; Sek II bis Kopf-Dependent + Slot-Wechsel.',
    'Reihenbezug: Station ② (Wortart-Baupläne) → ③ (Slots) → ④ (Korpus misst Slot-Besetzungen).',
  ],

  belege: ['schuetze-2018', 'vonbrand-2010', 'klp-deutsch-sek1-g9-2019', 'klp-deutsch-sek2-2025', 'script-leitfaden-2020'],
}

export const beamer3 = {
  slides: [
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ③', title: 'Wer hängt an wem?', lead: '„Er trifft eine Entscheidung." / „Die Entscheidung fällt." – gleicher Wortschatz, andere Verben. Warum?' },
    { kind: 'bullets', kicker: 'Slot-Kontrast', title: 'Derselbe Wortschatz – zwei Rollen', bullets: [
      '„Er trifft [eine Entscheidung]O." → Entscheidung = Objekt → treffen / fällen.',
      '„[Die Entscheidung]S fällt morgen." → Entscheidung = Subjekt → fällt / ergeht.',
      'S/P/O mit Buchstaben-Label (nicht nur Farbe – wer die Farbe nicht sieht, sieht das Label).',
    ] },
    { kind: 'bullets', kicker: 'Dependenz (Sek II)', title: 'Kopf und Dependent', bullets: [
      'treffen → Entscheidung (Verb regiert sein Objekt: Kopf → Dependent).',
      'Slot = grammatische Rolle, die das Nomen im Satz einnimmt.',
      'Slot-Wechsel (Objekt ↔ Subjekt) → anderer typischer Verbpartner.',
    ] },
    { kind: 'merksatz', title: 'Kollokationen sind nicht nur Wortpaare – sie sitzen in grammatischen Slots.', quelle: 'Schütze 2018' },
  ],
}

export const lesson3 = { entwurf: entwurf3, beamer: beamer3 }
export default lesson3
