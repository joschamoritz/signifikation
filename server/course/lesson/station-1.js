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
  begruendungStunde: 'Der Einstieg erzeugt das Problem über einen Kontrastfall (wörtliche Übersetzung scheitert), damit die Lerngruppe die Leitfrage selbst formuliert. Die Erarbeitung nutzt ein Worked Example vor der ersten Übung (CLT: germane load erhöhen, extraneous senken). Die Plateaubildung sichert den Begriff „typische Wortverbindung" für alle, bevor die differenzierte Anwendung (Niveau-AB) folgt. Belege + Aufgabe + Hilfe stehen räumlich zusammen (Split-Attention vermieden).',

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
      phase: 'II Stundenmitte — Erarbeitung', anteil: 'Anteil 3',
      schritte: [
        { schritt: 'Worked Example am AB gemeinsam durchgehen (Wortpartner zuordnen).', kommentar: 'Modelliert die Vorgehensweise vor der ersten eigenen Übung (CTML: Worked Example).', interaktion: 'LSG', medien: 'Arbeitsblatt' },
        { schritt: 'Aufgaben 1–2: typische Partner zuordnen + im echten Belegsatz markieren.', kommentar: 'Rezeptive Sicherung am authentischen Korpusbeleg; Typikalität wird erfahrbar.', interaktion: 'Partnerarbeit', medien: 'Arbeitsblatt / App (optional)' },
      ],
    },
    {
      phase: 'II Stundenmitte — Plateaubildung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Zwischensicherung: Begriff „Kollokation = typische Wortverbindung" + Merksatz an der Tafel.', kommentar: 'Sichert das Ergebnis so, dass ALLE weiterarbeiten können (Plateau).', interaktion: 'Plenum', medien: 'Tafel / Beamer' },
      ],
    },
    {
      phase: 'II Stundenmitte — Anwendung', anteil: 'Anteil 2',
      schritte: [
        { schritt: 'Variantenvergleich mit Begründung (differenziert: Niveau-AB).', kommentar: 'Produktive Anwendung; Begründung schult Metasprache + Urteilsvermögen.', interaktion: 'Einzel- → Partnerarbeit', medien: 'Arbeitsblatt (differenziert)' },
      ],
    },
    {
      phase: 'III Stundenabschluss — Ergebnissicherung', anteil: 'Anteil 1',
      schritte: [
        { schritt: 'Merksatz festhalten; kontrastiver Transfer (Übersetzung) als Rückschau.', kommentar: 'Überprüft den Lernerfolg, verankert das wwLz (Sprachspezifik).', interaktion: 'Plenum', medien: 'Beamer-Schlussfolie' },
      ],
    },
  ],

  // III — Anhang.
  anhang: [
    'Antizipiertes Tafelbild: „Kollokation = typische Wortverbindung (nicht Wort für Wort übersetzbar)" + Beispielpaare.',
    'Material: Arbeitsblatt + Lösung/Erwartungshorizont (dieselbe Quelle), Beamer-Folien.',
    'Differenzierung: Niveau-Arbeitsblätter (DaZ / Sek I / Sek II / LK) aus derselben Aufgaben-Engine.',
    'Für Sek II / LK: Vor den datengestützten Aufgaben die beiden Maße kurz einführen — Frequenz f („wie oft kommt die Verbindung vor") und logDice („wie stark sind die beiden Wörter aneinander gebunden"; Skala bis ca. 14, höher = typischer). Kernidee: häufig ≠ typisch. Die Datenfolie „Häufig ist nicht gleich typisch" dient als Anschauung; konkrete Werte liefert das Korpus zur Laufzeit (keine festen Zahlen im Material).',
  ],

  belege: ['reder-2006', 'steyer-2000', 'vonbrand-2010', 'klp-deutsch-sek1-g9-2019', 'script-leitfaden-2020'],
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
