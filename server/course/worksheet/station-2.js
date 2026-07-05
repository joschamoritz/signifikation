/**
 * server/course/worksheet/station-2.js
 *
 * Content-Modell des begleitenden Arbeitsblatts zu Station ② „Wörter mit Funktion"
 * (Wortarten als Werkzeug). Begleitet die digitale Station, dupliziert sie nicht.
 * Quelle: planning/Kurs-Konzept-Progression.md (② besitzt Wortart/Feldermodell),
 * planning/Kurs-Material-Ueberarbeitung.md §1.2, content/station-2.js (App-Kern).
 *
 * Owner-Regel (Konzept-Progression §5): ② besitzt Wortarten-Systematik, Form vs.
 * Funktion, Konversion, Verschiebeprobe/Feldermodell, FVG (LK). Satzglieder (S/P/O)
 * nur knapp als Black Box – die Systematik gehört ③.
 *
 * Belege (literatur.js): hoffmann-leimbrink-wortarten (Funktion vor Form),
 * didaktik-wortarten-d2 (Kritik der rein formalen Klassifikation), gallmann-2015-
 * topologie (Feldermodell/Verschiebeprobe/Nachfeld), lehmkuhle-2023 (operationale Proben).
 */

const IPA = 'ˈvɔʁtˌʔaːɐ̯tn̩'

const DaZ = {
  title: 'Bausteine im Satz',
  sub: 'DaZ / Sprachförderung · Nomen, Verb und Adjektiv erkennen',
  belege: ['hoffmann-leimbrink-wortarten', 'gallmann-2015-topologie'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Nomen, Verb, Adjektiv',
      paras: [
        'Jedes Wort hat eine Aufgabe. Drei wichtige **Bausteine** sind: das **Nomen** (Namenwort) für ein Ding, das **Verb** (Tunwort) für eine Tätigkeit und das **Adjektiv** (Wiewort) für eine Eigenschaft.[^1]',
      ],
    },
    { type: 'merke', text: 'Frag: Ist es ein **Ding** (Nomen), eine **Tätigkeit** (Verb) oder eine **Eigenschaft** (Adjektiv)?' },
    {
      type: 'skala', label: 'Wissen · Die drei Bausteine',
      stops: [
        { stufe: 'Nomen (Namenwort)', bsp: 'die Blume', erkl: 'ein Ding – man kann „die/eine" davorsetzen.' },
        { stufe: 'Verb (Tunwort)', bsp: 'wachsen', erkl: 'eine Tätigkeit – „sie wächst".' },
        { stufe: 'Adjektiv (Wiewort)', bsp: 'bunt', erkl: 'eine Eigenschaft – „die bunte Blume".' },
      ],
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Sortiere:', prompt: ' Ordne die Wörter zu – *Kritik*, *üben*, *scharf*.', fields: [{ label: 'Nomen:' }, { label: 'Verb:' }, { label: 'Adjektiv:' }], erwartung: 'Nomen: *Kritik* · Verb: *üben* · Adjektiv: *scharf*.' },
        {
          op: 'Markiere', prompt: ' im Satz das Adjektiv und das Nomen, die zusammengehören.',
          extraHtml: '<div style="margin-top:4pt;font-size:13pt;font-family:\'Gentium Plus\',serif">Die Zeitung übt scharfe Kritik.</div>',
          erwartung: '„scharfe" (Adjektiv) + „Kritik" (Nomen) gehören zusammen.',
        },
        { op: 'Verschiebe:', prompt: ' Das Verb „sucht" bleibt immer an Position 2. Schreibe den Satz zweimal – einmal mit „Der Hund", einmal mit „einen Ball" am Anfang.[^2]', answerLines: 2, erwartung: '„Der Hund sucht einen Ball." / „Einen Ball sucht der Hund." – das Verb „sucht" steht in beiden Sätzen an Position 2.' },
      ],
    },
    { type: 'transfer', text: 'Öffne die **Kurs-Station ②** und sortiere die Bausteine. Findest du zu jedem Baustein ein neues eigenes Beispiel?' },
  ],
}

