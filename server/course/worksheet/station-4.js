/**
 * server/course/worksheet/station-4.js
 *
 * Content-Modell des begleitenden Arbeitsblatts zu Station ④ „Texte, die zählen“
 * (Korpus verstehen). Begleitet die digitale Station (Fachwissen + eigene
 * Aufgaben), dupliziert sie nicht.
 * Quelle: planning/Kurs-Station-4-Korpus.md, planning/Kurs-Konzept-Progression.md.
 *
 * Owner (Konzept-Progression §2): ④ besitzt die logDice-**Mechanik** (Kookkurrenz,
 * Formel, Skala 14) sowie die Korpus-Grundbegriffe (Beleg, Konkordanz, Textsorte,
 * Lemmatisierung, POS/Annotation) und die Methodenkritik (Korpus-Bias,
 * Repräsentativität, Annotationsfehler). Hier erst wird die Formel entfaltet –
 * ①–③ nutzen logDice nur als Black Box. Die Pipeline verklammert ② (Wortart) und
 * ③ (Dependenz): sie bestimmen, WAS gezählt wird.
 *
 * Belege: korpus-pipeline(-schnupper) (eigene Pipeline), luedeling-walter-2009,
 * bubenhofer-2015, steyer-2000.
 *
 * Block-Typen (render.js): wissen · merke · pipeline · datablick · aufgaben ·
 * transfer. Inline-Markup: **fett**, *kursiv*, [^n] (Fußnote → belege-Reihenfolge).
 */

const DaZ = {
  title: 'Texte, die zählen',
  sub: 'DaZ / Sprachförderung · Was ein Korpus ist – und wie der Computer darin sucht',
  belege: ['korpus-pipeline-schnupper'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Was ist ein Korpus?',
      paras: [
        'Ein **Korpus** ist eine sehr große Sammlung von **echten Texten** – aus Zeitungen, Büchern und Reden.[^1] Ein Computer sucht darin, welche Wörter oft **zusammen** vorkommen.',
        'Ein einzelnes Beispiel aus dem Korpus heißt **Beleg** – ein echter Satz, in dem das Wort steht.',
      ],
    },
    { type: 'merke', text: 'Ein **Korpus** ist eine große Sammlung echter Texte. Ein **Beleg** ist ein Beispielsatz daraus.' },
    {
      type: 'pipeline', label: 'So sucht der Computer',
      steps: [
        { name: 'Viele Texte', sub: 'das Korpus' },
        { name: 'Grundform', sub: 'ging → gehen' },
        { name: 'Zählen', sub: 'was kommt zusammen vor?' },
      ],
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Grundform:', prompt: ' Schreibe die Grundform auf.', fields: [{ label: 'lief / gelaufen →', width: 120 }, { label: 'Häuser →', width: 120 }], erwartung: '„lief / gelaufen“ → *laufen*. „Häuser“ → *Haus*.' },
        {
          op: 'Suche:', prompt: ' Welches Wort steht in *beiden* Sätzen? Schreibe es auf – genau solche Wörter, die immer wieder vorkommen, sucht der Computer.',
          extraHtml: '<div style="margin-top:5pt;font-size:12.5pt;line-height:1.9">1.&nbsp; Das Parlament muss eine Entscheidung treffen.<br>2.&nbsp; Am Ende hat er diese Entscheidung getroffen.</div>',
          fields: [{ label: 'Gemeinsames Wort:', width: 170 }],
          erwartung: '„Entscheidung“ – der Computer sucht genau solche wiederkehrenden Wörter. (Und „treffen/getroffen“ haben dieselbe *Grundform* – so erkennt er sie als dasselbe Wort.)',
        },
        { op: 'Sammle:', prompt: ' Woraus besteht ein Korpus? Nenne zwei Textsorten (wo Texte herkommen).', answerLines: 1, erwartung: 'z. B. Zeitung, Buch, Rede, Roman, Nachrichten.' },
      ],
    },
    { type: 'transfer', text: 'Öffne die **Kurs-Station ④** und finde in den Belegen das gesuchte Wort.' },
  ],
}

