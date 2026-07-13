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
  begruendungStunde: 'Die Stunde trennt die beiden Medien in zwei konzentrierte Blöcke, statt sie zu verzahnen – so entfällt der lernhemmende Medienwechsel mitten in der Bearbeitung (Kurs-Didaktik-Standards §5). Das begleitende Arbeitsblatt trägt die Erarbeitung: Wortart- und Feldermodell-Wissen werden – nach kurzer Plenums-Einführung der beiden Proben – strukturiert erarbeitet und erstmals angewandt. Die Verschiebeprobe wird dabei als falsifizierbares Verfahren eingeführt (finites Verb an Position 2; „Regel die" scheitert sichtbar), nicht als Definition (Gallmann 2015). Die digitale Station übernimmt danach die vertiefte Anwendung (Wortart/Bauplan bestimmen, Verschiebeprobe interaktiv) als eigener, ununterbrochener Block. Das Form-vs-Funktion-Aha bei „Kritik üben" verankert das Sek-II-Ziel als kognitive Überraschung.',

  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Rückgriff ①: „schwerer Fehler" und „Entscheidung treffen" an der Tafel. Doppelimpuls: „Aus welchen Bausteinen bestehen diese Verbindungen?" und „Wie prüft man, was im Satz zusammengehört?"', kommentar: 'Aktiviert Vorwissen aus ①; formuliert den Bedarf nach Beschreibungssprache (Wortarten) UND nach einer Probe für Satzglieder (Funktion).', interaktion: 'Plenum / LSG', medien: 'Beamer-Folie 1 (Anknüpfung)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung (Arbeitsblatt, am Stück)', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Kurzer Plenums-Auftakt beider Proben: Bauplan „scharfe Kritik" (Adj+Nomen) und Verschiebeprobe „Der Lehrer erklärt heute die Regel." (Verb an Position 2; „Regel die" scheitert → kein Satzglied).', kommentar: 'Modelliert die beiden Werkzeuge, bevor die SuS selbst arbeiten; operationalisiert „Funktion" als falsifizierbares Verfahren (Gallmann 2015).', interaktion: 'Plenum → LSG', medien: 'Beamer-Folien 2–3' },
        { schritt: 'Begleit-Arbeitsblatt durchgehend bearbeiten: Wissensblöcke (Wortarten-Systematik + Baupläne; topologisches Feldermodell mit Verschiebeprobe), Merksatz, dann die eigenen Aufgaben – differenziert nach Niveau.', kommentar: 'Neu erlernen + erste Anwendung auf Papier, am Stück; das Fachwissen bleibt als Referenz/Notiz. Belege als Fußnoten; Differenzierung über das Niveau-AB.', interaktion: 'EA → Partnerarbeit', medien: 'Arbeitsblatt (Wissen + Aufgaben)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Plenums-Sicherung: Bauplan-Übersicht (Adj+N / V+N) + Feldermodell-Skizze + beide Proben; zentrale AB-Ergebnisse vergleichen.', kommentar: 'Sichert ein gemeinsames Zwischenergebnis (Plateau), damit ALLE für die Anwendungsphase arbeitsfähig sind – Übergang vom Papier zum Gerät.', interaktion: 'Plenum', medien: 'Tafel / Beamer' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung (digitale Station, am Stück)', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Digitale Station ② im Kurs-Tab durchgehend: Wortarten und Baupläne bestimmen, die Verschiebeprobe interaktiv anwenden – mit Sofort-Feedback.', kommentar: 'Vertiefte Anwendung der gesicherten Werkzeuge als eigener Block; die App prüft die Proben unmittelbar. Bewusst nach dem AB, kein Medienwechsel mitten in der Bearbeitung.', interaktion: 'Einzel-/Partnerarbeit', medien: 'Kurs-Tab (digitale Station)' },
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
    'Material: begleitendes Arbeitsblatt (Wissen + eigene Aufgaben) + Erwartungshorizont (aus demselben Content-Modell) + Beamer-Folien; digitale Station ② im Kurs-Tab.',
    'Zusammenspiel der Medien (zwei getrennte Blöcke, kein Wechsel mitten in der Bearbeitung): Arbeitsblatt = Erarbeitung (Wortart-/Feldermodell-Wissen sichern + erste Anwendung); digitale Station = vertiefte Anwendung (Wortart/Bauplan bestimmen, Verschiebeprobe interaktiv).',
    'Differenzierung: Sek I bis „Bausteine + Satzglied per Verschiebeprobe"; Sek II bis „Wortart über Funktion + Konstituente"; LK bis „Feldanalyse mit Satzklammer + FVG/Konversion".',
    'LK-Scaffolding: Funktionsverbgefüge (FVG) vorab kurz einführen – festes Verb-Nomen-Gefüge, in dem das Verb semantisch verblasst und das Nomen den Inhalt trägt (z. B. „in Frage stellen", „zur Sprache bringen", „Kritik üben"). Die Aufgabe trägt die Definition zur Sicherheit selbst.',
    'Reihenbezug: Station ① (Kollokationen) → ② (Wortart-Baupläne + Feldermodell) → ③ (Slots/Dependenz).',
  ],

  belege: ['hoffmann-leimbrink-wortarten', 'gallmann-2015-topologie', 'klett-feldermodell-schulbuch', 'didaktik-wortarten-d2', 'vonbrand-2010', 'klp-deutsch-sek1-g9-2019', 'klp-deutsch-sek2-2025', 'script-leitfaden-2020'],
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