const SekI = {
  title: 'Wörter mit Funktion',
  ipa: IPA,
  sub: 'Sekundarstufe I · Wortarten bestimmen und Satzglieder mit der Verschiebeprobe prüfen',
  belege: ['hoffmann-leimbrink-wortarten', 'gallmann-2015-topologie', 'lehmkuhle-2023'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Wortarten als Werkzeug',
      paras: [
        'Wörter lassen sich in **Wortarten** einteilen. Man erkennt sie an drei Kriterien: der **Bedeutung** (Ding / Tätigkeit / Eigenschaft), der **Form** (Nomen, Verb und Adjektiv sind veränderbar – *flektierbar*) und der **Funktion** im Satz.[^1]',
        'Typische **Baupläne** von Wortverbindungen: **Adjektiv + Nomen** („scharfe Kritik") und **Verb + Nomen** („Kritik üben").',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Die Verschiebeprobe',
      paras: [
        'Ob eine Wortgruppe ein **Satzglied** ist, *prüft* man mit einer operationalen Probe – statt zu raten.[^3] **Verschiebeprobe:** Das finite (gebeugte) Verb steht im Aussagesatz fest an **Position 2**. Nur was sich als geschlossene Einheit davor – ins **Vorfeld** – schieben lässt, ist ein Satzglied.[^2]',
      ],
    },
    { type: 'merke', text: 'Wortart und Satzglied erkennt man durch **Proben**, nicht durch Raten.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Ordne', prompt: ' jedes Wort seiner Wortart zu (pro Wortart passen mehrere): *Regierung, Kritik, beschließen, üben, scharf, heftig*.', fields: [{ label: 'Nomen:', width: 200 }, { label: 'Verb:', width: 200 }, { label: 'Adjektiv:', width: 200 }], erwartung: 'Nomen: *Regierung, Kritik* · Verb: *beschließen, üben* · Adjektiv: *scharf, heftig*.' },
        { op: 'Bestimme', prompt: ' den Bauplan: Welcher liegt in „scharfe Kritik" vor, welcher in „Kritik üben"?', answerLines: 1, erwartung: '„scharfe Kritik" = Adjektiv + Nomen · „Kritik üben" = Nomen + Verb.' },
        { op: 'Verschiebeprobe:', prompt: ' Welche Gruppen sind Satzglieder in „Der Lehrer erklärt heute die Regel."? Schiebe je eine ins Vorfeld.[^2]', chips: ['Der Lehrer', 'heute', 'die Regel'], answerLines: 1, erwartung: 'Alle drei sind Satzglieder: „Heute erklärt der Lehrer die Regel.", „Die Regel erklärt der Lehrer heute." – das Verb „erklärt" bleibt an Position 2.' },
        { op: 'Begründe:', prompt: ' Warum ist „Regel die" *kein* Satzglied?', answerLines: 2, erwartung: '„Regel die" ist nur eine umgedrehte Wortfolge; sie lässt sich nicht als sinnvolle geschlossene Einheit ins Vorfeld schieben → kein Satzglied.' },
      ],
    },
    { type: 'transfer', text: 'Nimm einen eigenen Satz und prüfe an der **Kurs-Station ②** mit der Verschiebeprobe, welche Wortgruppen Satzglieder sind.' },
  ],
}

const SekII = {
  title: 'Wörter mit Funktion',
  ipa: IPA,
  sub: 'Sekundarstufe II · Wortart über die Funktion; Konversion und das Feldermodell',
  belege: ['hoffmann-leimbrink-wortarten', 'didaktik-wortarten-d2', 'gallmann-2015-topologie'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Form und Funktion',
      paras: [
        'Die **Wortart** eines Wortes richtet sich nach seiner **Funktion** im Satz, nicht nach seiner Bedeutung. In „Die Partei *übt* Kritik" ist „übt" das **Prädikat** – also ein Verb, auch wenn es hier nicht „trainieren" bedeutet.[^1]',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Konversion (Nominalisierung)',
      paras: [
        'Durch **Konversion** wechselt ein Wort die Wortart, ohne den Stamm zu ändern: „üben" (Verb) → „das *Üben*" (Nomen). **Marker** sind der Artikel, die Großschreibung und der Wegfall der Konjugation.[^2]',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Das topologische Feldermodell',
      paras: [
        'Das **Feldermodell** ordnet den Satz in Felder. Im Aussagesatz steht das finite Verb an **Position 2** (**linke Satzklammer**); ein infinites Verb bildet die **rechte Klammer**. Dazwischen liegt das **Mittelfeld**, davor das **Vorfeld**.[^3]',
      ],
    },
    { type: 'merke', text: 'Die Wortart folgt der **Funktion**, nicht der Bedeutung.' },
    {
      type: 'felder', label: 'Feldermodell · „Der Hund hat im Garten einen Ball gesucht."',
      fields: [
        { label: 'Vorfeld', text: 'Der Hund' },
        { label: 'linke Klammer', text: 'hat' },
        { label: 'Mittelfeld', text: 'im Garten einen Ball' },
        { label: 'rechte Klammer', text: 'gesucht' },
      ],
      note: 'Das finite „hat" steht an Position 2, das infinite „gesucht" schließt die Satzklammer.',
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Bestimme', prompt: ' die Wortart von „übt" in „Die Opposition übt scharfe Kritik." über die *Funktion*.', answerLines: 1, erwartung: '„übt" ist das Prädikat → **Verb**. Die Funktion (Prädikat), nicht die Bedeutung, entscheidet.' },
        { op: 'Konversion:', prompt: ' Nenne zwei Marker, die „das Üben" als Nomen ausweisen, obwohl der Stamm ein Verb ist.', answerLines: 1, erwartung: 'Artikel „das" + Großschreibung (zusätzlich: keine Konjugation / Wegfall der Personalendung).' },
        { op: 'Feldanalyse:', prompt: ' Weise die Felder zu in „Das Kind hat am Morgen ein Buch gelesen."', fields: [{ label: 'Vorfeld:', width: 150 }, { label: 'linke Klammer:', width: 90 }, { label: 'Mittelfeld:', width: 170 }, { label: 'rechte Klammer:', width: 90 }], erwartung: 'Vorfeld: *Das Kind* · linke Klammer: *hat* · Mittelfeld: *am Morgen ein Buch* · rechte Klammer: *gelesen*.' },
      ],
    },
    { type: 'transfer', text: 'Bilde einen eigenen Satz mit zwei Verben (finit + infinit) und prüfe an der **Kurs-Station ②** deine Feldanalyse.' },
  ],
}

