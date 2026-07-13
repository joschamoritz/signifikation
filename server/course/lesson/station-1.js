/**
 * server/course/lesson/station-1.js
 *
 * Unterrichtsentwurf + Beamer-Spec für Station ① „Wortpartner & Kollokationen".
 * Folgt VERBINDLICH Kurs-Didaktik-Standards:
 *   - §1/§1a Dreiklang (Gegenstand sachlich · Thema mit „wozu" · SpLz direktes
 *     Präsens + „indem"), wwLz andere Dimension.
 *   - §2 ZfsL-Entwurfsschema (I längerfr. Zusammenhänge · II Planung/Dreiklang/
 *     Verlauf · III Anhang), Verlaufsspalten Arbeitsschritt/Kommentar/Interaktion/Medien.
 *   - §3 Phasenmodell von Brand, Modell 1 „neu erlernen, sichern, anwenden"
 *     (für Sprach-/Grammatikstunden): Einstieg · Erarbeitung · Plateaubildung ·
 *     Anwendung · Ergebnissicherung.
 *   - §4 Lehrplanbezug (Sek I G9 2019, IF 1 Sprache).
 *
 * Reine Daten (kein DB-/FS-Zugriff). Default-Niveau SekI; das Korpus ist hier
 * Gegenstand, daher „am Korpus überprüfen" im Thema zulässig (§1a).
 */

