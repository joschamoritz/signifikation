/**
 * server/course/worksheet/station-3.js
 *
 * Content-Modell des begleitenden Arbeitsblatts zu Station ③ „Wer hängt an wem?“
 * (grammatische Abhängigkeiten). Begleitet die digitale Station (Fachwissen +
 * eigene Aufgaben), dupliziert sie nicht – eigene Beispielsätze.
 * Quelle: planning/Kurs-Station-3-Abhaengigkeiten.md, planning/Kurs-Konzept-Progression.md.
 *
 * Owner (Konzept-Progression §5): ③ besitzt Satzglieder (S/P/O, Kasusobjekte,
 * Adverbiale, Attribut) + operationale Proben sowie Dependenz/Valenz/Rektion.
 * ② besitzt das Feldermodell/Verschiebeprobe → ③ nutzt die Umstellprobe als
 * bekanntes Werkzeug weiter (Gallmann 2015).
 *
 * Belege: schuetze-2018 (Kopf–Dependent), gallmann-2015-topologie (Umstell-/
 * Verschiebeprobe), lehmkuhle-2023 (operationale Proben), agel-2017 (Satzglieder
 * als funktionale Einheiten, Valenz/Rektion).
 *
 * Block-Typen (render.js): wissen · merke · satzbau · aufgaben · transfer.
 * Inline-Markup: **fett**, *kursiv*, [^n] (Fußnote → belege-Reihenfolge).
 */

const DaZ = {
  title: 'Feste Plätze im Satz',
  sub: 'DaZ / Sprachförderung · Wer tut was? – die Bauteile eines Satzes finden',
  belege: [],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Ein Satz hat Bauteile',
      paras: [
        'Jeder Satz hat **Bauteile**. Zwei sind besonders wichtig: das **Subjekt** (wer oder was etwas tut) und das **Prädikat** (was getan wird – das Verb).',
        'Mit **Fragen** findest du sie: „**Wer?**“ → Subjekt. „**Was tut** die Person?“ → Prädikat.',
      ],
    },
    { type: 'merke', text: 'Frag den Satz: **Wer?** → Subjekt. **Was tut** er? → Prädikat (das Verb).' },
    {
      type: 'satzbau', label: 'So sieht das aus',
      parts: [
        { text: 'Der Bäcker', rolle: 'Subjekt (wer?)' },
        { text: 'backt', rolle: 'Prädikat (was tut er?)' },
        { text: 'Brot', rolle: 'Objekt (was?)' },
      ],
      note: 'Das Prädikat ist das **Verb** – der Kern des Satzes.',
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Frage:', prompt: ' In „Das Kind malt ein Bild.“ – wer? und was tut es? Schreibe Subjekt und Prädikat auf.', fields: [{ label: 'Subjekt (wer?):', width: 150 }, { label: 'Prädikat (was tut?):', width: 150 }], erwartung: 'Subjekt: *Das Kind*. Prädikat: *malt*.' },
        {
          op: 'Markiere:', prompt: ' Markiere in jedem Satz das Subjekt (S) und das Prädikat (P).',
          extraHtml: '<div style="margin-top:4pt;font-size:12.5pt;line-height:2.1">Der Hund bellt laut.<br>Die Lehrerin liest ein Buch.<br>Mein Bruder spielt Fußball.</div>',
          erwartung: 'S/P: „Der Hund | bellt“ · „Die Lehrerin | liest“ · „Mein Bruder | spielt“.',
        },
        { op: 'Bilde:', prompt: ' Schreibe einen eigenen Satz mit Subjekt und Prädikat.', answerLines: 2, erwartung: 'individuell; muss ein Subjekt (wer/was) und ein Prädikat (Verb) enthalten, z. B. „Meine Freundin tanzt.“' },
      ],
    },
    { type: 'transfer', text: 'Öffne die **Kurs-Station ③** und markiere in den Sätzen, wer handelt (S) und was er tut (P).' },
  ],
}

