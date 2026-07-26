/**
 * server/course/worksheet/station-1.js
 *
 * Content-Modell des NEUEN Arbeitsblatts zu Station ① „Wortpartner & Kollokationen“.
 * Begleitet die digitale Station (Fachwissen + eigene Aufgaben), dupliziert sie nicht.
 * Quelle/Begründung: planning/Kurs-AB-Station-1-Inhalt.md, planning/Kurs-Konzept-Progression.md.
 * Fachlich belegt (aus den PDFs, 2026-07-03): Hausmann 2004 (Basis/Kollokator),
 * Steyer 2000, Bubenhofer 2015, Löbner 2003 (Konnotation), Hanks 2011 (sem. Prosodie).
 *
 * Block-Typen (render.js): wissen · merke · skala (kontinuum|faerbung) · kontrast ·
 * datablick · aufgaben · transfer. Inline-Markup: **fett**, *kursiv*, [^n] (Fußnote).
 * Fußnoten = `belege` (Keys → literatur.js), in Reihenfolge nummeriert.
 *
 * Aufbaulogik (Konzept-Progression §3): logDice-Mechanik/Formel gehört Station ④;
 * hier nur Black Box + Vorverweis. Ausnahme LK: darf Frequenz/logDice nutzen.
 */

const DaZ = {
  title: 'Wörter, die zusammenpassen',
  sub: 'DaZ / Sprachförderung · Feste Wort-Paare erkennen und selbst nutzen',
  belege: ['reder-2006'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Wörter haben feste Freunde',
      paras: [
        'Viele Wörter haben **feste Freunde**. Man sagt „Zähne *putzen*“ – nicht „Zähne waschen“. Man sagt „einen Fehler *machen*“ – nicht „einen Fehler tun“.',
        'Solche festen Wort-Paare lernst du **als Ganzes**, nicht Wort für Wort. In deiner Sprache sind die Partner oft andere.[^1]',
      ],
    },
    { type: 'merke', text: 'Wörter haben feste Freunde – lerne das **Paar**, nicht nur das Wort.' },
    {
      type: 'kontrast', label: 'So sagt man es · und so nicht',
      rows: [
        { ok: 'Zähne putzen', no: 'Zähne waschen' },
        { ok: 'Musik hören', no: 'Musik machen', noNote: '(= etwas anderes)' },
        { ok: 'einen Fehler machen', no: 'einen Fehler tun' },
      ],
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Sammle:', prompt: ' Schreibe drei Wort-Paare mit *machen* auf. Beispiel: „Hausaufgaben machen“.', answerLines: 2, erwartung: 'z. B. Hausaufgaben / einen Termin / ein Foto / Sport / einen Fehler machen (Verb *machen* als Kollokator).' },
        { op: 'Meine Sprache:', prompt: ' Nenne ein Wort-Paar aus deiner Sprache und schreibe den deutschen Partner daneben.[^1]', answerLines: 2, erwartung: 'individuell; entscheidend ist, dass der deutsche Partner ein *anderer* ist als in der Erstsprache (z. B. engl. „to be hungry“ → dt. „Hunger *haben*“).' },
        {
          op: 'Sprich & prüfe:', prompt: ' Sag die Paare laut. Welches klingt „richtig“? Markiere es.',
          extraHtml: '<div style="margin-top:4pt;font-size:12pt">Musik <span class="term">hören</span> &nbsp;/&nbsp; Musik <span class="term">sehen</span> &nbsp;&nbsp;·&nbsp;&nbsp; einen Fehler <span class="term">machen</span> &nbsp;/&nbsp; einen Fehler <span class="term">tun</span></div>',
          erwartung: 'Musik *hören*; einen Fehler *machen* (nicht: „sehen“ / „tun“).',
        },
      ],
    },
    { type: 'transfer', text: 'Öffne die **Kurs-Station ①** und ordne die Paare zu. Findest du dort ein neues Paar, das du hier ergänzen kannst?' },
  ],
}