const SekI = {
  title: 'Texte, die zählen',
  sub: 'Sekundarstufe I · Wie ein Korpus arbeitet – Textsorten, Konkordanz, Annotation',
  belege: ['korpus-pipeline-schnupper', 'luedeling-walter-2009'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Was ist ein Korpus?',
      paras: [
        'Ein **Korpus** ist eine große, systematische Sammlung echter Texte aus verschiedenen **Textsorten** (Zeitung, Rede, Roman …).[^1] Der Computer durchsucht es und **zählt**, welche Wörter oft zusammen vorkommen (**Kookkurrenz**).',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Erst aufbereiten, dann zählen',
      paras: [
        'Bevor gezählt wird, bereitet die **Maschine** die Texte auf: Sie bestimmt die **Grundform** (Lemma) und die **Wortart** jedes Wortes. Diese automatische **Annotation** ist nützlich – aber nicht fehlerfrei.[^2]',
      ],
    },
    {
      type: 'pipeline', label: 'Die Schritte',
      steps: [
        { name: 'Text', sub: 'aus dem Korpus' },
        { name: 'Grundform', sub: 'Lemma' },
        { name: 'Wortart', sub: 'wie in ②' },
        { name: 'Zählen', sub: 'Kookkurrenz' },
      ],
    },
    { type: 'merke', text: 'Ein Korpus **zählt**, was in echten Texten üblich ist – ein Mensch muss die Zahlen **deuten**.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Textsorten:', prompt: ' Nenne drei Textsorten, die in einem Korpus stecken können.', answerLines: 1, erwartung: 'z. B. Zeitungsartikel, politische Rede, Roman, Nachrichten, Blog, Gesetzestext.' },
        {
          op: 'Konkordanz:', prompt: ' Welches Verb steht in allen drei Belegen neben „Entscheidung“? Kreise es ein.',
          extraHtml: '<div style="margin-top:5pt;font-size:11.5pt;line-height:1.9;font-family:\'Gentium Plus\',serif">… musste eine wichtige <b>Entscheidung treffen</b>.<br>… will die <b>Entscheidung</b> erst morgen <b>treffen</b>.<br>… hat eine mutige <b>Entscheidung</b> ge<b>troffen</b>.</div>',
          erwartung: '„treffen“ – die typische Verbindung „Entscheidung treffen“.',
        },
        { op: 'Annotation prüfen:', prompt: ' Die Maschine hat eine Wortart falsch bestimmt. Finde den Fehler: „Die (Artikel) Kinder (Nomen) laufen (Nomen) schnell (Adjektiv).“', answerLines: 1, erwartung: '„laufen“ ist ein *Verb*, kein Nomen. Auch die Maschine irrt sich – ein Annotationsfehler.' },
      ],
    },
    { type: 'transfer', text: 'Sieh dir in der **Kurs-Station ④** eine Konkordanz an und finde das wiederkehrende Muster.' },
  ],
}

const SekII = {
  title: 'Was Häufigkeit verschweigt',
  sub: 'Sekundarstufe II · Von der Kookkurrenz zum Assoziationsmaß – und die Grenzen des Korpus',
  belege: ['bubenhofer-2015', 'steyer-2000', 'korpus-pipeline'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Frequenz und Assoziationsmaß',
      paras: [
        'Die rohe **Frequenz** zählt nur, *wie oft* zwei Wörter zusammen vorkommen. Ein **Assoziationsmaß** wie **logDice** misst, *wie exklusiv* sie aneinander gebunden sind: Es verrechnet das gemeinsame Vorkommen mit dem Einzelvorkommen jedes Wortes.[^1][^2]',
      ],
    },
    {
      type: 'pipeline', label: 'Die Pipeline hinter der Zahl',
      steps: [
        { name: 'Rohtext', sub: 'freie Korpora' },
        { name: 'Grundform', sub: 'Lemma' },
        { name: 'Wortart', sub: 'wie in ②' },
        { name: 'Abhängigkeit', sub: 'Dependenz ③' },
        { name: 'Kookkurrenz', sub: 'zählen' },
        { name: 'logDice', sub: 'Assoziationsmaß' },
      ],
      note: 'Die **Wortart** (②) und die **Abhängigkeit** (③) bestimmen, *was* überhaupt gezählt wird – so hängt ④ an ② und ③.[^3]',
    },
    {
      type: 'datablick', label: 'Datenblick · dieselben Zahlen wie in ①',
      caption: 'Adjektiv-Partner von „Fehler“ – hier verstehst du, wie sie zustande kommen.',
      rows: [
        { verb: 'schwerer Fehler', frequency: '1 177', logDice: '8,47', mark: true },
        { verb: 'großer Fehler', frequency: '2 047', logDice: '6,49', mark: true },
      ],
      note: '„großer Fehler“ ist **häufiger**, „schwerer Fehler“ hat den höheren **logDice** – die Zahl trennt *häufig* von *typisch*.',
    },
    {
      type: 'wissen', label: 'Wissen · Der blinde Fleck: Korpus-Bias',
      paras: [
        'Ein Korpus ist immer ein **Ausschnitt**. Was als „typisch“ erscheint, hängt von den enthaltenen Texten ab (**Korpus-Bias**): Ein parlamentarisch geprägtes Korpus zeigt andere Verbindungen als ein Roman-Korpus. Dazu kommen **Annotationsfehler** der Maschine.',
      ],
    },
    { type: 'merke', text: 'Die Zahl misst Bindung, nicht Bedeutung – und sie kennt nur die Texte, die im Korpus stehen.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Erkläre', prompt: ' am Datenblick, warum die *häufigere* Verbindung („großer Fehler“) nicht die *typischere* ist.', answerLines: 2, erwartung: 'logDice misst Exklusivität, nicht Rohhäufigkeit. „groß“ passt zu fast jedem Nomen (unspezifisch → niedriger logDice); „schwer“ bindet spezifisch an „Fehler“ (höherer logDice). Häufig ≠ typisch.' },
        { op: 'Ordne', prompt: ' die Pipeline-Schritte in die richtige Reihenfolge: *Kookkurrenz zählen · Grundform · Wortart · Rohtext · logDice*.', answerLines: 1, erwartung: 'Rohtext → Grundform → Wortart → Kookkurrenz zählen → logDice.' },
        { op: 'Korpus-Bias:', prompt: ' Unser Korpus ist stark parlamentarisch/publizistisch geprägt. Nenne eine Verbindung, die dadurch überrepräsentiert sein könnte.', answerLines: 2, erwartung: 'z. B. „Debatte führen“, „Antrag stellen“, „Diskussion eröffnen“, „Maßnahme ergreifen“ – politisch/medial geprägte Kollokationen erscheinen dort typischer als in der Alltagssprache.' },
      ],
    },
    { type: 'transfer', text: 'Vergleiche in der **Kurs-Station ④** Frequenz und logDice einer Verbindung – wo fallen sie auseinander?' },
  ],
}