const SekI = {
  title: 'Feste Plätze im Satz',
  sub: 'Sekundarstufe I · Satzglieder bestimmen – mit den grammatischen Proben',
  belege: ['gallmann-2015-topologie', 'lehmkuhle-2023'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Was sind Satzglieder?',
      paras: [
        'Ein Satz besteht aus **Satzgliedern** – den Bausteinen, aus denen er aufgebaut ist. Die wichtigsten sind **Subjekt** (S), **Prädikat** (P) und **Objekt** (O); dazu kommen **adverbiale Bestimmungen** (wann? wo? wie?).',
        'Das **Prädikat** ist das Verb und bildet den **Kern**: Es bestimmt, welche weiteren Satzglieder der Satz braucht.',
      ],
    },
    {
      type: 'satzbau', label: 'Satzglieder im Beispiel',
      parts: [
        { text: 'Der Trainer', rolle: 'Subjekt' },
        { text: 'lobt', rolle: 'Prädikat' },
        { text: 'die Mannschaft', rolle: 'Objekt' },
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Wie findet man Satzglieder? – die Proben',
      paras: [
        'Satzglieder erkennt man nicht am Gefühl, sondern mit **operationalen Proben**:[^2]',
        ' – **Frageprobe**: „Wer/was?“ → S · „Was tut/geschieht?“ → P · „Wen/was?“ → Akkusativobjekt.\n – **Umstellprobe**: Nur ein **ganzes** Satzglied lässt sich als Einheit ins **Vorfeld** schieben (vor das Verb).[^1]\n – **Ersatzprobe**: Ein Satzglied lässt sich durch **ein** Wort (z. B. ein Pronomen) ersetzen.[^2]',
      ],
    },
    { type: 'merke', text: 'Ein Satzglied lässt sich **als Ganzes** verschieben und durch **ein** Wort ersetzen.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Bestimme', prompt: ' in „Die Journalistin schreibt einen Artikel.“ alle Satzglieder mit S/P/O.', fields: [{ label: 'S:', width: 130 }, { label: 'P:', width: 80 }, { label: 'O:', width: 130 }], erwartung: 'S: *Die Journalistin* · P: *schreibt* · O: *einen Artikel*.' },
        { op: 'Umstellprobe:', prompt: ' Prüfe an „Der alte Mann fütterte gestern im Park die Tauben.“: Welche Wortgruppen sind Satzglieder? Schiebe sie einzeln ins Vorfeld.', answerLines: 2, erwartung: 'Satzglieder: „Der alte Mann“ (S), „gestern“ (adv. Zeit), „im Park“ (adv. Ort), „die Tauben“ (O) – alle als Ganzes verschiebbar. Eine Teilgruppe wie „alte Mann“ allein ist keins.' },
        { op: 'Satzbauplan:', prompt: ' Notiere den Satzbauplan (Reihenfolge der Satzglieder) von „Der Kellner bringt dem Gast die Rechnung.“', answerLines: 1, erwartung: 'S – P – Dativobjekt – Akkusativobjekt („Der Kellner | bringt | dem Gast | die Rechnung“).' },
        { op: 'Ersatzprobe:', prompt: ' Ersetze das Objekt in „Der Lehrer korrigiert die Klassenarbeiten.“ durch ein Pronomen.', fields: [{ label: '', width: 220 }], erwartung: '„Der Lehrer korrigiert *sie*.“ („die Klassenarbeiten“ → ein Wort „sie“ → Satzglied bestätigt.)' },
      ],
    },
    { type: 'transfer', text: 'Nimm einen Satz aus der **Kurs-Station ③** und überprüfe deine S/P/O-Bestimmung mit der Umstellprobe.' },
  ],
}

const SekII = {
  title: 'Wer hängt an wem?',
  sub: 'Sekundarstufe II · Valenz, Dependenz und der Slot, der den Partner bestimmt',
  belege: ['schuetze-2018', 'agel-2017'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Das Verb regiert',
      paras: [
        'Das **Verb** ist der **Kopf** des Satzes: Es „regiert“ seine Mitspieler, die **Dependenten**.[^1] Wie viele und welche Mitspieler ein Verb verlangt, ist seine **Valenz**.[^2]',
        'Man unterscheidet **Ergänzungen** (vom Verb *gefordert*, z. B. das Objekt bei „treffen“) und **Angaben** (frei hinzufügbar, z. B. „gestern“, „im Saal“).[^2]',
      ],
    },
    {
      type: 'satzbau', label: 'Kopf und Dependent',
      parts: [
        { text: 'Das Gremium', rolle: 'Subjekt · Ergänzung' },
        { text: 'trifft', rolle: 'Prädikat · Kopf' },
        { text: 'eine Entscheidung', rolle: 'Objekt · Dependent' },
      ],
      note: 'Der **Kopf** (Verb) regiert das **Objekt** (Dependent) – die Kante Kopf → Dependent macht die Abhängigkeit sichtbar.',
    },
    {
      type: 'wissen', label: 'Wissen · Der Slot bestimmt den Partner',
      paras: [
        'Ein Kollokations-Nomen sitzt in einem **Slot** – einer grammatischen Rolle. Der Slot bestimmt den typischen Verbpartner:',
        ' – **Objekt-Slot**: „eine Entscheidung *treffen* / *fällen*“.\n – **Subjekt-Slot**: „die Entscheidung *fällt* / *ergeht*“.',
        'Gleiches Wort, anderer Slot → anderer Partner. So verklammern sich Kollokation (①) und Satzstruktur (③).',
      ],
    },
    { type: 'merke', text: 'Kollokationen sind nicht nur Wortpaare – sie sitzen in grammatischen **Slots**.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Unterscheide', prompt: ' in „Der Vorstand beschließt heute im Saal den Haushalt.“ Ergänzungen und Angaben.', fields: [{ label: 'Ergänzungen:', width: 170 }, { label: 'Angaben:', width: 170 }], erwartung: 'Ergänzungen (vom Verb gefordert): *Der Vorstand* (Subjekt), *den Haushalt* (Akkusativobjekt). Angaben (frei): *heute*, *im Saal*.' },
        { op: 'Bestimme', prompt: ' Kopf und Dependent in „Die Ministerin trägt Verantwortung.“ – welches Wort regiert welches?[^1]', answerLines: 1, erwartung: 'Kopf = *trägt* (Verb); Dependent = *Verantwortung* (Akkusativobjekt). Das Verb regiert das Objekt.' },
        { op: 'Erkläre:', prompt: ' Warum verlangt „Entscheidung“ im Objekt-Slot andere Verben (*treffen*) als im Subjekt-Slot (*fällt*)?', answerLines: 2, erwartung: 'Der Slot ist die grammatische Rolle des Nomens. Im Objekt-Slot ist „Entscheidung“ Ziel einer Handlung (jemand *trifft* sie); im Subjekt-Slot ist sie der Handlungsträger (sie *fällt* selbst). Andere Rolle → andere typische Verben.' },
      ],
    },
    { type: 'transfer', text: 'Wähle ein eigenes Nomen, suche beide Slots (als Subjekt und als Objekt) und prüfe die typischen Verben an der **Kurs-Station ③**.' },
  ],
}