export const entwurf1 = {
  stationNo: 1,
  niveau: 'SekI',
  uv: 'Sprache unter der Lupe – Wortverbindungen zwischen freier Wahl und festem Muster',
  sequenz: 'Station ① · Wortpartner & Kollokationen',
  stundenthema: '„Das passt zusammen" – Typische Wortverbindungen am Korpus erkennen und für den eigenen Ausdruck nutzbar machen',
  phasenmodell: 'von Brand, Modell 1 (neu erlernen · sichern · anwenden)',

  // I — längerfristige Zusammenhänge: UV-Ziele kompetenzorientiert (KLP).
  uvZiele: [
    { text: 'einen zunehmend differenzierten Wortschatz funktional einsetzen', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'Wortbedeutungen aus dem Kontext erschließen und unter Zuhilfenahme von Wörterbüchern klären', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: true },
    { text: 'sprachliche Mittel und stilistische Merkmale auf Wortebene in ihrer Wirkung beschreiben', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: false },
    { text: 'innere und äußere Mehrsprachigkeit: Unterschiede zwischen Sprachen erkennen (kontrastiver Baustein)', quelle: 'klp-deutsch-sek1-g9-2019', wesentlich: false },
  ],
  begruendung: 'Kollokationen werden im KLP nicht als eigener Gegenstand genannt; sie sind das Vehikel für die Wortschatz- und Wortbedeutungs-Kompetenzen des Inhaltsfelds Sprache. Die Station bündelt rezeptive (erkennen) und produktive (selbst bilden) Wortschatzarbeit und legt die korpusbasierte Grundlage (Typikalität statt bloßer Häufigkeit) für die spätere Korpus-Station ④.',

  // II — Dreiklang (§1a: SpLz direktes Präsens + „indem").
  dreiklang: {
    gegenstand: 'Kollokationen als usuelle, korpusbasiert nachweisbare Wortverbindungen (z. B. „Entscheidung treffen", „schwerer Fehler"); ihre Typikalität ist über Kookkurrenz quantifizierbar.',
    thema: '„Das passt zusammen" – typische von untypischen Wortverbindungen unterscheiden und am Korpus überprüfen, um den eigenen Ausdruck idiomatisch zu schärfen.',
    splz: 'Die SuS unterscheiden typische von untypischen Wortverbindungen, indem sie zu einem Nomen passende Partner zuordnen, die feste Verbindung im echten Belegsatz markieren und ihre Wahl mit dem Natürlichkeitsempfinden begründen.',
    wwlz: 'Die SuS reflektieren, dass Kollokationen sprachspezifisch sind, indem sie eine wörtliche Übersetzung als unpassend erkennen und die deutsche Konvention benennen.',
    kompetenzbezug: 'KLP Deutsch Sek I (G9, 2019), Inhaltsfeld 1 Sprache: differenzierten Wortschatz funktional einsetzen; Wortbedeutungen klären.',
  },
  begruendungStunde: 'Die Stunde trennt die beiden Medien in zwei konzentrierte Blöcke, statt sie zu verzahnen – so entfällt der lernhemmende Medienwechsel mitten in der Bearbeitung (Kurs-Didaktik-Standards §5, CLT: extraneous load senken). Das begleitende Arbeitsblatt trägt die Erarbeitung: Es baut das Fachwissen strukturiert auf (Wissens-Infokasten, Merksatz) und lässt es in eigenen Aufgaben erstmals anwenden – auf Papier, mit bleibender Notiz, bewusst redundanzarm (kein Klon der App-Aufgabe). Die digitale Station übernimmt danach die vertiefte Anwendung: viele Einzelfälle mit sofortigem Korpus-Feedback (USP), als eigener, ununterbrochener Block. Die Plateaubildung im Plenum sichert das gemeinsame Zwischenergebnis am Übergang; Belege + Aufgabe + Hilfe stehen auf dem AB räumlich zusammen (Split-Attention vermieden), die Differenzierung läuft über die Niveau-Blätter.',

  // II — Stundenverlauf (von Brand Modell 1), Spalten §2.
  verlauf: [
    {
      phase: 'I Stundeneröffnung — Einstieg', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Impuls: zwei Wortverbindungen im Vergleich („starker Regen" ✓ / „strong rain" wörtlich ✗).', kommentar: 'Aktiviert Vorwissen, erzeugt kognitiven Konflikt → Sachaspekt: Konvention vs. wörtliche Bedeutung.', interaktion: 'Plenum / LSG', medien: 'Beamer-Folien 1–2' },
        { schritt: 'Leitfrage entwickeln: „Warum klingt das eine richtig, das andere nicht?"', kommentar: 'Problemorientierung; macht das Lernziel transparent.', interaktion: 'Plenum', medien: 'Tafel' },
      ],
    },
    {
      phase: 'II Stundenmitte — Erarbeitung (Arbeitsblatt, am Stück)', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Begleit-Arbeitsblatt durchgehend bearbeiten: Wissensblock (Kollokation, Basis + Kollokator, Kontinuum frei–Kollokation–Idiom), Merksatz, dann die eigenen Aufgaben – differenziert nach Niveau.', kommentar: 'Neu erlernen + erste Anwendung auf Papier, ohne Medienwechsel (von Brand): das Fachwissen wird strukturiert erarbeitet und bleibt als Referenz/Notiz. Belege als Fußnoten (Hausmann, Steyer); Differenzierung über das Niveau-AB.', interaktion: 'EA → Partnerarbeit', medien: 'Arbeitsblatt (Wissen + Aufgaben)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Plenums-Sicherung: Merksatz „Typisch = üblich" + zentrale AB-Ergebnisse vergleichen, offene Fragen klären.', kommentar: 'Sichert ein gemeinsames Zwischenergebnis, damit ALLE für die Anwendungsphase arbeitsfähig sind (Plateau) – zugleich Übergang vom Papier zum Gerät.', interaktion: 'Plenum', medien: 'Tafel / Beamer' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung (digitale Station, am Stück)', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Digitale Station ① im Kurs-Tab durchgehend: typische Partner üben – zuordnen, im echten Belegsatz markieren, vergleichen – mit Sofort-Feedback am Korpus.', kommentar: 'Vertiefte, gebrauchsbasierte Anwendung des gesicherten Begriffs: die App liefert viele Einzelfälle mit unmittelbarer Rückmeldung (USP) und ist als eigener Block – nach dem AB – konzentriert bearbeitbar.', interaktion: 'Einzel-/Partnerarbeit', medien: 'Kurs-Tab (digitale Station)' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Daten-Aha im Plenum (Beamer „häufig ≠ typisch", Sek II/LK) bzw. Rückschau auf die Leitfrage; HA: eigenes Wort wählen und in der digitalen Station ① prüfen.', kommentar: 'Überprüft den Lernerfolg, verankert das wwLz (Sprachspezifik) und schließt den Kreis: das AB stellt die Hypothese, die App prüft sie.', interaktion: 'Plenum → EA (HA)', medien: 'Beamer-Schlussfolie / Kurs-Tab' },
      ],
    },
  ],

  // III — Anhang.
  anhang: [
    'Antizipiertes Tafelbild: „Kollokation = übliche Wortverbindung aus Basis + Kollokator (nicht Wort für Wort übersetzbar)" + Beispielpaare; Merksatz „Typisch = üblich".',
    'Material: begleitendes Arbeitsblatt (Wissensblock + eigene Aufgaben + Transfer) + Erwartungshorizont (aus demselben Content-Modell) + Beamer-Folien; digitale Station ① im Kurs-Tab.',
    'Zusammenspiel der Medien (zwei getrennte Blöcke, kein Wechsel mitten in der Bearbeitung): Arbeitsblatt = Erarbeitung (Fachwissen sichern + erste Anwendung auf Papier); digitale Station = vertiefte Anwendung (üben mit Sofort-Feedback am Korpus). Die HA schließt den Kreis (AB stellt die Hypothese → App prüft sie).',
    'Differenzierung: Niveau-Arbeitsblätter (DaZ / Sek I / Sek II / LK) aus demselben Content-Modell.',
    'Für Sek II / LK: logDice bleibt Black Box (höher = stärker gebunden, Skala bis ca. 14); die Formel/Mechanik gehört Station ④. Datenfolie „häufig ≠ typisch" nur zur Anschauung; Werte liefert das Korpus zur Laufzeit (keine festen Zahlen im Material).',
  ],

  belege: ['reder-2006', 'hausmann-wortverbindungen', 'steyer-2000', 'vonbrand-2010', 'klp-deutsch-sek1-g9-2019', 'script-leitfaden-2020'],
}