const LK = {
  title: 'Feste Fügungen und Felder',
  sub: 'Leistungskurs · Funktionsverbgefüge, Satzklammer mit Nachfeld, Konversion',
  belege: ['hoffmann-leimbrink-wortarten', 'gallmann-2015-topologie'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Funktionsverbgefüge (FVG)',
      paras: [
        'Ein **Funktionsverbgefüge** ist eine feste Verbindung aus **Funktionsverb + Nomen**, in der das Verb seine eigene Bedeutung weitgehend verliert und das **Nomen den Inhalt trägt** – z. B. „in Frage stellen", „zur Sprache bringen", „Kritik üben".[^1]',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Satzklammer und Nachfeld',
      paras: [
        'Die **Satzklammer** (finites + infinites Verb) umschließt das Mittelfeld. Hinter der rechten Klammer kann ein **Nachfeld** stehen – etwa ein ausgeklammerter Relativsatz.[^2]',
      ],
    },
    { type: 'merke', text: 'Im Funktionsverbgefüge trägt das **Nomen** den Inhalt, das Verb wird zur bloßen **Funktion**.' },
    {
      type: 'felder', label: 'Feldermodell mit Nachfeld · „Der Ausschuss hat das Gesetz beschlossen, das lange umstritten war."',
      fields: [
        { label: 'Vorfeld', text: 'Der Ausschuss' },
        { label: 'linke Klammer', text: 'hat' },
        { label: 'Mittelfeld', text: 'das Gesetz' },
        { label: 'rechte Klammer', text: 'beschlossen,' },
        { label: 'Nachfeld', text: 'das lange umstritten war.' },
      ],
      note: 'Der Relativsatz steht **ausgeklammert** im Nachfeld, hinter der Satzklammer.',
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'FVG oder frei?', prompt: ' Ist „Die Opposition stellt das Vorhaben in Frage." ein Funktionsverbgefüge? Begründe über Festigkeit und darüber, dass „stellen" nicht räumlich gemeint ist.[^1]', answerLines: 2, erwartung: 'Ja – ein FVG: „stellen" ist nicht räumlich gemeint, „Frage" trägt den Inhalt, die Verbindung ist fest. Kein Idiom, weil die Gesamtbedeutung nachvollziehbar bleibt.' },
        { op: 'Konversion analysieren:', prompt: ' Wie wird aus dem Verb „reisen" das Nomen „das Reisen"? Nenne zwei formale Marker.', answerLines: 1, erwartung: 'Artikel „das" + Großschreibung (Nominalisierung); der Stamm bleibt, die Wortart wechselt mit der Funktion.' },
        { op: 'Feldanalyse mit Nachfeld:', prompt: ' Weise die Felder zu in „Die Kommission hat den Antrag geprüft, der gestern einging."', fields: [{ label: 'Vorfeld:', width: 150 }, { label: 'linke Klammer:', width: 90 }, { label: 'Mittelfeld:', width: 130 }, { label: 'rechte Klammer:', width: 90 }, { label: 'Nachfeld:', width: 170 }], erwartung: 'Vorfeld: *Die Kommission* · linke Klammer: *hat* · Mittelfeld: *den Antrag* · rechte Klammer: *geprüft* · Nachfeld: *der gestern einging*.' },
      ],
    },
    { type: 'transfer', text: 'Suche in einem Sachtext ein Funktionsverbgefüge und prüfe an der **Kurs-Station ②**, ob es sich – wie „in Frage stellen" – fest verhält.' },
  ],
}

export const worksheet2 = {
  stationNo: 2,
  title: 'Wörter mit Funktion',
  levels: { DaZ, SekI, SekII, LK },
}

export default worksheet2