const SekI = {
  title: 'Wortpartner & Kollokationen',
  ipa: 'kɔlokaˈt͡si̯oːn',
  sub: 'Sekundarstufe I · Typische Wortpartner erkennen, ordnen und selbst bilden',
  belege: ['hausmann-wortverbindungen', 'steyer-2000', 'bildung-rp-kollokationen'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Was ist eine Kollokation?',
      paras: [
        'Wörter treten in **typischen Partnerschaften** auf. Eine solche übliche Wortverbindung heißt **Kollokation**. Sie besteht aus einer **Basis** – dem Wort, um das es geht (z. B. *Entscheidung*) – und einem **Kollokator**, dem typischen Partner (z. B. *treffen*).[^1]',
        '„Typisch“ heißt nicht *grammatisch richtig oder falsch*, sondern **üblich**: „eine Entscheidung *treffen*“ ist üblich; „eine Entscheidung *machen*“ versteht man zwar – aber man sagt es im Deutschen normalerweise nicht.[^2]',
      ],
    },
    { type: 'merke', text: 'Typisch heißt nicht richtig oder falsch, sondern **üblich**.' },
    {
      type: 'skala', variant: 'kontinuum', label: 'Wissen · Wie fest ist eine Verbindung?', axis: ['frei', 'fest'],
      stops: [
        { stufe: 'frei', bsp: 'rotes Auto', erkl: 'beliebig kombinierbar – kein festes Muster.' },
        { stufe: 'Kollokation', bsp: 'schwerer Fehler', erkl: 'üblich, aber noch durchschaubar.' },
        { stufe: 'Idiom', bsp: 'ins Gras beißen', erkl: 'fest & bildlich – nicht wörtlich zu verstehen.' },
      ],
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Bestimme', prompt: ' in „eine schwere Entscheidung treffen“ die **Basis** und den **Kollokator**.[^1]', fields: [{ label: 'Basis:' }, { label: 'Kollokator:' }], erwartung: 'Basis: *Entscheidung* (das Bezugswort). Kollokator: *treffen* (der typische Partner). „schwere“ ist ein zusätzliches Attribut, nicht der Kollokator.' },
        { op: 'Ordne', prompt: ' die drei Verbindungen in die Skala *frei – Kollokation – Idiom* ein.', chips: ['grünes Haus', 'Verantwortung übernehmen', 'den Löffel abgeben'], answerLines: 1, erwartung: 'grünes Haus = *frei* · Verantwortung übernehmen = *Kollokation* · den Löffel abgeben = *Idiom*.' },
        { op: 'Finde', prompt: ' zu *Fehler* und zu *Frage* je zwei typische Verben.[^3]', fields: [{ label: 'Fehler:', width: 180 }, { label: 'Frage:', width: 184 }], erwartung: 'Fehler: *machen*, *begehen* (auch: unterlaufen, korrigieren). Frage: *stellen*, *beantworten* (auch: aufwerfen, klären).' },
        { op: 'Begründe:', prompt: ' Warum sagt man „Hilfe *leisten*“, aber nicht „Hilfe *tun*“? Erkläre in einem Satz mit dem Wort *üblich*.', answerLines: 2, erwartung: '„Hilfe *leisten*“ ist die *übliche* (usuelle) Verbindung; „Hilfe tun“ wird im Deutschen nicht verwendet – nicht unverständlich, aber unüblich.' },
      ],
    },
    { type: 'transfer', text: 'Nimm eines **deiner** Nomen aus Aufgabe 3 und prüfe in der **Kurs-Station ①**, ob deine Partner dort auch als typisch auftauchen.' },
  ],
}

