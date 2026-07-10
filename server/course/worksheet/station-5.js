/**
 * server/course/worksheet/station-5.js
 *
 * Content-Modell des begleitenden Arbeitsblatts zu Station ⑤ „Belegen statt raten"
 * (Mini-Recherche). Begleitet die digitale Station (Fachwissen + eigene Aufgaben),
 * dupliziert sie nicht.
 * Quelle: planning/Kurs-Station-5-Recherche.md, planning/Kurs-Konzept-Progression.md.
 *
 * Owner (Konzept-Progression §2): ⑤ besitzt den Forschungszyklus (Hypothese →
 * Beleg-Prüfung → Befund-Deutung → begründete Stellungnahme) sowie Validität,
 * Geltungsbereich und Generalisierung. logDice/Korpus-Bias (④) werden hier nur
 * angewendet, nicht neu erklärt.
 *
 * Belege: luedeling-walter-2009 (Korpus für Hypothesentests), bubenhofer-2015
 * (korpusbasiert vs. datengeleitet, Korpusabhängigkeit), korpus-pipeline-schnupper.
 *
 * Block-Typen (render.js): wissen · merke · pipeline (Forschungszyklus) ·
 * aufgaben · transfer. Inline-Markup: **fett**, *kursiv*, [^n] (Fußnote).
 */

const DaZ = {
  title: 'Belegen statt raten',
  sub: 'DaZ / Sprachförderung · Eine Vermutung am Korpus überprüfen',
  belege: ['korpus-pipeline-schnupper'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Vermuten und prüfen',
      paras: [
        'Statt zu **raten**, kannst du eine Sprach-Frage **überprüfen**. Zuerst hast du eine **Vermutung** („Ich glaube, man sagt …"). Dann suchst du im **Korpus** nach **Belegen** und schaust nach.[^1]',
      ],
    },
    { type: 'merke', text: 'Erst eine **Vermutung** – dann im Korpus **nachsehen**.' },
    {
      type: 'pipeline', label: 'So gehst du vor',
      steps: [
        { name: 'Vermutung', sub: 'Was glaubst du?' },
        { name: 'Prüfen', sub: 'im Korpus suchen' },
        { name: 'Antwort', sub: 'stimmt es?' },
      ],
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Vermute:', prompt: ' Sagt man „eine Frage stellen" oder „eine Frage machen"? Kreuze deine Vermutung an.', chips: ['eine Frage stellen', 'eine Frage machen'], answerLines: 0, erwartung: '„eine Frage *stellen*" ist üblich; „eine Frage machen" sagt man nicht.' },
        {
          op: 'Prüfe:', prompt: ' Schau die zwei Belege an. Welches Verb steht bei „Frage"?',
          extraHtml: '<div style="margin-top:5pt;font-size:12.5pt;line-height:1.9;font-family:\'Gentium Plus\',serif">1.&nbsp; Der Reporter durfte eine Frage <b>stellen</b>.<br>2.&nbsp; Sie hat eine wichtige Frage <b>gestellt</b>.</div>',
          fields: [{ label: 'Verb:', width: 120 }],
          erwartung: '„stellen" – die Belege bestätigen die Vermutung.',
        },
        { op: 'Sag:', prompt: ' War deine Vermutung richtig? Schreibe einen Satz.', answerLines: 1, erwartung: 'individuell; z. B. „Ja, die Belege zeigen ‚Frage stellen\'."' },
      ],
    },
    { type: 'transfer', text: 'Öffne die **Kurs-Station ⑤** und prüfe deine eigene Vermutung.' },
  ],
}