/**
 * Beamer-Spec. Überwiegend statische Folien; `dataFrom` markiert eine optionale
 * Datenfolie, die der Generator zur Laufzeit mit echten Korpuswerten füllt
 * (resolved F5-Item) – nie harte logDice-Zahlen im Quellcode (Datenpolitik).
 */
export const beamer1 = {
  slides: [
    { kind: 'title', kicker: 'Signifikation · Kurs · Station ①', title: 'Wortpartner & Kollokationen', lead: '„starker Regen" – im Englischen aber „heavy rain". Wer Wort für Wort übersetzt, sagt „schwerer Regen". Warum stimmt das nicht?' },
    { kind: 'bullets', kicker: 'Worum geht es?', title: 'Typische Wortverbindungen', bullets: [
      'Manche Wörter treten regelmäßig zusammen auf: „Entscheidung treffen", „schwerer Fehler".',
      'Das nennt man Kollokation – eine typische Wortverbindung.',
      'Sie ist nicht frei wählbar und nicht Wort für Wort übersetzbar.',
    ] },
    { kind: 'bullets', kicker: 'Lernziel', title: 'Was du heute kannst', bullets: [
      'typische von untypischen Wortverbindungen unterscheiden,',
      'die feste Verbindung im echten Satz erkennen,',
      'deine Wahl begründen.',
    ] },
    // Datenfolie wird hier eingefügt (dataFrom), falls Korpus verfügbar.
    { kind: 'merksatz', title: 'Wörterbücher übersetzen Wörter — Korpora übersetzen Konventionen.', quelle: 'Reder 2006' },
  ],
  // Datenfolie aus einem aufgelösten Item (Frequenz/logDice) bauen.
  dataFrom: { itemId: 's1-f5-fehler-datenblick-sek2', insertAfter: 2, title: 'Häufig ist nicht gleich typisch', kicker: 'Datenblick · „Fehler"' },
}

export const lesson1 = { entwurf: entwurf1, beamer: beamer1 }
export default lesson1
