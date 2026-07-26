/**
 * server/course/lesson/station-4.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ④ „Texte, die zählen“
 * (Korpus verstehen, logDice). Folgt Kurs-Didaktik-Standards §1/§1a/§2/§3/§4.
 *
 * Quelle: planning/Kurs-Station-4-Korpus.md §6 + planning/Kurs-Didaktik-Standards.
 * Phasenmodell: von Brand, Modell 1 (Konzept-Einführung: Korpus/Frequenz/logDice).
 * KLP: Sek II/LK 2025 IF Sprache – Verhältnis Sprache/Denken/Wirklichkeit; wiss.propäd.
 *
 * Niveaus: Kernstunde für Sek II/LK; DaZ/SekI bekommen Schnupper-Variante
 * (Häufigkeit ohne logDice-Begrifflichkeit). Beamer-Datenfolie live aus wortprofil.db.
 */

export const entwurf4 = {
  stationNo: 4,
  niveau: 'SekII',
  uv: 'Sprache unter der Lupe – Wortverbindungen zwischen freier Wahl und festem Muster',
  sequenz: 'Station ④ · Texte, die zählen (Korpus verstehen)',
  stundenthema: '„Was Häufigkeit verschweigt“ – Wie ein Korpus mit logDice misst, welche Wortverbindungen wirklich typisch sind',
  phasenmodell: 'von Brand, Modell 1 (neu erlernen · sichern · anwenden)',

  uvZiele: [
    { text: 'das Verhältnis von Sprache, Denken und Wirklichkeit reflektieren; wissenschaftspropädeutische Methoden einbeziehen', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'sprachlich-stilistische Mittel und semantische Variationsbreite im Hinblick auf Bedeutung und Wirkung erläutern', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'semantische und pragmatische Aspekte der Sprache erläutern', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
    { text: 'innere und äußere Mehrsprachigkeit reflektieren (Variationsbreite innerhalb des Deutschen)', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Station ④ liefert die empirische Basis, auf der ①–③ ruhen: Woher weiß die App, was typisch ist? Die Unterscheidung Rohfrequenz vs. Assoziationsstärke (logDice) ist nicht nur Fachdetail, sondern der epistemische Kern der Korpuslinguistik. Im KLP Sek II ist das Verhältnis Sprache–Denken–Wirklichkeit explizit ausgewiesen; quantitative Sprachanalyse eröffnet eine wissenschaftspropädeutische Dimension. Die Schnupper-Variante für DaZ/SekI macht denselben Kerngedanken (häufig ≠ typisch) ohne Fachterminus zugänglich.',

  dreiklang: {
    gegenstand: 'Korpusbasierte Kookkurrenz',
    thema: '„Was Häufigkeit verschweigt“ – wie ein Korpus Schritt für Schritt misst, welche Wortverbindungen wirklich typisch sind, und wo die Methode irrt.',
    splz: 'Die SuS erklären, wie ein Korpus Typikalität misst, indem sie die Schritte der Pipeline (Grundform, Wortart, Abhängigkeit, Zählen) nachvollziehen und Rohfrequenz von logDice unterscheiden; sie begründen, warum die häufigste Verbindung nicht die typischste ist. LK: d. h. im Einzelnen die logDice-Formel vollständig deuten (Verhältnis, log₂, Obergrenze 14) und die Grenzen der automatischen Annotation benennen.',
    wwlz: 'Die SuS reflektieren kritisch Chancen und Grenzen quantitativer Sprachanalyse, indem sie beurteilen, was eine Assoziationszahl über Sprache aussagt – und was nicht (Bedeutung, Kontext, Stilwert) – und wie Korpuswahl und Annotationsfehler den Befund prägen.',
    kompetenzbezug: 'KLP Deutsch Sek II 2025, Inhaltsfeld Sprache: Verhältnis von Sprache, Denken und Wirklichkeit; wissenschaftspropädeutische Reflexion; semantische und pragmatische Aspekte.',
  },
  begruendungStunde: 'Die Stunde trennt die beiden Medien in zwei konzentrierte Blöcke, statt sie zu verzahnen – so entfällt der lernhemmende Medienwechsel mitten in der Bearbeitung (Kurs-Didaktik-Standards §5). Der Einstieg nutzt eine Schätzfrage (Haar-Adjektive: häufigste vs. typischste), die fast alle SuS falsch beantworten – der Überraschungseffekt motiviert das Bedürfnis nach einem Mess-Instrument. Das begleitende Arbeitsblatt trägt die Erarbeitung: die App-Pipeline (Grundform → Wortart → Abhängigkeit(③) → Zählen → logDice) und das Maß werden – nach kurzem Plenums-Auftakt – strukturiert erarbeitet und erstmals angewandt (LK mit voller Formel). Die digitale Station übernimmt die vertiefte Anwendung am echten Korpus (Konkordanz, Annotationsfehler, häufig-vs-typisch) als eigener Block; die Live-Datenfolie kommt aus der Datenbank (keine harten Zahlen im Code). Das wwLz wird durch die Reflexionsphase gesichert: Was sagt die Zahl nicht – und wo irrt die Maschine (Annotation, Korpus-Bias)?',

  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Schätzfrage: „Welches Adjektiv kommt am häufigsten mit ‚Haar\' vor? Welches ist am typischsten?“ → Abstimmung (Handzeichen), Ergebnisse sichern.', kommentar: 'Fast alle nennen das Häufigste als das Typischste → Hypothese, die der Befund widerlegt. Erzeugt kognitiven Bedarf für ein Mess-Instrument.', interaktion: 'Plenum', medien: 'Beamer-Folie 1 (Schätzfrage)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung (Arbeitsblatt, am Stück)', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Kurzer Plenums-Auftakt: App-Pipeline sichtbar machen (Rohtext → Grundform → Wortart → Abhängigkeit (③) → Kookkurrenz zählen → logDice) und das Maß einführen („nicht wie oft – sondern wie exklusiv“).', kommentar: 'Konzeptueller Rahmen; erklärt rückblickend ①–③. Die Dependenz-Stufe zeigt: die Maschine macht automatisch, was in ③ von Hand geübt wurde. Lüdeling/Walter 2009; Bubenhofer 2015.', interaktion: 'Plenum', medien: 'Beamer-Folien 2–3 (Pipeline, logDice)' },
        { schritt: 'Begleit-Arbeitsblatt durchgehend bearbeiten: Wissensblöcke (Korpus/Pipeline; Frequenz vs. Assoziationsmaß; Korpus-Bias; LK: logDice-Formel), Merksatz, dann die eigenen Aufgaben – differenziert nach Niveau.', kommentar: 'Neu erlernen + erste Anwendung auf Papier, am Stück; Formel/Grenzen bleiben als Referenz. DaZ/SekI ohne logDice-Term, LK mit voller Formel.', interaktion: 'EA → Partnerarbeit', medien: 'Arbeitsblatt (Wissen + Aufgaben)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Plenums-Sicherung: „häufig ≠ typisch“ + Skala-Grobraster (~10 typisch · ~7 erkennbar · niedrig zufällig); Auflösung der Schätzfrage (Live-Datenfolie).', kommentar: 'Plateau: alle für die Anwendungsphase arbeitsfähig; Übergang zum Gerät. Datenfaustregel ist didaktische Setzung, kein fester Grenzwert.', interaktion: 'Plenum', medien: 'Tafel / Beamer (Live-Daten)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung (digitale Station, am Stück)', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Digitale Station ④ im Kurs-Tab durchgehend: Konkordanz lesen, Annotationsfehler finden, Pipeline-Schritte ordnen, Frequenz vs. logDice vergleichen – mit Sofort-Feedback an echten Korpuswerten.', kommentar: 'Vertiefte Anwendung am realen Korpus als eigener Block; die App zeigt echte Werte. Nach dem AB, kein Medienwechsel mitten in der Bearbeitung.', interaktion: 'Einzel-/Partnerarbeit', medien: 'Kurs-Tab (digitale Station)' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung + Reflexion', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Auflösung Hypothese; wwLz: „Was sagt ein hoher logDice-Wert nicht?“ (Bedeutung, Angemessenheit, Ironie, Kontext). Merksatz: „Häufigkeit lügt – logDice misst Bindung.“', kommentar: 'Verankert das wwLz (Methodenkritik); bereitet ⑤ (eigene Recherche) vor.', interaktion: 'Plenum', medien: 'Beamer-Folie 4 (Reflexion)' },
        { schritt: 'Transfer/HA: eigenes Wort wählen, Frequenz und logDice der Top-Verbindungen vergleichen; Fazit in einem Satz.', kommentar: 'Sichert eigenständigen Umgang mit dem Messkonzept.', interaktion: 'EA', medien: 'Kurs-Tab' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: „häufig ≠ typisch“ + Skala-Grobraster (~10 typisch · ~7 erkennbar) + Haar-Beispiel.',
    'Material: begleitendes Arbeitsblatt (Wissen + eigene Aufgaben) + Erwartungshorizont (aus demselben Content-Modell) + Beamer-Folien (Live-Datenfolie); digitale Station ④ im Kurs-Tab.',
    'Zusammenspiel der Medien (zwei getrennte Blöcke, kein Wechsel mitten in der Bearbeitung): Arbeitsblatt = Erarbeitung (Pipeline/logDice sichern + erste Anwendung); digitale Station = vertiefte Anwendung (Konkordanz, Annotationsfehler, häufig-vs-typisch an echten Daten).',
    'Differenzierung: Sek II bis Urteil/Begründung; LK bis Formellogik + Methodenkritik (2 Dinge, die hoher logDice nicht garantiert).',
    'Beamer-Datenfolie wird zur Laufzeit aus wortprofil.db gefüllt (keine harten Zahlen im Code – Datenpolitik AP5).',
    'Reihenbezug: erklärt rückblickend ①–③ (Woher die Zahlen?); bereitet ⑤ (eigene Recherche) vor.',
  ],

  belege: ['bubenhofer-2015', 'luedeling-walter-2009', 'steyer-2000', 'vonbrand-2010', 'klp-deutsch-sek2-2025', 'script-leitfaden-2020'],
}

/**
 * Beamer-Spec Station ④. dataFrom bindet live die Haar-Tabelle (Frequenz + logDice)
 * aus dem SekII-F2-Item ein → nie harte Zahlen im Quellcode (Datenpolitik AP5).
 */
export const beamer4 = {
  slides: [
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ④', title: 'Was Häufigkeit verschweigt', lead: '„langes Haar“ oder „blondes Haar“ – was ist häufiger? Was ist typischer? Und woher weiß die App das überhaupt?' },
    { kind: 'bullets', kicker: 'Die Maschine hinter der Zahl', title: 'Wie aus echten Texten ein Wortprofil wird', bullets: [
      '① Rohtext (Bundestag, Gesetze, DTA, Wikipedia) → ② Grundform (geht/ging/gegangen → gehen).',
      '③ Wortart bestimmen → ④ Abhängigkeit parsen (wer hängt an wem – wie in ③).',
      '⑤ Paare entlang der Kanten zählen → darum „Entscheidung treffen“ auch über Distanz.',
    ] },
    { kind: 'bullets', kicker: 'Das Maß: logDice', title: 'Nicht wie oft – sondern wie exklusiv', bullets: [
      'logDice = 14 + log₂(2·f(A,B) / (f(A)+f(B))). f(A,B) = zusammen, f(A)/f(B) = einzeln.',
      'Das Verhältnis zählt: „lang“ passt zu vielem → niedrig; „blond“ bindet an „Haar“ → hoch.',
      'Skala bis 14 (Obergrenze bei maximaler Bindung). Häufig ≠ typisch.',
    ] },
    // Datenfolie live aus wortprofil.db (insertAfter 2, d. h. Folie 4 im PDF).
    { kind: 'bullets', kicker: 'Methodenkritik (wwLz)', title: 'Wo die Methode irrt', bullets: [
      'Die Zahl sagt nichts über Bedeutung, Angemessenheit, Stilwert oder Ironie.',
      'Jede automatische Annotation ist eine Deutung – Lemmatisierung und Parser können irren.',
      'Korpus-Bias: parlamentarische Texte → andere Muster als Romane. Wer das Korpus wählt, prägt den Befund.',
    ] },
    // Schlussfolie (Ergebnissicherung): Merksatz wie im Entwurf verankert.
    { kind: 'merksatz', title: 'Häufigkeit lügt – logDice misst Bindung.' },
  ],
  dataFrom: {
    itemId: 's4-f2-tabelle-lesen-sek2',
    insertAfter: 2,
    title: 'Häufig ≠ typisch – Haar-Daten live',
    kicker: 'Datenblick · „Haar“',
  },
}

export const lesson4 = { entwurf: entwurf4, beamer: beamer4 }
export default lesson4