const SekI = {
  title: 'Belegen statt raten',
  sub: 'Sekundarstufe I · Eine Vermutung aufstellen, am Korpus prüfen und den Befund festhalten',
  belege: ['luedeling-walter-2009'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Der Weg zum Befund',
      paras: [
        'Sprachwissen muss man nicht **raten** – man kann es **belegen**. Der Weg: Du stellst eine **Vermutung** auf, prüfst sie an echten **Belegen** im **Korpus** und hältst das Ergebnis als **Befund** fest.[^1]',
      ],
    },
    {
      type: 'pipeline', label: 'Der Weg',
      steps: [
        { name: 'Vermutung', sub: 'was ist typisch?' },
        { name: 'Prüfen', sub: 'Belege suchen' },
        { name: 'Befund', sub: 'was zeigt sich?' },
        { name: 'Deuten', sub: 'stimmt die Vermutung?' },
      ],
    },
    { type: 'merke', text: 'Ein **Befund** ist, was die Belege zeigen – nicht, was du vorher geglaubt hast.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Vermute:', prompt: ' Welches Verb passt typisch zu „Verantwortung"? Notiere deine Vermutung, bevor du prüfst.', fields: [{ label: 'Meine Vermutung:', width: 180 }], erwartung: 'z. B. „Verantwortung *übernehmen* / *tragen*".' },
        {
          op: 'Prüfe:', prompt: ' Welches Verb steht am häufigsten bei „Verantwortung"?',
          extraHtml: '<div style="margin-top:5pt;font-size:11.5pt;line-height:1.9;font-family:\'Gentium Plus\',serif">… die Firma muss die <b>Verantwortung übernehmen</b>.<br>… er will die <b>Verantwortung</b> nicht <b>tragen</b>.<br>… sie hat die volle <b>Verantwortung übernommen</b>.</div>',
          fields: [{ label: 'Häufigstes Verb:', width: 160 }],
          erwartung: '„übernehmen" (auch „tragen") – die typischen Partner von „Verantwortung".',
        },
        { op: 'Halte fest:', prompt: ' Schreibe deinen Befund in einem Satz: Was zeigen die Belege – und stimmt deine Vermutung?', answerLines: 2, erwartung: 'z. B. „Die Belege zeigen ‚Verantwortung übernehmen/tragen\'; meine Vermutung stimmt (teilweise)."' },
      ],
    },
    { type: 'transfer', text: 'Stelle in der **Kurs-Station ⑤** eine eigene Vermutung auf und prüfe sie.' },
  ],
}

const SekII = {
  title: 'Eine Frage an die Sprache',
  sub: 'Sekundarstufe II · Eine Hypothese am Korpus prüfen und begründet Stellung nehmen',
  belege: ['luedeling-walter-2009', 'bubenhofer-2015'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Vom Raten zum belegten Urteil',
      paras: [
        'Ein Sprachurteil wird tragfähig, wenn es **belegt** ist. Der Forschungszyklus: eine **Hypothese** formulieren (präzise, prüfbar), am **Korpus** prüfen (Frequenz + Assoziationsmaß), den **Befund** deuten und **begründet Stellung** nehmen – auch dann, wenn der Befund der Hypothese widerspricht.[^1]',
      ],
    },
    {
      type: 'pipeline', label: 'Der Forschungszyklus',
      steps: [
        { name: 'Hypothese', sub: 'prüfbar formuliert' },
        { name: 'Prüfen', sub: 'Korpus: f + logDice' },
        { name: 'Befund', sub: 'die Datenlage' },
        { name: 'Deuten', sub: 'Abgleich m. Hypothese' },
        { name: 'Stellungnahme', sub: 'begründet' },
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Wenn der Befund überrascht',
      paras: [
        'Ein guter Befund kann die eigene **Hypothese widerlegen** – das ist kein Fehler, sondern Erkenntnis. Entscheidend ist, die **Abweichung zu erklären**: Liegt es an der Sprache, oder am **Korpus** (z. B. eine Textsorte, die die Verbindung überrepräsentiert)?[^2]',
      ],
    },
    { type: 'merke', text: 'Ein Befund zählt mehr als eine Meinung – aber nur, wenn man ihn **deutet**.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Formuliere', prompt: ' eine **prüfbare** Hypothese zu einem Nomen deiner Wahl (Muster: „Der typischste Partner von X ist Y").', fields: [{ label: 'Hypothese:', width: 230 }], erwartung: 'z. B. „Der typischste Partner von ‚Maßnahme\' ist ‚ergreifen\'." – prüfbar (am Korpus überprüfbar), nicht „X klingt schön".' },
        { op: 'Deute:', prompt: ' Angenommen, das Korpus zeigt einen *anderen* Partner als vermutet. Nenne zwei mögliche Erklärungen.', answerLines: 2, erwartung: '(1) Die Vermutung war falsch – die Sprache ist tatsächlich anders. (2) Der Befund ist korpus-abhängig (Bias – eine Textsorte prägt ihn). Beide Deutungen sind zu unterscheiden.' },
        { op: 'Nimm Stellung:', prompt: ' Schreibe eine kurze begründete Stellungnahme (3–4 Sätze): Hypothese – Befund – Deutung.', answerLines: 3, erwartung: 'enthält Hypothese, Befund (mit Zahl/Beleg), Abgleich (bestätigt/widerlegt) und Begründung. Bewertet wird die Struktur des Arguments, nicht ein „richtiges" Ergebnis.' },
      ],
    },
    { type: 'transfer', text: 'Führe in der **Kurs-Station ⑤** einen eigenen Mini-Recherche-Zyklus durch.' },
  ],
}