const LK = {
  title: 'Was Häufigkeit verschweigt',
  sub: 'Leistungskurs · Die logDice-Formel deuten und ihre Grenzen kennen',
  belege: ['bubenhofer-2015', 'luedeling-walter-2009'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Die logDice-Formel',
      paras: [
        'logDice quantifiziert die **Exklusivität** der Bindung:[^1]',
        '**logDice = 14 + log₂( 2 · f(A,B) / ( f(A) + f(B) ) )**',
        'Der Zähler ist das gemeinsame Vorkommen f(A,B) (mal 2), der Nenner die Summe der Einzelvorkommen f(A)+f(B). Je exklusiver A mit B auftritt, desto näher an **14** (dem theoretischen Maximum). Der **Logarithmus** staucht große Verhältnisse, sodass die Skala vergleichbar bleibt.',
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Was die Zahl nicht sagt',
      paras: [
        'logDice sagt **nichts** über Bedeutung oder Stilwert, nichts über Angemessenheit und nichts über **Korpus-Bias**. Dazu kommen **Annotationsfehler**: Bei **Homonymen** – „die *Bank*“ (Sitzbank vs. Geldinstitut) – kann die Maschine Wortart oder Abhängigkeit verwechseln und die Zählung verfälschen.[^2]',
      ],
    },
    { type: 'merke', text: 'logDice ist ein Maß für **Exklusivität** – kein Urteil über Bedeutung.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Formel deuten:', prompt: ' Erkläre am Term, warum eine *seltene*, aber exklusive Verbindung einen höheren logDice bekommt als eine *häufige*, aber beliebige.[^1]', answerLines: 2, erwartung: 'Entscheidend ist das Verhältnis f(A,B) zu f(A)+f(B). Kommt A fast nur mit B vor, ist der Bruch groß → hoher logDice, auch bei kleiner Rohfrequenz. Ein häufiges, aber beliebig kombinierbares Wort verteilt sich auf viele Partner → kleiner Bruch → niedriger logDice.' },
        { op: 'Homonym:', prompt: ' „Die Bank“ kann zwei Dinge bedeuten. Erkläre, wie daraus ein Annotationsfehler entstehen kann.', answerLines: 2, erwartung: 'Die Wortform „Bank“ ist mehrdeutig (Homonym). Das automatische Tagging/Parsing entscheidet aus dem Kontext; bei unklarem Kontext ordnet es die falsche Lesart oder Abhängigkeit zu – und die Kookkurrenzzählung wird verfälscht.' },
        { op: 'Validität:', prompt: ' Nenne zwei Bedingungen, unter denen ein Korpusbefund *nicht* verallgemeinerbar ist.', answerLines: 2, erwartung: 'z. B. (1) zu kleines/zu einseitiges Korpus (Bias – nur eine Textsorte); (2) zu geringe Frequenz der Verbindung (statistisch nicht belastbar). → weiter in Station ⑤.' },
      ],
    },
    { type: 'transfer', text: 'Formuliere eine Frage an das Korpus, die man mit logDice allein *nicht* beantworten kann – und begründe (Brücke zu **Station ⑤**).' },
  ],
}

export const worksheet4 = {
  stationNo: 4,
  title: 'Was Häufigkeit verschweigt',
  levels: { DaZ, SekI, SekII, LK },
}

export default worksheet4
