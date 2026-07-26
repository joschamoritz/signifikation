/**
 * server/course/lesson/station-5.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ⑤ „Belegen statt raten“
 * (Mini-Recherche, Kulmination). Folgt Kurs-Didaktik-Standards §1/§1a/§2/§3/§4.
 *
 * Quelle: planning/Kurs-Station-5-Recherche.md §6 + planning/Kurs-Didaktik-Standards.
 * Phasenmodell: von Brand, Modell 2 „Erarbeitetes anwenden“ (forschendes Lernen –
 *   keine neue Regel, sondern Werkzeuge aus ①–④ in eigenem Forschungszyklus anwenden).
 * KLP: Sek II/LK 2025 IF Sprache – semantische/pragmatische Aspekte, Methodenreflexion,
 *   wissenschaftspropädeutisches forschendes Lernen.
 */

export const entwurf5 = {
  stationNo: 5,
  niveau: 'SekII',
  uv: 'Sprache unter der Lupe – Wortverbindungen zwischen freier Wahl und festem Muster',
  sequenz: 'Station ⑤ · Belegen statt raten (Mini-Recherche)',
  stundenthema: '„Eine Frage an die Sprache“ – eine eigene Hypothese am Korpus prüfen und begründet beantworten',
  phasenmodell: 'von Brand, Modell 2 (Erarbeitetes anwenden – forschendes Lernen)',

  uvZiele: [
    { text: 'das Verhältnis von Sprache, Denken und Wirklichkeit reflektieren; empirische Methoden zur Sprachuntersuchung einsetzen (wissenschaftspropädeutisch)', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'semantische und pragmatische Aspekte der Sprache erläutern; sprachliche Urteile an Belegen überprüfen', quelle: 'klp-deutsch-sek2-2025', wesentlich: true },
    { text: 'sprachlich-stilistische Mittel im Hinblick auf Bedeutung und Wirkung erläutern; Angemessenheit und syntaktische/semantische Variationsbreite überprüfen', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
    { text: 'innere und äußere Mehrsprachigkeit reflektieren; Sprachvarietäten und ihre Funktionen beurteilen', quelle: 'klp-deutsch-sek2-2025', wesentlich: false },
  ],
  begruendung: 'Station ⑤ ist der didaktische Abschluss der Reihe: Die SuS wenden alle Werkzeuge (Kollokation ①, Wortart ②, Slot ③, logDice ④) in einem eigenen Forschungszyklus an. Das Muster Hypothese → Korpus-Prüfung → Befund-Deutung → Stellungnahme ist wissenschaftspropädeutisch und direkt an die KLP-Sek-II-Kompetenz „Verhältnis Sprache–Denken–Wirklichkeit“ angebunden. Von Brand Modell 2 ist hier das richtige Phasenmodell, weil keine neue Regel eingeführt wird, sondern erarbeitetes Wissen in neuem Kontext angewandt wird.',

  dreiklang: {
    gegenstand: 'Korpusbasierte Sprachreflexion',
    thema: '„Eine Frage an die Sprache“ – eine eigene Hypothese am Korpus prüfen und begründet beantworten.',
    splz: 'Die SuS deuten ihren am Korpus erhobenen Befund und nehmen begründet Stellung, indem sie den Befund mit der eigenen Hypothese abgleichen und die Abweichung erklären; LK: d. h. im Einzelnen zusätzlich die Aussagekraft kritisch einordnen (Korpusabhängigkeit, z. B. am Beispiel „Diskussion eröffnen“).',
    wwlz: 'Die SuS reflektieren die Grenzen korpusbasierter Aussagen, indem sie beurteilen, wie das gewählte Korpus das Ergebnis beeinflusst (Korpusart, Frequenzhöhe, Homonyme).',
    kompetenzbezug: 'KLP Deutsch Sek II 2025, Inhaltsfeld Sprache: Verhältnis von Sprache, Denken und Wirklichkeit; semantische und pragmatische Aspekte; wissenschaftspropädeutisches forschendes Lernen; Medien- und Methodenreflexion.',
  },
  begruendungStunde: 'Die Stunde folgt von Brand Modell 2 (Erarbeitetes anwenden – forschendes Lernen) und trennt die Medien in konzentrierte Blöcke: kein Medienwechsel mitten in der Bearbeitung (Kurs-Didaktik-Standards §5). Der Einstieg stellt das Bauchgefühl gegen den Befund („starker“ vs. „strömender Regen“). Das begleitende Arbeitsblatt liefert das methodische Gerüst: Es sichert den Forschungszyklus (Hypothese → prüfen → Befund → Stellungnahme) und lässt die SuS ihre Hypothese formulieren – bevor sie ins Profil schauen (Hypothese-vor-Befund ist methodisch essenziell). Die digitale Station ist dann die eigentliche Mini-Recherche: die Hypothese am Korpus prüfen (Kern der Stunde). Die Ergebnissicherung führt zurück aufs Papier: Befund deuten und begründete Stellungnahme verschriftlichen, LK zusätzlich die Methodenkritik (Korpusabhängigkeit). Warum Modell 2: Keine neue Regel wird eingeführt – die SuS arbeiten mit dem aus ①–④ Erarbeiteten.',

  verlauf: [
    {
      phase: 'I Stundeneröffnung – Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Abstimmung: „Welches Adjektiv passt typischer zu ‚Regen\': stark oder strömend?“ – Ergebnisse sammeln. Offene Streitfrage stehen lassen.', kommentar: 'Fast alle tippen auf „stark“ (Bauchgefühl); der Befund wird der Korpus liefern. Forschungsbedürfnis erzeugen.', interaktion: 'Plenum', medien: 'Beamer-Folie 1 (Provokation)' },
      ],
    },
    {
      phase: 'II Stundenmitte – Erarbeitung (Arbeitsblatt: methodisches Gerüst, am Stück)', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Kurzer Plenums-Auftakt: Forschungszyklus am Regen-Beispiel durchspielen (Hypothese → Profil → Befund „strömend“ → deuten → Stellung nehmen); logDice-Werkzeug aus ④ reaktivieren.', kommentar: 'Modelliert den Prozess, bevor die SuS selbst forschen (CTML: Worked Example).', interaktion: 'LSG', medien: 'Beamer-Folie 2 (Forschungszyklus)' },
        { schritt: 'Begleit-Arbeitsblatt: Forschungszyklus-Methode sichern und eine eigene/gewählte Frage in eine prüfbare Hypothese fassen – vor dem Blick ins Profil.', kommentar: 'Das AB ist das methodische Gerüst; Hypothese-vor-Befund ist essenziell (das Profil beeinflusst das Urteil, wenn es vorher gesehen wird).', interaktion: 'EA → Partnerarbeit', medien: 'Arbeitsblatt (Wissen + Hypothese)' },
      ],
    },
    {
      phase: 'II Stundenmitte – Anwendung (digitale Station: Mini-Recherche, am Stück)', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Digitale Station ⑤ im Kurs-Tab durchgehend: die Hypothese am Korpus prüfen – Profil/Top-Verbindungen + Werte abfragen, Befund erheben.', kommentar: 'Kern der Stunde (Modell 2: Anwenden im Zentrum); die eigentliche Mini-Recherche als eigener, ununterbrochener Block. Das Feedback-System unterstützt den Prozess, gibt die Lösung nicht vor.', interaktion: 'Einzel-/Partnerarbeit', medien: 'Kurs-Tab (digitale Station)' },
      ],
    },
    {
      phase: 'III Stundenabschluss – Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Zurück aufs Arbeitsblatt: Befund deuten (Abgleich mit der Hypothese) und begründete Stellungnahme verschriftlichen (3–4 Sätze, datengestützt).', kommentar: 'Sichert das SpLz schriftlich und schließt den Forschungszyklus.', interaktion: 'EA', medien: 'Arbeitsblatt (Stellungnahme)' },
        { schritt: 'Befunde im Plenum vorstellen; LK: Korpusabhängigkeit am Beispiel „Diskussion eröffnen“ (parlamentarisches Korpus → sehr hoher logDice). HA: LK-Methodenkritik ausformulieren.', kommentar: 'Verankert das wwLz (Grenzen des Befunds); Befund ≠ Wahrheit, sondern Korpus-Sicht.', interaktion: 'Plenum', medien: 'Beamer-Folie 3 (Auflösung + Bias)' },
      ],
    },
  ],

  anhang: [
    'Antizipiertes Tafelbild: Forschungszyklus-Schema (Hypothese → Prüfen → Deuten → Stellung), Regen-Auflösung.',
    'Material: begleitendes Arbeitsblatt (Forschungszyklus-Gerüst + Hypothese/Stellungnahme) + Erwartungshorizont (aus demselben Content-Modell) + Beamer-Folien (Regen-Profil live); digitale Station ⑤ im Kurs-Tab.',
    'Zusammenspiel der Medien (getrennte Blöcke, kein Wechsel mitten in der Bearbeitung): Arbeitsblatt = methodisches Gerüst (Zyklus sichern + Hypothese formulieren) und Abschluss (Stellungnahme); digitale Station = die eigentliche Mini-Recherche (Hypothese am Korpus prüfen). Reihenfolge AB → digitale Station → AB folgt dem Forschungszyklus (Hypothese vor Befund, Stellungnahme nach Befund).',
    'Differenzierung: Sek II bis Befund-Deutung + Stellungnahme; LK bis Methodenkritik (Korpusabhängigkeit, Frequenzhöhe, Homonyme).',
    'LK-Bias-Beispiel: „Diskussion eröffnen“ (logDice sehr hoch) als Effekt parlamentarisch geprägter Korpora.',
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
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ⑤', title: 'Eine Frage an die Sprache', lead: '„starker Regen“ oder „strömender Regen“? Stimmte dein Bauchgefühl – und was sagt das Korpus?' },
    { kind: 'bullets', kicker: 'Der Forschungszyklus', title: 'Fünf Schritte zur Antwort', bullets: [
      '① Hypothese: Was vermutest du – vor dem Blick ins Profil?',
      '② Prüfen: Top-Verbindungen + Werte im Kurs-Tab nachschlagen.',
      '③ Befund: Was zeigen die Daten – unabhängig von der Vermutung?',
      '④ Deuten: Hypothese bestätigt oder widerlegt? Was überrascht?',
      '⑤ Stellung nehmen: begründet und datengestützt.',
    ] },
    // Datenfolie live aus wortprofil.db (Regen-Profil, insertAfter 1).
    { kind: 'bullets', kicker: 'Methodenkritik (wwLz, LK)', title: 'Beleg ≠ Wahrheit', bullets: [
      'Ein Befund hängt immer vom Korpus ab: parlamentarische Texte → andere Muster als Romane.',
      'Beispiel: „Diskussion eröffnen“ sehr stark – weil das Korpus viele Plenarprotokolle enthält.',
      'Niedrige Frequenz = weniger belastbar. Homonyme verzerren. Befund ist eine Korpus-Sicht, keine Naturwahrheit.',
    ] },
    { kind: 'merksatz', title: 'Ein Befund zählt mehr als eine Meinung – aber nur, wenn man ihn deutet.' },
  ],
  dataFrom: {
    itemId: 's5-f3-befund-deuten-sek2',
    insertAfter: 1,
    title: 'Regen-Profil live – Hypothese vs. Befund',
    kicker: 'Datenblick · „Regen“',
  },
}

export const lesson5 = { entwurf: entwurf5, beamer: beamer5 }
export default lesson5
