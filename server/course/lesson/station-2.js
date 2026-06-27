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
  sequenz: 'Station ② · Wörter mit Funktion (Wortarten + Feldermodell)',
  stundenthema: '„Bausteine und Felder" – die Funktion eines Wortes im Satz mit Wortarten und dem topologischen Feldermodell (Verschiebeprobe) bestimmen',
  phasenmodell: 'von Brand, Modell 1 (neu erlernen · sichern · anwenden)',

  uvZiele: [
    { text: 'einen zunehmend differenzierten Wortschatz funktional einsetzen', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'sprachsystematische Aspekte auf Wort- und Satzebene erläutern (Wortarten; Satzglieder über operationale Proben)', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'einfache sprachliche Mittel und stilistische Merkmale auf Wortebene in ihrer Wirkung beschreiben', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: false },
    { text: 'sprachsystematische Aspekte erläutern: morphologische und syntaktische Aspekte der Sprache', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Wortarten sind kein Lernziel im engeren Sinne, sondern das grammatische Beschreibungsinstrument für die in ① eingeführten Kollokationen. Damit „Funktion im Satz" nicht behauptet, sondern nachweisbar wird, tritt das topologische Feldermodell (Gallmann 2015) hinzu: Das finite Verb verankert sich an Position 2 (linke Satzklammer), und nur ein vollständiges Satzglied lässt sich als Ganzes ins Vorfeld verschieben. Diese Verschiebeprobe macht die abstrakte Funktion entdeckend und falsifizierbar erfahrbar und bereitet die Slot-/Dependenz-Perspektive von Station ③ vor. Die Sek-II/LK-Erweiterung (Wortart über Funktion, Satzklammer, FVG) greift die im KLP 2025 geforderten morphologischen/syntaktischen Aspekte auf.',

  dreiklang: {
    gegenstand: 'Die Funktion eines Wortes bzw. einer Wortgruppe im Satz bestimmt seine Wortart und seine syntaktische Rolle. Zwei komplementäre Werkzeuge: Wortart-Baupläne (Adjektiv+Nomen „scharfe Kritik"; Verb+Nomen „Kritik üben") und das topologische Feldermodell (Gallmann 2015) – das finite Verb bildet die linke Satzklammer (Position 2); die Verschiebeprobe (Vorfeld-Test) weist Satzglieder als geschlossene Einheiten nach.',
    thema: '„Bausteine und Felder" – Wortarten und die Verschiebeprobe nutzen, um die Funktion von Wörtern und Wortgruppen in typischen Verbindungen zu bestimmen.',
    splz: 'Die SuS bestimmen die Funktion von Bausteinen typischer Wortverbindungen, indem sie sie als Wortart (Nomen/Verb/Adjektiv) benennen und mit der Verschiebeprobe prüfen, welche Wortgruppen Satzglieder sind – wobei das finite Verb als linke Satzklammer (Position 2) den Bezugspunkt bildet.',
    wwlz: 'Die SuS beurteilen den Nutzen operationaler Proben, indem sie erkennen, dass die Verschiebeprobe die Funktion nachweisbar macht, während eine auswendig gelernte Definition das nicht leistet.',
    kompetenzbezug: 'KLP Deutsch Sek I (G9) 2019, Inhaltsfeld 1 Sprache – Wort- und Satzebene: Wortarten unterscheiden, Satzglieder über Proben bestimmen. KLP Deutsch Sek II 2025, Inhaltsfeld Sprache – morphologische und syntaktische Aspekte.',
  },
  begruendungStunde: 'Der Einstieg knüpft an die aus ① bekannten Kollokationen an und erzeugt über zwei Fragen den Lernbedarf: „Aus welchen Bausteinen?" (Wortarten) und „Wie erkennt man, was zusammengehört?" (Satzglied/Funktion). Die Erarbeitung modelliert je ein Worked Example (Bauplan + Verschiebeprobe, Blaupause §5: CLT). Das Feldermodell wird nicht als Definition, sondern als entdeckendes, falsifizierbares Verfahren eingeführt (Verb an Position 2; nur ein vollständiges Satzglied geht ins Vorfeld – „Regel die" o. Ä. scheitert sichtbar). Die Plateaubildung sichert beide Proben für alle, bevor die differenzierte Anwendung folgt. Das Form-vs-Funktion-Aha bei „Kritik üben" verankert das Sek-II-Ziel als kognitive Überraschung.',

  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Rückgriff ①: „schwerer Fehler" und „Entscheidung treffen" an der Tafel. Doppelimpuls: „Aus welchen Bausteinen bestehen diese Verbindungen?" und „Wie prüft man, was im Satz zusammengehört?"', kommentar: 'Aktiviert Vorwissen aus ①; formuliert den Bedarf nach Beschreibungssprache (Wortarten) UND nach einer Probe für Satzglieder (Funktion).', interaktion: 'Plenum / LSG', medien: 'Beamer-Folie 1 (Anknüpfung)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Worked Example A: „scharfe Kritik" → scharf = Adjektiv, Kritik = Nomen → Bauplan Adjektiv+Nomen.', kommentar: 'Modelliert die Wortart-Bestimmung vor der ersten Übung (CTML: Worked Example).', interaktion: 'LSG', medien: 'Beamer-Folie 2 (Baupläne)' },
        { schritt: 'Feldermodell einführen: das finite Verb steht fest an Position 2 (linke Satzklammer); davor das Vorfeld. Worked Example B (Verschiebeprobe): „Der Lehrer erklärt heute die Regel." – nacheinander „heute" / „die Regel" ins Vorfeld schieben; das Verb bleibt an Position 2. „Regel die" scheitert → kein Satzglied.', kommentar: 'Operationalisiert „Funktion im Satz" als falsifizierbares Verfahren (Gallmann 2015, Abs. 3.2); macht Satzglied-Grenzen sichtbar statt sie zu behaupten.', interaktion: 'Plenum → LSG', medien: 'Beamer-Folie 3 (Feldermodell), Tafel' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Tafelbild sichern: Bauplan-Übersicht (Adj+N / V+N) + Feldermodell-Skizze (Vorfeld | linke Klammer | Mittelfeld | rechte Klammer) + zwei Proben („Was tut das Wort?" / „Lässt es sich als Ganzes ins Vorfeld schieben?").', kommentar: 'Plateau: beide Werkzeuge so sichern, dass ALLE die differenzierte Anwendung beginnen können.', interaktion: 'Plenum', medien: 'Tafel / Beamer' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'AB differenziert: Sek I (Bausteine sortieren/markieren + Verschiebeprobe Satzglied); Sek II (Wortart über Funktion; Konstituenten-Verschiebeprobe an der Präpositionalphrase); LK (vollständige Feldanalyse mit Satzklammer; FVG-Grenzfall; Konversion).', kommentar: 'Differenzierung nach Niveau-AB; Verschiebeprobe und Feldanalyse staffeln die grammatische Tiefe.', interaktion: 'Partnerarbeit', medien: 'Arbeitsblatt (differenziert) / Kurs-Tab' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Form-vs-Funktion-Aha: „Kritik üben" – „üben" ist Prädikat → Verb, auch wenn es nicht „trainieren" bedeutet. Merksatz: „Die Wortart folgt der Funktion, nicht der Bedeutung – und die Funktion lässt sich proben."', kommentar: 'Verankert das Sek-II-Lernziel und verklammert beide Werkzeuge (Wortart-Probe + Verschiebeprobe).', interaktion: 'Plenum', medien: 'Beamer-Schlussfolie' },
        { schritt: 'Transfer/HA: eigenen Beispielsatz wählen, Baupläne + Felder bestimmen; am Kurs-Tab überprüfen.', kommentar: 'wwLz: Übertrag auf eigenes Material; Verschiebeprobe selbstständig anwenden.', interaktion: 'EA', medien: 'Kurs-Tab' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: Bauplan-Tabelle (Adj+N / V+N) + Feldermodell-Skizze (Vorfeld | linke Satzklammer | Mittelfeld | rechte Satzklammer) + zwei Proben.',
    'Verschiebeprobe (Gallmann 2015): Nur was sich als geschlossene Einheit ins Vorfeld verschieben lässt, ist ein Satzglied; das finite Verb bleibt an Position 2.',
    'Material: Arbeitsblatt + Erwartungshorizont (Sek I / Sek II differenziert), Beamer-Folien.',
    'Differenzierung: Sek I bis „Bausteine + Satzglied per Verschiebeprobe"; Sek II bis „Wortart über Funktion + Konstituente"; LK bis „Feldanalyse mit Satzklammer + FVG/Konversion".',
    'Reihenbezug: Station ① (Kollokationen) → ② (Wortart-Baupläne + Feldermodell) → ③ (Slots/Dependenz).',
  ],

  belege: ['hoffmann-leimbrink-wortarten', 'gallmann-2015-topologie', 'didaktik-wortarten-d2', 'vonbrand-2010', 'klp-deutsch-sek1-g9-2019', 'klp-deutsch-sek2-2025', 'script-leitfaden-2020'],
}

export const beamer2 = {
  slides: [
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ②', title: 'Wörter mit Funktion', lead: '„scharfe Kritik" – aus welchen Bausteinen besteht das? Und wie prüft man, was im Satz zusammengehört?' },
    { kind: 'bullets', kicker: 'Anknüpfung an Station ①', title: 'Aus welchen Bausteinen?', bullets: [
      '„schwerer Fehler" · „Entscheidung treffen" – Kollokationen aus Station ①.',
      'Frage 1: Welche Wortarten stecken in diesen Mustern?',
      'Bauplan A: Adjektiv + Nomen · Bauplan B: Verb + Nomen.',
    ] },
    { kind: 'bullets', kicker: 'Wie erkennt man Satzglieder?', title: 'Das Feldermodell & die Verschiebeprobe', bullets: [
      'Das finite Verb steht fest an Position 2 – die linke Satzklammer.',
      'Direkt davor das Vorfeld: dort steht genau EIN Satzglied.',
      'Verschiebeprobe: Nur was sich als Ganzes ins Vorfeld schieben lässt, ist ein Satzglied.',
    ] },
    { kind: 'bullets', kicker: 'Form vs. Funktion', title: '„Kritik üben" – welche Wortart ist üben?', bullets: [
      '„üben" bedeutet hier nicht trainieren – und trotzdem ist es ein Verb.',
      'Wortart = Funktion im Satz: „üben" ist das Prädikat (konjugierbar: „übte").',
      'Merksatz: Die Wortart folgt der Funktion, nicht der Bedeutung.',
    ] },
    { kind: 'merksatz', title: 'Funktion lässt sich proben: Wortart-Probe und Verschiebeprobe machen Struktur sichtbar.', quelle: 'Gallmann 2015 · Hoffmann/Leimbrink' },
  ],
}

export const lesson2 = { entwurf: entwurf2, beamer: beamer2 }
export default lesson2