const SekII = {
  title: 'Wortpartner & Kollokationen',
  ipa: 'kɔlokaˈt͡si̯oːn',
  sub: 'Sekundarstufe II · Häufig ist nicht typisch – Typikalität begründen',
  belege: ['reder-2006', 'steyer-2000', 'bubenhofer-2015', 'loebner-semantik'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Frequenz und Assoziationsstärke',
      paras: [
        'Eine Kollokation ist eine **usuelle** (übliche) Wortverbindung – abzugrenzen von der freien Kombination und vom Idiom.[^1] Ob zwei Wörter typisch zusammengehören, lässt sich am **Korpus** messen. Dabei sind **zwei** Größen zu trennen:',
        ' – **Frequenz**: *wie oft* eine Verbindung vorkommt.\n – **Assoziationsstärke** (logDice): *wie exklusiv* zwei Wörter aneinander gebunden sind.',
        '„großer Fehler“ ist **häufiger**, „schwerer Fehler“ ist **typischer**: *groß* passt zu fast allem, *schwer* bindet spezifisch an *Fehler*.[^2][^3]',
      ],
      forward: 'logDice bleibt hier eine Black Box: höher = stärker gebunden (Skala bis 14). **Wie** ein Korpus das genau misst – Formel, Grenzen – lernst du in **Station ④**.',
    },
    {
      type: 'skala', variant: 'kontinuum', label: 'Wissen · Wie fest ist eine Verbindung?', axis: ['frei', 'fest'],
      stops: [
        { stufe: 'frei', bsp: 'rotes Auto', erkl: 'beliebig kombinierbar – kein festes Muster.' },
        { stufe: 'Kollokation', bsp: 'schwerer Fehler', erkl: 'üblich, aber noch durchschaubar.' },
        { stufe: 'Idiom', bsp: 'ins Gras beißen', erkl: 'fest & bildlich – nicht wörtlich zu verstehen.' },
      ],
    },
    { type: 'merke', text: 'Häufigkeit lügt – die **Assoziationsstärke** misst Typizität.' },
    {
      type: 'datablick', label: 'Datenblick · Adjektiv-Partner von „Fehler“',
      caption: 'Korpusdaten aus dem Signifikation-Korpus – geordnet nach Assoziationsstärke.',
      rows: [
        { verb: 'schwerer Fehler', frequency: '1 177', logDice: '8,47', mark: true },
        { verb: 'gravierender Fehler', frequency: '208', logDice: '8,32' },
        { verb: 'großer Fehler', frequency: '2 047', logDice: '6,49', mark: true },
        { verb: 'dicker Fehler', frequency: '19', logDice: '4,60' },
      ],
      note: 'Am **häufigsten**: „großer Fehler“. Am **typischsten** (höchster logDice): „schwerer Fehler“. Beides fällt hier auseinander.',
    },
    {
      type: 'wissen', label: 'Wissen · Bedeutung und Angemessenheit',
      paras: [
        'Typische Partner tragen oft eine **Konnotation** (Nebenbedeutung, Stilfärbung). „Ein Fehler ist ihm *unterlaufen*“ klingt anders als „er hat einen Fehler *gemacht*“, obwohl beide dasselbe meinen (**Denotation**).[^4]',
        'Kollokationswissen ist deshalb auch **Stilwissen**: Wer die üblichen Partner kennt, schreibt idiomatisch und **angemessen**.',
      ],
    },
    {
      type: 'aufgaben',
      items: [
        { op: 'Prüfe:', prompt: ' Ist „ins Gras beißen“ eine Kollokation? Begründe mit der Abgrenzung *frei – Kollokation – Idiom*.[^1]', answerLines: 2, erwartung: 'Nein – es ist ein *Idiom*: fest gebunden UND bildlich/undurchsichtig (= sterben). Kollokationen sind fest, aber in ihrer Bedeutung noch durchschaubar.' },
        { op: 'Erkläre', prompt: ' anhand des Datenblicks in eigenen Worten, warum die *häufigere* Verbindung nicht automatisch die *typischere* ist.[^3]', answerLines: 3, erwartung: 'Frequenz zählt nur, *wie oft*; logDice misst, *wie exklusiv* gebunden. „groß“ ist häufig, passt aber zu fast jedem Nomen (unspezifisch → niedriger logDice); „schwer“ bindet spezifisch an „Fehler“ (höherer logDice). Also: häufiger ≠ typischer.' },
        { op: 'Ersetze', prompt: ' in einem sachlichen Text „ein großer Fehler“ durch den spezifischer gebundenen Partner und **begründe** die Wirkung.[^4]', answerLines: 2, erwartung: 'z. B. „ein *schwerer* / *gravierender* Fehler“ – spezifischer gebunden, wirkt präziser und stilistisch angemessener als das unspezifische „groß“.' },
        { op: 'Notiere', prompt: ' aus der Datenblick-Aufgabe der App ein weiteres Nomen, bei dem *häufig* und *typisch* auseinanderfallen – mit den beiden Verbindungen.', answerLines: 1, erwartung: 'individuell (aus der App); erwartet: ein Nomen mit zwei Partnern, bei denen der häufigste nicht der logDice-stärkste ist (analog groß/schwer bei „Fehler“).' },
      ],
    },
    { type: 'transfer', text: 'Wähle ein eigenes Nomen, vermute den typischsten Partner und prüfe an der **Kurs-Station ①**, ob er dort als typisch (hoher logDice) auftaucht.' },
  ],
}

