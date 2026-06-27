/**
 * server/course/lesson/station-4.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ④ „Texte, die zählen"
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
  stundenthema: '„Was Häufigkeit verschweigt" – Wie ein Korpus mit logDice misst, welche Wortverbindungen wirklich typisch sind',
  phasenmodell: 'von Brand, Modell 1 (neu erlernen · sichern · anwenden)',

  uvZiele: [
    { text: 'das Verhältnis von Sprache, Denken und Wirklichkeit reflektieren; wissenschaftspropädeutische Methoden einbeziehen', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'sprachlich-stilistische Mittel und semantische Variationsbreite im Hinblick auf Bedeutung und Wirkung erläutern', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'semantische und pragmatische Aspekte der Sprache erläutern', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
    { text: 'innere und äußere Mehrsprachigkeit reflektieren (Variationsbreite innerhalb des Deutschen)', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Station ④ liefert die empirische Basis, auf der ①–③ ruhen: Woher weiß die App, was typisch ist? Die Unterscheidung Rohfrequenz vs. Assoziationsstärke (logDice) ist nicht nur Fachdetail, sondern der epistemische Kern der Korpuslinguistik. Im KLP Sek II ist das Verhältnis Sprache–Denken–Wirklichkeit explizit ausgewiesen; quantitative Sprachanalyse eröffnet eine wissenschaftspropädeutische Dimension. Die Schnupper-Variante für DaZ/SekI macht denselben Kerngedanken (häufig ≠ typisch) ohne Fachterminus zugänglich.',

  dreiklang: {
    gegenstand: 'Korpus als empirische Textsammlung; Token/Type/Frequenz/Kookkurrenz; Rohfrequenz als Zählmaß versus logDice als Assoziationsmaß der Typikalität (Skala 0–14; je exklusiver die Verbindung, desto höher der Wert).',
    thema: '„Was Häufigkeit verschweigt" – wie ein Korpus mit logDice misst, welche Wortverbindungen wirklich typisch sind.',
    splz: 'Die SuS erklären, wie Korpora Typikalität messen, indem sie Rohfrequenz und logDice an Beispielen unterscheiden und begründen, warum die häufigste Verbindung nicht die typischste ist; LK: d. h. im Einzelnen die Grundlogik der logDice-Formel (gemeinsames vs. einzelnes Vorkommen) deuten und auf ein eigenes Beispiel anwenden.',
    wwlz: 'Die SuS reflektieren kritisch Chancen und Grenzen quantitativer Sprachanalyse, indem sie beurteilen, was eine Assoziationszahl über Sprache aussagt – und was nicht (Bedeutung, Kontext, Stilwert).',
    kompetenzbezug: 'KLP Deutsch Sek II 2025, Inhaltsfeld Sprache: Verhältnis von Sprache, Denken und Wirklichkeit; wissenschaftspropädeutische Reflexion; semantische und pragmatische Aspekte.',
  },
  begruendungStunde: 'Der Einstieg nutzt eine Schätzfrage (Haar-Adjektive: häufigste vs. typischste), die fast alle SuS falsch beantworten – der Überraschungseffekt motiviert das Bedürfnis nach einem Mess-Instrument. Die Erarbeitung führt Korpus, Frequenz und logDice schrittweise ein; die Plateaubildung sichert das Grobraster (häufig ≠ typisch; Skala ~10 = typisch). Die Daten-Folie im Beamer wird live aus der Datenbank gefüllt (keine harten Zahlen im Code). Das wwLz wird durch die Reflexionsphase gesichert: Was sagt die Zahl nicht?',

  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Schätzfrage: „Welches Adjektiv kommt am häufigsten mit ‚Haar\' vor? Welches ist am typischsten?" → Abstimmung (Handzeichen), Ergebnisse sichern.', kommentar: 'Fast alle nennen das Häufigste als das Typischste → Hypothese, die der Befund widerlegt. Erzeugt kognitiven Bedarf für ein Mess-Instrument.', interaktion: 'Plenum', medien: 'Beamer-Folie 1 (Schätzfrage)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Korpus-Konzept einführen: Token, Type, Frequenz, Kookkurrenz; Unterschied zur Wörterbuchsuche.', kommentar: 'Konzeptuelle Basis; erklärt rückblickend ①–③ (Woher kamen unsere Daten?).', interaktion: 'Plenum', medien: 'Beamer-Folie 2 (Daten-Strecke)' },
        { schritt: 'logDice als Bindungsmaß einführen: „nicht wie oft – sondern wie exklusiv"; Skala 0–14; Formel-Grundlogik (LK: f(A,B) / (f(A)+f(B))).', kommentar: 'Kerneinsicht: exklusive Verbindung → hoher Wert; häufige-aber-beliebige Verbindung → niedrig. Lüdeling/Walter 2009; Bubenhofer 2015.', interaktion: 'Plenum → EA', medien: 'Beamer-Folie 3 (logDice-Strecke)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Tafelbild: „häufig ≠ typisch" + Skala-Grobraster (didaktische Faustregel: ~10 typisch · ~7 erkennbar · niedrig zufällig). Auflösung der Schätzfrage.', kommentar: 'Plateau: alle können das Grobraster für die nachfolgende AB-Arbeit anwenden. Datenfaustregel ist didaktische Setzung, kein fester Grenzwert.', interaktion: 'Plenum', medien: 'Tafel / Beamer (Live-Daten)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'AB differenziert: Sek II F2–F4 (Tabelle lesen · häufig-vs-typisch begründen · Skala verorten); LK F4–F5 (Skala + Formel deuten + Methodenkritik).', kommentar: 'Sek II bis Urteil/Begründung; LK bis Formellogik und kritischer Reflexion (Chancen/Grenzen).', interaktion: 'Partnerarbeit', medien: 'Arbeitsblatt (differenziert)' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung + Reflexion', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Auflösung Hypothese; wwLz: „Was sagt ein hoher logDice-Wert nicht?" (Bedeutung, Angemessenheit, Ironie, Kontext). Merksatz: „Häufigkeit lügt – logDice misst Bindung."', kommentar: 'Verankert das wwLz (Methodenkritik); bereitet ⑤ (eigene Recherche) vor.', interaktion: 'Plenum', medien: 'Beamer-Folie 4 (Reflexion)' },
        { schritt: 'Transfer/HA: eigenes Wort wählen, Frequenz und logDice der Top-Verbindungen vergleichen; Fazit in einem Satz.', kommentar: 'Sichert eigenständigen Umgang mit dem Messkonzept.', interaktion: 'EA', medien: 'Kurs-Tab' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: „häufig ≠ typisch" + Skala-Grobraster (~10 typisch · ~7 erkennbar) + Haar-Beispiel.',
    'Material: Arbeitsblatt + Erwartungshorizont (Sek II / LK); Worked Example aus Haar-Tabelle (Frequenz vs. logDice).',
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
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ④', title: 'Texte, die zählen', lead: '„langes Haar" oder „blondes Haar" – was ist häufiger? Was ist typischer? Und wo liegt der Unterschied?' },
    { kind: 'bullets', kicker: 'Das Werkzeug: Korpus', title: 'Die App rät nicht – sie misst', bullets: [
      'Korpus = große, ausgewählte Textsammlung (Bundestag, DTA, Leipzig …).',
      'Frequenz = wie oft ein Wort vorkommt. Kookkurrenz = wie oft zwei Wörter zusammen.',
      'Aber: häufig ≠ typisch. Dafür brauchen wir logDice.',
    ] },
    { kind: 'bullets', kicker: 'Das Maß: logDice', title: 'Nicht wie oft – sondern wie exklusiv', bullets: [
      'logDice misst, wie sehr zwei Wörter aneinander gebunden sind (Skala 0–14).',
      '„lang" passt zu vielem → niedrig. „blond" ist für „Haar" charakteristisch → höher.',
      'Faustformel: ~10 = typisch · ~7 = erkennbar · niedrig = zufällig.',
    ] },
    // Datenfolie live aus wortprofil.db (insertAfter 2, d. h. Folie 4 im PDF).
    { kind: 'bullets', kicker: 'Methodenkritik (wwLz)', title: 'Was sagt logDice nicht?', bullets: [
      'Nichts über Bedeutung: eine hohe Bindung macht eine Verbindung nicht schön oder richtig.',
      'Nichts über Angemessenheit, Stilwert oder Ironie.',
      'Nichts über die Qualität des Korpus: parlamentarische Texte → andere Muster als Romane.',
    ] },
  ],
  dataFrom: {
    itemId: 's4-f2-tabelle-lesen-sek2',
    insertAfter: 2,
    title: 'Häufig ≠ typisch – Haar-Daten live',
    kicker: 'Datenblick · „Haar"',
  },
}

export const lesson4 = { entwurf: entwurf4, beamer: beamer4 }
export default lesson4