const LK = {
  title: 'Wer hängt an wem?',
  sub: 'Leistungskurs · Rektion, Ergänzungsklassen und die Grenzfälle der Objektbestimmung',
  belege: ['agel-2017', 'schuetze-2018'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Rektion – das Verb fordert den Kasus',
      paras: [
        'Ein Verb regiert nicht nur, *dass* es eine Ergänzung gibt, sondern auch deren **Kasus** – das nennt man **Rektion**: *gedenken* + **Genitiv**, *helfen* + **Dativ**, *sehen* + **Akkusativ**.[^1] Die Kasusforderung ist Teil der **Valenz** des Verbs.[^1]',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Ergänzungsklassen und Grenzfälle',
      paras: [
        'Ergänzungen treten in **Klassen** auf: Akkusativ-, Dativ-, Genitiv- und Präpositionalobjekt. Zwei **Grenzfälle** sind keine Objekte, obwohl ein Nomen dem Verb folgt:[^2]',
        ' – **Prädikativ** (bei den Kopulaverben *sein / werden / bleiben*): „Er ist *ein guter Lehrer*.“ – eine Gleichsetzung, kein Objekt.\n – **Genitivattribut**: „das Urteil *des Gerichts*“ – hängt am **Nomen**, nicht am Verb.',
      ],
    },
    {
      type: 'satzbau', label: 'Grenzfall Prädikativ',
      parts: [
        { text: 'Er', rolle: 'Subjekt' },
        { text: 'ist', rolle: 'Kopulaverb' },
        { text: 'ein guter Lehrer', rolle: 'Prädikativ · kein Objekt' },
      ],
      note: 'Test: nach *sein / werden / bleiben* steht ein **Prädikativ**, kein Objekt. Gegenprobe: „Er sieht *einen guten Lehrer*.“ → echtes Akkusativobjekt.',
    },
    { type: 'merke', text: 'Nicht jedes Nomen nach dem Verb ist ein Objekt – **Prädikative** und **Attribute** gehorchen anderen Regeln.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Rektion:', prompt: ' Welchen Kasus fordert das Verb? *helfen* · *gedenken* · *unterstützen* · *bedürfen*.', answerLines: 1, erwartung: '*helfen* + Dativ · *gedenken* + Genitiv · *unterstützen* + Akkusativ · *bedürfen* + Genitiv.' },
        { op: 'Prädikativ oder Objekt?', prompt: ' Bestimme das kursive Satzglied und begründe mit dem Kopulaverb-Test: (a) „Sie wird *Ärztin*.“ (b) „Sie sucht *eine Ärztin*.“', answerLines: 2, erwartung: '(a) *Prädikativ* (Kopulaverb „wird“ → Gleichsetzung, kein Objekt). (b) *Akkusativobjekt* („suchen“ ist Vollverb, regiert Akkusativ). Prädikativ nur nach sein/werden/bleiben.' },
        { op: 'Valenzprobe:', prompt: ' Reduziere „Der Angeklagte gestand dem Richter gestern unter Tränen die Tat.“ auf Verb + Ergänzungen (Angaben weglassen).', answerLines: 2, erwartung: 'Verb *gestand* + Ergänzungen: *Der Angeklagte* (S), *dem Richter* (Dativobjekt), *die Tat* (Akkusativobjekt). Angaben *gestern*, *unter Tränen* fallen weg.' },
      ],
    },
    { type: 'transfer', text: 'Suche ein Verb mit ungewöhnlicher Rektion (z. B. Genitiv) und prüfe an der **Kurs-Station ③**, wie sein Objekt im Satz sitzt.' },
  ],
}

export const worksheet3 = {
  stationNo: 3,
  title: 'Wer hängt an wem?',
  levels: { DaZ, SekI, SekII, LK },
}

export default worksheet3