const LK = {
  title: 'Eine Frage an die Sprache',
  sub: 'Leistungskurs · Aussagekraft, Geltungsbereich und Grenzen eines Korpusbefundes',
  belege: ['luedeling-walter-2009', 'bubenhofer-2015'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Wie belastbar ist ein Befund?',
      paras: [
        'Ein Korpusbefund ist kein absolutes Urteil, sondern gilt in einem **Geltungsbereich**. Seine **Validität** hängt ab von der **Repräsentativität** des Korpus (welche Textsorten?), der **Frequenz** der Verbindung (zu selten = statistisch nicht belastbar) und der **Korpusabhängigkeit** des Befundes.[^1][^2]',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Vom Befund zur Verallgemeinerung',
      paras: [
        'Ob man von „im Korpus" auf „im Deutschen allgemein" schließen darf, ist eine **Generalisierung** – und sie ist nur so gut wie das Korpus. Beispiel: „Diskussion eröffnen" ist in einem parlamentarisch geprägten Korpus sehr stark, in der Alltagssprache aber selten. Der Befund gilt – aber nicht überall gleich.[^2]',
      ],
    },
    { type: 'merke', text: 'Ein Befund gilt in seinem **Geltungsbereich** – Verallgemeinerung ist eine eigene, begründungspflichtige Behauptung.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Beurteile:', prompt: ' Eine Verbindung kommt im Korpus nur 8-mal vor, hat aber einen hohen logDice. Wie belastbar ist der Befund? Begründe.', answerLines: 2, erwartung: 'Eingeschränkt: Der hohe logDice zeigt Exklusivität, aber bei nur 8 Vorkommen ist die statistische Belastbarkeit gering (Zufall möglich). Für ein tragfähiges Urteil braucht es ein größeres/breiteres Korpus.' },
        { op: 'Geltungsbereich:', prompt: ' „Diskussion eröffnen" ist im Korpus sehr stark. Warum darf man daraus nicht ohne Weiteres „typisch im Deutschen" folgern?', answerLines: 2, erwartung: 'Das Korpus ist parlamentarisch/publizistisch geprägt (Bias); „Diskussion eröffnen" ist dort überrepräsentiert und in Alltagssprache/anderer Textsorte seltener. Eine Generalisierung bräuchte ein ausgewogeneres Korpus.' },
        { op: 'Stellungnahme:', prompt: ' Verfasse eine wissenschaftlich vorsichtige, materialgestützte Stellungnahme: Befund + Geltungsbereich + Grenze.', answerLines: 3, erwartung: 'nennt den Befund mit Zahl/Beleg, schränkt den Geltungsbereich ein (Korpus/Textsorte), benennt die Grenze (Frequenz/Bias) und vermeidet unzulässige Verallgemeinerung.' },
      ],
    },
    { type: 'transfer', text: 'Formuliere in der **Kurs-Station ⑤** einen eigenen Befund samt seiner Grenzen.' },
  ],
}

export const worksheet5 = {
  stationNo: 5,
  title: 'Eine Frage an die Sprache',
  levels: { DaZ, SekI, SekII, LK },
}

export default worksheet5