const LK = {
  title: 'Wenn Wörter ihre Umgebung färben',
  sub: 'Leistungskurs · Semantische Prosodie, Konnotation und Stilwert von Kollokationen',
  belege: ['hanks-bedeutungen', 'loebner-semantik'],
  blocks: [
    {
      type: 'wissen', label: 'Wissen · Semantische Prosodie',
      paras: [
        'Manche Wörter „*färben*“ ihre Umgebung: Sie treten bevorzugt in positiven oder negativen Kontexten auf – z. B. *Schaden anrichten*, *Unheil anrichten* (fast nur bei Unerwünschtem). Diese Tendenz heißt **semantische Prosodie**.[^1]',
        'Sie ist Teil der Typik einer Kollokation, aber eine **Bedeutungs**-, keine reine Häufigkeitsfrage: Ein Korpus zeigt, *dass* ein Wort so gebunden ist – *warum* es eine Färbung trägt, ist Sache der Bedeutungsanalyse.',
      ],
      forward: 'logDice misst Bindung, nicht Bedeutung. **Wie** ein Korpus misst und wo seine Grenzen liegen: **Station ④**.',
    },
    {
      type: 'skala', variant: 'faerbung', label: 'Wissen · Die Färbung eines Verbs (axiologisch)', axis: ['negativ', 'positiv'],
      stops: [
        { stufe: 'negativ', bsp: 'anrichten', erkl: 'Schaden, Chaos, Unheil – fast nur Unerwünschtes.' },
        { stufe: 'neutral', bsp: 'bewirken', erkl: 'Positives wie Negatives möglich.' },
        { stufe: 'positiv', bsp: 'bescheren', erkl: 'Freude, Glück – meist Erwünschtes.' },
      ],
    },
    {
      type: 'wissen', label: 'Wissen · Konnotation und Stilwert',
      paras: [
        'Über die **Denotation** hinaus tragen Kollokationen **Konnotationen** und **Register**-Markierungen (gehoben / alltäglich / fachsprachlich): „einen Fehler *begehen*“ (gehoben) vs. „*machen*“ (neutral).[^2]',
        'Wer die Färbung kennt, steuert die **Wirkung** bewusst – Kollokationswissen ist auch Stilwissen.',
      ],
    },
    { type: 'merke', text: 'Nicht wie oft – sondern wie exklusiv. Und die Zahl kennt keine Bedeutung.' },
    {
      type: 'aufgaben',
      items: [
        { op: 'Prosodie erkennen:', prompt: ' Finde ein Verb oder Adjektiv, das fast nur in *negativen* Kontexten steht, und belege es mit zwei eigenen Beispielsätzen.[^1]', answerLines: 2, erwartung: 'z. B. *anrichten* (Schaden/Unheil), *zufügen*, *verursachen*, *sich zusammenbrauen* – mit zwei Sätzen, die die negative Umgebung belegen. Bewertet wird, ob die Beispiele die Färbung tatsächlich zeigen.' },
        { op: 'Konnotation vergleichen:', prompt: ' Ordne die drei Verbindungen nach *Register* (gehoben → neutral → salopp) und beschreibe die Wirkung.[^2]', chips: ['einen Fehler begehen', 'einen Fehler machen', 'einen Fehler verzapfen'], chipsSerif: true, answerLines: 1, erwartung: '*begehen* = gehoben · *machen* = neutral · *verzapfen* = salopp/umgangssprachlich. Wirkung: Die Registerwahl steuert Distanz und Wertung; „verzapfen“ wirkt abwertend-ironisch.' },
        { op: 'Bedeutung vs. Messung:', prompt: ' Ein hoher logDice zeigt starke *Bindung*, aber nicht die *Bedeutung/Färbung*. Belege das an einem Paar mit den Korpuswerten (Frequenz + logDice) und ergänze, welche Konnotation die Zahl *nicht* erfasst.', answerLines: 2, erwartung: 'logDice zeigt nur die *Bindungsstärke* (z. B. „schwerer Fehler“ 8,47), nicht ob die Verbindung positiv/negativ konnotiert ist oder in welchem Register sie steht. Erwartet: konkretes Paar mit Werten + Nennung der nicht erfassten Färbung.' },
      ],
    },
    { type: 'transfer', text: 'Wähle ein eigenes Nomen, benenne den typischsten Partner **und** dessen Konnotation. Prüfe an der **Kurs-Station ①**, ob der Partner dort als typisch (hoher logDice) auftaucht.' },
  ],
}

export const worksheet1 = {
  stationNo: 1,
  title: 'Wortpartner & Kollokationen',
  levels: { DaZ, SekI, SekII, LK },
}

export default worksheet1
