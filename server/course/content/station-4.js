/**
 * server/course/content/station-4.js
 *
 * Aufgaben-Items für Station ④ „Texte, die zählen" (AP10/AP21-QA-Redesign).
 *
 * NEUE IDENTITÄT (AP21-QA): Nicht „mehr Kollokationen ranken" (das ist ①),
 * sondern DIE MASCHINE HINTER DER ZAHL verstehen. Rückgrat = die echte Pipeline,
 * mit der das Wortprofil gebaut wurde (wortprofil/03_parse + 04_score):
 *   1 Rohtext aus freien Korpora (Bundestag, Gesetze, DTA, Wikipedia)
 *   2 Lemmatisierung (DWDSmor via de_zdl_lg): ging/geht/gegangen → gehen
 *   3 Wortart (POS-Tagging, spaCy)
 *   4 Dependenzparsing (spaCy, UD): wer hängt an wem (nsubj/obj/amod …)
 *   5 Kookkurrenz ENTLANG der Kanten zählen → Frequenz
 *   6 logDice = 14 + log₂(2·f(A,B) / (f(A)+f(B)))  → Assoziationsmaß
 *   + Grenzen: jeder Schritt kann irren; Korpus-Bias; was die Zahl NICHT sagt.
 *
 * Brücken: zu ③ (Dependenz – die Maschine macht automatisch, was dort von Hand
 * gelernt wurde) und nach ⑤ (Methode selbst anwenden).
 *
 * Differenzierung (Kurs-Differenzierung.md): DaZ/SekI qualitativ OHNE logDice
 * (Grundform, Etikett, Konkordanz). logDice-FORMEL ab Sek II (Bestandteile +
 * Verhältnis), LK volle Logik (log₂/Deckel 14) + Methodenkritik + Parser-Grenzen.
 *
 * Korpusdaten verifiziert 2026-06-28 gegen wortprofil/05_db + 06_belege:
 *   Haar/ATTR: kurz (f 736), blond (logDice 10,6) · Regen/ATTR: stark (f 403),
 *   strömend (logDice 11,6) · Diskussion/~OBJA: eröffnen (logDice 13,1).
 * Static-Items (Pipeline-Schritte, Formel, Parser, Bias) sind kuratiert –
 * Belege/Beispiele literaturgestützt (Lüdeling/Walter 2009, Bubenhofer 2015).
 */

const STATION = {
  id: 's4',
  orderNo: 4,
  title: 'Texte, die zählen',
  ipa: 'ˈkɔʁpʊs',
  category: 'wortprofil',
  beamerConfig: { slideTracks: ['daten', 'logdice'] },
}

const Q_HAAR_ADJ  = { lemma: 'Haar',  pos: 'Substantiv', relation: 'ATTR',  minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_REGEN_ADJ = { lemma: 'Regen', pos: 'Substantiv', relation: 'ATTR',  minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_DISK_VERB = { lemma: 'Diskussion', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
// AP21-QA Aufgaben-Ausbau: frische Anker, gegen wortprofil.db + belege.db verifiziert
// (2026-07-01). Wetter/ATTR → schlecht(f1630, adjazent belegt); Wind/ATTR → frisch
// (f888, adjazent belegt); Problem/ATTR → groß(f6520) häufig vs. gesundheitlich(10,0)
// typisch; Applaus/ATTR → tosend(11,4, adjazent belegt).
const Q_WETTER_ADJ  = { lemma: 'Wetter',  pos: 'Substantiv', relation: 'ATTR', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_WIND_ADJ    = { lemma: 'Wind',    pos: 'Substantiv', relation: 'ATTR', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_PROBLEM_ADJ = { lemma: 'Problem', pos: 'Substantiv', relation: 'ATTR', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_APPLAUS_ADJ = { lemma: 'Applaus', pos: 'Substantiv', relation: 'ATTR', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

const TASKS = [
  // ════════════════ DaZ · Pipeline qualitativ (keine Zahlen) ════════════════

  // Schritt 2: Lemmatisierung – die App sucht die Grundform.
  {
    id: 's4-f1-grundform-daz', station: 4, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'lemmatisierung',
    prompt: 'Bevor die App zählt, sucht sie zu jedem Wort die Grundform. Welche Wörter gehören zur Grundform „gehen"? Ordne zu.',
    metasprache: ['Grundform'],
    payload: {
      anchors: [{ id: 'a1', label: 'gehen' }],
      candidates: [
        { id: 'c1', label: 'geht' },
        { id: 'c2', label: 'ging' },
        { id: 'c3', label: 'gegangen' },
        { id: 'c4', label: 'gegessen' },
      ],
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1', 'c2', 'c3'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „geht", „ging" und „gegangen" sind Formen von „gehen". So fasst die App Wörter zusammen, bevor sie zählt.',
          onWrong: '„gegessen" gehört zu „essen". Die anderen drei sind Formen von „gehen".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  // Schritt 5: Konkordanz – echte Sätze lesen, das wiederkehrende Wort finden.
  {
    id: 's4-f2-kwic-daz', station: 4, format: 'F2', level: 'DaZ', source: 'corpus-template',
    kern: 'konkordanz-lesen',
    prompt: 'Das sind echte Sätze aus dem Korpus. Welches Wort steht in fast jedem Satz neben „Regen"? Lies und wähle.',
    metasprache: ['Korpus', 'Beleg'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['freq:1'], near: { rankRange: [4, 6] } },
    payload: {
      kwic: { partner: '{{freq:1.lemma}}', limit: 4, adjacent: true },
      options: '@from:bindings',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { correctOptionId: '@from:bindings.answer' },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „{{freq:1.lemma}}" steht in allen Sätzen neben „Regen". So sieht ein Korpus aus: viele echte Sätze.',
          onWrong: 'Lies noch einmal: Welches Wort kommt in jedem Satz vor? Es ist „{{freq:1.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'beleg-satz' }],
  },

  // Schritt 2: Lemmatisierung – weitere Grundform.
  {
    id: 's4-f1-grundform2-daz', station: 4, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'lemmatisierung',
    prompt: 'Bevor die App zählt, sucht sie zu jedem Wort die Grundform. Welche Wörter gehören zur Grundform „sprechen"? Ordne zu.',
    metasprache: ['Grundform'],
    payload: {
      anchors: [{ id: 'a1', label: 'sprechen' }],
      candidates: [
        { id: 'c1', label: 'spricht' },
        { id: 'c2', label: 'sprach' },
        { id: 'c3', label: 'gesprochen' },
        { id: 'c4', label: 'gesungen' },
      ],
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1', 'c2', 'c3'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „spricht", „sprach" und „gesprochen" sind Formen von „sprechen". „gesungen" gehört zu „singen".',
          onWrong: '„gesungen" gehört zu „singen". Die anderen drei sind Formen von „sprechen".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  {
    id: 's4-f1-grundform3-daz', station: 4, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'lemmatisierung',
    prompt: 'Welche Wörter gehören zur Grundform „essen"? Ordne zu.',
    metasprache: ['Grundform'],
    payload: {
      anchors: [{ id: 'a1', label: 'essen' }],
      candidates: [
        { id: 'c1', label: 'isst' },
        { id: 'c2', label: 'aß' },
        { id: 'c3', label: 'gegessen' },
        { id: 'c4', label: 'gefahren' },
      ],
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1', 'c2', 'c3'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „isst", „aß" und „gegessen" sind Formen von „essen". „gefahren" gehört zu „fahren".',
          onWrong: '„gefahren" gehört zu „fahren". Die anderen drei sind Formen von „essen".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  // Schritt 5: Konkordanz – weitere echte Sätze lesen.
  {
    id: 's4-f2-kwic-wetter-daz', station: 4, format: 'F2', level: 'DaZ', source: 'corpus-template',
    kern: 'konkordanz-lesen',
    prompt: 'Das sind echte Sätze aus dem Korpus. Welches Wort steht in fast jedem Satz neben „Wetter"? Lies und wähle.',
    metasprache: ['Korpus', 'Beleg'],
    corpusQuery: Q_WETTER_ADJ,
    bindings: { answer: ['freq:1'], near: { rankRange: [4, 6] } },
    payload: {
      kwic: { partner: '{{freq:1.lemma}}', limit: 4, adjacent: true },
      options: '@from:bindings',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { correctOptionId: '@from:bindings.answer' },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „{{freq:1.lemma}}" steht in diesen Sätzen neben „Wetter". So sieht ein Korpus aus: viele echte Sätze.',
          onWrong: 'Lies noch einmal: Welches Wort kommt in fast jedem Satz vor? Es ist „{{freq:1.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'beleg-satz' }],
  },

  {
    id: 's4-f2-kwic-wind-daz', station: 4, format: 'F2', level: 'DaZ', source: 'corpus-template',
    kern: 'konkordanz-lesen',
    prompt: 'Echte Sätze aus dem Korpus. Welches Wort steht in fast jedem Satz neben „Wind"? Lies und wähle.',
    metasprache: ['Korpus', 'Beleg'],
    corpusQuery: Q_WIND_ADJ,
    bindings: { answer: ['freq:1'], near: { rankRange: [4, 6] } },
    payload: {
      kwic: { partner: '{{freq:1.lemma}}', limit: 4, adjacent: true },
      options: '@from:bindings',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { correctOptionId: '@from:bindings.answer' },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „{{freq:1.lemma}}" steht in diesen Sätzen neben „Wind". Genau solche echten Sätze zählt die App.',
          onWrong: 'Lies noch einmal: Welches Wort kommt in fast jedem Satz vor? Es ist „{{freq:1.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'beleg-satz' }],
  },

  // ════════════════ SekI · Pipeline lesen (Frequenz, kein logDice) ════════════════

  // Schritt 1: Repräsentativität – ein Korpus ist gemacht (Textsorten).
  {
    id: 's4-f1-textsorte-seki', station: 4, format: 'F1', level: 'SekI', source: 'static',
    kern: 'repraesentativitaet',
    prompt: 'Ein Korpus ist kein Zufall – jemand hat Texte ausgewählt. Ordne jeden Satz seiner Textsorte zu.',
    metasprache: ['Korpus', 'Textsorte'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Zeitung (Sport)' },
        { id: 'a2', label: 'Gesetzestext' },
      ],
      candidates: [
        { id: 'c1', label: 'Der FC siegte mit 2:1 vor heimischem Publikum.' },
        { id: 'c2', label: 'In der Schlussminute fiel das entscheidende Tor.' },
        { id: 'c3', label: 'Der Vertrag bedarf der Schriftform.' },
        { id: 'c4', label: 'Die Frist beträgt zwei Wochen ab Zustellung.' },
      ],
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1', 'c2'], a2: ['c3', 'c4'] } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – ein Korpus aus Sportzeitungen klingt anders als eines aus Gesetzen. Was drinsteckt, prägt, was die App findet.',
          onWrong: 'Achte auf den Ton: Sport-Schlagzeile oder amtlicher Paragraf? Das Korpus besteht aus solchen Textsorten.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  // Schritt 3: automatische Annotation – die Maschine rät und irrt.
  {
    id: 's4-f2-annotation-seki', station: 4, format: 'F2', level: 'SekI', source: 'static',
    kern: 'annotation-fehler',
    prompt: 'Die Maschine muss bei jedem Wort raten, was es bedeutet. Bei einem Wort hat sie sich vertan. Tippe es an.',
    metasprache: ['Annotation', 'Maschine'],
    payload: {
      annotateTask: 'bedeutung',
      annotations: [
        { text: 'Der', tag: 'Artikel' },
        { text: 'Kiefer', tag: 'Nadelbaum', wrong: true, correctTag: 'Kieferknochen' },
        { text: 'tat', tag: 'Verb' },
        { text: 'ihm', tag: 'Pronomen' },
        { text: 'weh.', tag: 'Adverb' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { wrongWord: 'Kiefer' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Richtig – „der Kiefer" ist hier der Knochen, nicht der Baum (die Kiefer). Die Maschine hat das „der" übersehen. Jede Auszeichnung ist eine Deutung – und kann falsch sein.',
          onWrong: 'Ein Wort hat zwei Bedeutungen. „Der Kiefer" (Knochen) oder „die Kiefer" (Baum)? Das „Der" verrät es.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  // Schritt 5: Konkordanz – echte Belege zählen, was zusammen steht.
  {
    id: 's4-f2-kwic-seki', station: 4, format: 'F2', level: 'SekI', source: 'static',
    kern: 'konkordanz-zaehlen',
    prompt: 'So zählt die App: Sie sammelt echte Sätze. Welches Wort steht in fast allen Belegen neben „Haar"?',
    metasprache: ['Korpus', 'Konkordanz', 'Beleg'],
    payload: {
      node: 'Haar',
      lines: [
        { satz: 'Das Haupt trägt kurzes Haar und auf demselben die kurze Mitra.', quelle: 'DTA' },
        { satz: 'Einer der Täter hatte dunkles, kurzes Haar.', quelle: 'Zeitungskorpus' },
        { satz: 'Der schlanke Mann hatte kurzes Haar und war unrasiert.', quelle: 'Zeitungskorpus' },
        { satz: 'Sie trug sehr kurzes Haar und eine grüne Jacke.', quelle: 'Zeitungskorpus' },
      ],
      options: [
        { id: 'c1', label: 'kurz' },
        { id: 'c2', label: 'lockig' },
        { id: 'c3', label: 'rot' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { correctOptionId: 'c1' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – „kurz" steht in jedem Beleg. Die App zählt genau das: wie oft zwei Wörter in echten Texten zusammen vorkommen.',
          onWrong: 'Lies die Belege: Welches Adjektiv taucht in jedem Satz auf? Es ist „kurz".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'malloggi-2021', kontext: 'fachlich' }],
  },

  // Schritt 1: Repräsentativität – weitere Textsorten.
  {
    id: 's4-f1-textsorte2-seki', station: 4, format: 'F1', level: 'SekI', source: 'static',
    kern: 'repraesentativitaet',
    prompt: 'Ein Korpus ist kein Zufall – jemand hat Texte ausgewählt. Ordne jeden Satz seiner Textsorte zu.',
    metasprache: ['Korpus', 'Textsorte'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Kochrezept' },
        { id: 'a2', label: 'Wetterbericht' },
      ],
      candidates: [
        { id: 'c1', label: 'Die Zwiebeln in Butter glasig anschwitzen.' },
        { id: 'c2', label: 'Den Teig 30 Minuten ruhen lassen.' },
        { id: 'c3', label: 'Im Norden ziehen dichte Wolkenfelder auf.' },
        { id: 'c4', label: 'Die Temperaturen sinken nachts auf zwei Grad.' },
      ],
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1', 'c2'], a2: ['c3', 'c4'] } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – ein Korpus aus Kochbüchern klingt anders als eines aus Wetterberichten. Was drinsteckt, prägt, was die App findet.',
          onWrong: 'Achte auf den Ton: Küchenanweisung oder Wetterprognose? Das Korpus besteht aus solchen Textsorten.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  // Schritt 3: automatische Annotation – weitere Mehrdeutigkeit.
  {
    id: 's4-f2-annotation2-seki', station: 4, format: 'F2', level: 'SekI', source: 'static',
    kern: 'annotation-fehler',
    prompt: 'Die Maschine muss bei jedem Wort raten, was es bedeutet. Bei einem Wort hat sie sich vertan. Tippe es an.',
    metasprache: ['Annotation', 'Maschine'],
    payload: {
      annotateTask: 'bedeutung',
      annotations: [
        { text: 'Der', tag: 'Artikel' },
        { text: 'Ball', tag: 'Tanzfest', wrong: true, correctTag: 'Spielball' },
        { text: 'rollte', tag: 'Verb' },
        { text: 'ins', tag: 'Präposition' },
        { text: 'Tor.', tag: 'Nomen' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { wrongWord: 'Ball' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Richtig – ein „Ball", der „ins Tor rollt", ist der Spielball, nicht das Tanzfest. Die Maschine hat den Kontext übersehen. Jede Auszeichnung ist eine Deutung – und kann falsch sein.',
          onWrong: 'Ein Wort hat zwei Bedeutungen: „der Ball" als Tanzfest oder als Spielgerät. Was „ins Tor rollt", verrät es.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  // Schritt 5: Konkordanz – echte Belege zählen (weiteres Beispiel).
  {
    id: 's4-f2-kwic2-seki', station: 4, format: 'F2', level: 'SekI', source: 'static',
    kern: 'konkordanz-zaehlen',
    prompt: 'So zählt die App: Sie sammelt echte Sätze. Welches Verb steht in fast allen Belegen neben „Ziel"?',
    metasprache: ['Korpus', 'Konkordanz', 'Beleg'],
    payload: {
      node: 'Ziel',
      lines: [
        { satz: 'Dieses Ziel werden wir erreichen.', quelle: 'Bundestagskorpus' },
        { satz: 'Dieses Ziel kann man nur gemeinsam erreichen.', quelle: 'Zeitungskorpus' },
        { satz: 'Ein solches Ziel lässt sich in wenigen Jahren erreichen.', quelle: 'Zeitungskorpus' },
        { satz: 'Wir sind entschlossen, dieses Ziel zu erreichen.', quelle: 'Bundestagskorpus' },
      ],
      options: [
        { id: 'c1', label: 'erreichen' },
        { id: 'c2', label: 'verlieren' },
        { id: 'c3', label: 'kaufen' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { correctOptionId: 'c1' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – „erreichen" steht in jedem Beleg. Die App zählt genau das: wie oft zwei Wörter in echten Texten zusammen vorkommen.',
          onWrong: 'Lies die Belege: Welches Verb taucht in jedem Satz auf? Es ist „erreichen".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'malloggi-2021', kontext: 'fachlich' }],
  },

  // ════════════════ SekII · Maß + erste Methodenreflexion (logDice) ════════════════

  // Schritt 4: Dependenz-Brücke – warum „Entscheidung treffen" über Distanz?
  {
    id: 's4-f4-dependenz-sek2', station: 4, format: 'F4', level: 'SekII', source: 'static',
    kern: 'dependenz-kante',
    prompt: 'Die App zählt keine Nachbarn, sondern grammatische Paare (wie in ③). Darum findet sie „Entscheidung treffen" auch über Distanz. Markiere das Verb und sein Objekt.',
    metasprache: ['Dependenz', 'Kopf', 'Objekt'],
    payload: {
      sentence: 'Das Gericht traf nach langer, öffentlicher Beratung eine schwierige Entscheidung.',
      markTask: 'kopf-dependent',
      labels: ['Verb', 'Objekt'],
      labelWords: { Verb: 'traf', Objekt: 'Entscheidung' },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [{ label: 'Verb' }, { label: 'Objekt' }],
      note: 'Verb „traf" + Objekt „Entscheidung" – im Satz weit getrennt, grammatisch direkt verbunden.',
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – „traf" und „Entscheidung" stehen weit auseinander, hängen aber direkt zusammen (Verb + Akkusativobjekt). Der Parser zieht diese Kante; deshalb zählt die App das Paar, nicht die Nachbarschaft.',
          onWrong: 'Suche das Verb und das Nomen, das von ihm abhängt (sein Objekt): „traf" … „Entscheidung". Die Wörter dazwischen gehören nicht dazu.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }, { key: 'korpus-pipeline', kontext: 'korpus' }],
  },

  // Schritt 6: das Maß lesen – Frequenz vs. logDice (Beamer-Datenfolie).
  {
    id: 's4-f2-tabelle-lesen-sek2', station: 4, format: 'F2', level: 'SekII', source: 'corpus-template',
    kern: 'tabelle-lesen',
    prompt: 'Jetzt das Maß: Lies die Tabelle zu „Haar". Welche Adjektiv-Verbindung ist am häufigsten, welche am typischsten (höchster logDice)?',
    metasprache: ['Kookkurrenz', 'Typikalität', 'Frequenz', 'logDice'],
    corpusQuery: Q_HAAR_ADJ,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'freq:1', 'logDice:3'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      reveal: ['frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Welche Verbindung ist am häufigsten?', kind: 'pick-row' },
        { id: 'q2', text: 'Welche ist am typischsten (höchster logDice)?', kind: 'pick-row' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q1: '@from:bindings.contrastPair[freq]',
        q2: '@from:bindings.contrastPair[logDice]',
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – die häufigste Verbindung ist nicht die typischste. Frequenz und logDice sagen Verschiedenes.',
          onWrong: 'Frequenz = „wie oft", logDice = „wie spezifisch gebunden". Vergleiche die beiden Spalten.',
        },
      },
      merksatz: 'Häufigkeit zählt – logDice misst Typizität.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'korpus-pipeline', kontext: 'korpus' }],
  },

  // Schritt 6: häufig vs. typisch begründen.
  {
    id: 's4-f3-haeufig-vs-typisch-sek2', station: 4, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Häufigste vs. typischste Verbindung zu „Haar": Welche ist typischer? Begründe den Unterschied.',
    metasprache: ['Typikalität', 'Frequenz', 'logDice'],
    corpusQuery: Q_HAAR_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      frame: '___ Haar',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: true,
      // Attributive Adjazenz-Belege „blondes Haar" (die typische Verbindung).
      belegContext: { lemma: 'Haar', partner: 'blond', adjacent: true, limit: 3 },
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      preferred: '@from:bindings.answer',
      rubric: {
        criteria: [
          'wählt „{{logDice:1.lemma}}" als typischer (höherer logDice)',
          'erkennt: „{{freq:1.lemma}}" ist häufiger, aber unspezifischer',
          'logDice misst Bindungsstärke, nicht Rohhäufigkeit',
        ],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: '„{{logDice:1.lemma}} Haar" bindet spezifisch (logDice {{logDice:1.logDice}}). „{{freq:1.lemma}} Haar" ist häufiger (f {{freq:1.frequency}}), aber „{{freq:1.lemma}}" passt zu vielem.',
          onChoice: {
            '@selected': '„{{selected.lemma}}" hat logDice {{selected.logDice}}. „{{logDice:1.lemma}}" ist mit {{logDice:1.logDice}} stärker an „Haar" gebunden.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'steyer-2000', kontext: 'korpus' }],
  },

  // Schritt 6: die Formel – Bestandteile benennen + Verhältnis erklären (Sek-II-Einstieg).
  {
    id: 's4-f5-formel-bestandteile-sek2', station: 4, format: 'F5', level: 'SekII', source: 'static',
    kern: 'formel-bestandteile',
    prompt: 'Woher kommt der logDice-Wert? Formel: logDice = 14 + log₂(2·f(A,B) / (f(A)+f(B))). Dabei ist f(A,B) = wie oft A und B zusammen, f(A) und f(B) = wie oft jedes für sich. Welcher Fall bekommt den höheren logDice?',
    metasprache: ['logDice', 'Frequenz', 'Verhältnis'],
    payload: {
      table: [
        { verbindung: 'A und B sind beide selten – kommen aber fast nur miteinander vor' },
        { verbindung: 'A ist sehr häufig – aber mit vielen verschiedenen Partnern' },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Welcher Fall bekommt den höheren logDice-Wert?', kind: 'pick-row' },
        { id: 'q2', text: 'Begründe mit f(A,B), f(A), f(B): Warum macht das Verhältnis (nicht die Rohzahl) den Wert hoch?', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: 'fast nur miteinander',
        q2: {
          rubric: {
            criteria: [
              'Fall 1 (selten, aber exklusiv) bekommt den höheren logDice',
              'das Verhältnis 2·f(A,B) / (f(A)+f(B)) wird groß, wenn f(A,B) nahe an f(A) und f(B) liegt',
              'die Rohhäufigkeit allein zählt nicht – die Exklusivität der Bindung schon',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – entscheidend ist das Verhältnis von gemeinsamem zu einzelnem Vorkommen: Treten A und B fast nur miteinander auf, wird der Bruch groß und logDice hoch. (log₂ macht daraus eine Skala, +14 ist die Obergrenze – dazu mehr im LK.)',
          onWrong: 'Schau auf den Bruch 2·f(A,B) / (f(A)+f(B)): Nicht „wie oft", sondern „wie exklusiv" treten A und B zusammen auf.',
        },
      },
      merksatz: 'Nicht wie oft – sondern wie exklusiv.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },

  // Schritt 4: Dependenz-Brücke – weiteres Verb-Objekt-Paar über Distanz.
  {
    id: 's4-f4-dependenz2-sek2', station: 4, format: 'F4', level: 'SekII', source: 'static',
    kern: 'dependenz-kante',
    prompt: 'Die App zählt keine Nachbarn, sondern grammatische Paare (wie in ③). Darum findet sie „Beitrag leisten" auch über Distanz. Markiere das Verb und sein Objekt.',
    metasprache: ['Dependenz', 'Kopf', 'Objekt'],
    payload: {
      sentence: 'Der Verein leistete über viele Jahre einen wichtigen Beitrag.',
      markTask: 'kopf-dependent',
      labels: ['Verb', 'Objekt'],
      labelWords: { Verb: 'leistete', Objekt: 'Beitrag' },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [{ label: 'Verb' }, { label: 'Objekt' }],
      note: 'Verb „leistete" + Objekt „Beitrag" – im Satz weit getrennt, grammatisch direkt verbunden.',
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – „leistete" und „Beitrag" stehen weit auseinander, hängen aber direkt zusammen (Verb + Akkusativobjekt). Der Parser zieht diese Kante; deshalb zählt die App das Paar, nicht die Nachbarschaft.',
          onWrong: 'Suche das Verb und das Nomen, das von ihm abhängt (sein Objekt): „leistete" … „Beitrag". Die Wörter dazwischen gehören nicht dazu.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }, { key: 'korpus-pipeline', kontext: 'korpus' }],
  },

  // Schritt 6: häufig vs. typisch begründen (weiterer Anker mit starkem Kontrast).
  {
    id: 's4-f3-problem-typisch-sek2', station: 4, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Häufigste vs. typischste Adjektiv-Verbindung zu „Problem": Welche ist typischer? Begründe den Unterschied zwischen „großes Problem" und der spezifischer gebundenen Verbindung.',
    metasprache: ['Typikalität', 'Frequenz', 'logDice'],
    corpusQuery: Q_PROBLEM_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      frame: '___ Problem',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      preferred: '@from:bindings.answer',
      rubric: {
        criteria: [
          'wählt „{{logDice:1.lemma}}" als typischer (höherer logDice)',
          'erkennt: „{{freq:1.lemma}}" ist häufiger, aber unspezifischer',
          'logDice misst Bindungsstärke, nicht Rohhäufigkeit',
        ],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: '„{{logDice:1.lemma}} Problem" bindet spezifisch (logDice {{logDice:1.logDice}}). „{{freq:1.lemma}} Problem" ist häufiger (f {{freq:1.frequency}}), aber „{{freq:1.lemma}}" passt zu vielem.',
          onChoice: {
            '@selected': '„{{selected.lemma}}" hat logDice {{selected.logDice}}. „{{logDice:1.lemma}}" ist mit {{logDice:1.logDice}} stärker an „Problem" gebunden.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'steyer-2000', kontext: 'korpus' }],
  },

  // ════════════════ LK · logDice voll deuten + Methodenkritik ════════════════

  // logDice deuten + eine Grenze nennen.
  {
    id: 's4-f4-methodenkritik-lk', station: 4, format: 'F4', level: 'LK', source: 'corpus-template',
    kern: 'logdice-deuten',
    prompt: 'Deute logDice {{logDice:1.logDice}} für „{{logDice:1.lemma}} Haar": Wähle die korrekte Aussage und begründe – inklusive einer Grenze des Maßes.',
    metasprache: ['Assoziationsmaß', 'Skala bis 14', 'Korpus-Bias'],
    corpusQuery: Q_HAAR_ADJ,
    bindings: { answer: ['logDice:1'] },
    payload: {
      sentence: 'Aussage über „{{logDice:1.lemma}} Haar" (logDice {{logDice:1.logDice}}): ___',
      options: [
        { id: 'o1', label: 'stark an „Haar" gebunden – sagt aber nichts über Bedeutung/Kontext' },
        { id: 'o2', label: 'die schönste Verbindung' },
        { id: 'o3', label: 'die einzig korrekte Verbindung' },
      ],
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: [
          'logDice misst statistische Bindung (Exklusivität)',
          'nennt eine Grenze: keine Aussage über Bedeutung/Stilwert/Kontext oder Korpus-Bias',
        ],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – logDice {{logDice:1.logDice}} zeigt: „{{logDice:1.lemma}}" ist exklusiv an „Haar" gebunden. Die Zahl sagt nichts über Bedeutung, Stilwert, Kontext oder Korpus-Zusammensetzung.',
          onChoice: {
            '@selected': 'logDice ist ein statistisches Bindungsmaß – kein Werturteil. Trenne „stark gebunden" von „schön/korrekt".',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  // Die Formel voll deuten: log₂ + Deckel 14 (LK-Mehrwert).
  {
    id: 's4-f5-formel-lk', station: 4, format: 'F5', level: 'LK', source: 'static',
    kern: 'logdice-formel',
    prompt: 'logDice = 14 + log₂(2·f(A,B) / (f(A)+f(B))). Deute die ganze Formel: Welche Aussage über log₂ und die 14 ist korrekt?',
    metasprache: ['logDice', 'Logarithmus', 'Skala bis 14'],
    payload: {
      table: [
        { verbindung: 'A tritt fast nur mit B auf: der Bruch geht gegen 1, log₂(1) = 0' },
        { verbindung: 'A tritt mit vielen Partnern auf: der Bruch ist klein, log₂ wird negativ' },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Was bewirken log₂ und die +14 in der Formel? Beziehe dich auf die Obergrenze 14 und darauf, warum man überhaupt logarithmiert.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'maximale Bindung (Bruch = 1) ergibt log₂(1) = 0 → logDice = 14: die 14 ist die Obergrenze',
              'der Logarithmus staucht die multiplikativen Verhältnisse zu einer lesbaren, additiven Skala',
              'nach oben durch 14 begrenzt, nach unten offen (negative log₂-Werte)',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Richtig – bei maximaler Bindung ist der Bruch 1, log₂(1) = 0, also logDice = 14 (das Maximum). Der Logarithmus macht aus dem Verhältnis eine handhabbare Skala; nach unten ist sie offen.',
          onWrong: 'Setze den Extremfall ein: Bruch = 1 → log₂(1) = 0 → logDice = 14. Daher der Deckel. Der Logarithmus skaliert das Verhältnis.',
        },
      },
      merksatz: 'Maximale Bindung = 14; der Logarithmus macht das Verhältnis lesbar.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },

  // Schritt 4 – Parser-Grenzen: Repräsentation der Dependenz (Schütze-Beispiel).
  {
    id: 's4-f5-parser-grenze-lk', station: 4, format: 'F5', level: 'LK', source: 'static',
    kern: 'parser-grenze',
    prompt: 'Beim Dependenzparsing muss die Maschine entscheiden, wer im Satz der „Kopf" ist. „Ich lege den Schlüssel auf den Tisch." – zwei mögliche Analysen der Präpositionalphrase:',
    metasprache: ['Dependenz', 'Kopf', 'Annotation'],
    payload: {
      table: [
        { verbindung: 'A · „Tisch" hängt direkt am Verb „legen" (Inhaltswort als Kopf; „auf" ist nur Markierung)' },
        { verbindung: 'B · „auf" hängt am Verb, „Tisch" hängt an „auf" (Präposition als Kopf)' },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Welche Analyse nutzt unser Parser (Universal Dependencies, Inhaltswort-Primat)?', kind: 'pick-row' },
        { id: 'q2', text: 'Wenn der Parser hier falsch hängt: Welche Kollokation würde dann falsch oder gar nicht gezählt? Begründe.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: 'Tisch',
        q2: {
          rubric: {
            criteria: [
              'UD nutzt Inhaltswort-Primat: „Tisch" hängt am Verb, „auf" ist Markierung (case)',
              'hängt der Parser falsch (z. B. „auf" als Kopf), wird das Paar „legen … Tisch" nicht als solches gezählt',
              'Annotationsfehler verfälschen direkt die Kollokationsstatistik',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – Universal Dependencies wählt das Inhaltswort als Kopf: „Tisch" hängt am Verb, „auf" ist nur die Fallmarkierung. Hängt der Parser falsch, zählt die App das Paar „legen … Tisch" nicht – ein Annotationsfehler verzerrt die Statistik.',
          onWrong: 'Unser Parser folgt dem Inhaltswort-Primat (UD): das Nomen „Tisch" ist Kopf, die Präposition „auf" nur Markierung.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  // Grenzen der Methode – Korpus-Bias (live, Diskussion/~OBJA).
  {
    id: 's4-f5-korpusbias-lk', station: 4, format: 'F5', level: 'LK', source: 'corpus-template',
    kern: 'korpusbias',
    prompt: 'Datenblick „Diskussion": Welches Verb bindet am stärksten – und was verrät das über das Korpus?',
    metasprache: ['Korpusabhängigkeit', 'Korpus-Bias', 'Validität', 'logDice'],
    corpusQuery: Q_DISK_VERB,
    // logDice:1 ist hier zugleich freq:1 (eröffnen) → 4. Zeile = logDice:4 statt
    // freq:1, sonst Dubletten-Zeile. q1-Antwort kommt aus contrastPair[logDice].
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'logDice:3', 'logDice:4'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Welches Verb bindet am stärksten an „Diskussion"?', kind: 'pick-row' },
        { id: 'q2', text: 'Begründe, wie die Zusammensetzung des Korpus (z. B. viele parlamentarische Texte) diesen Befund beeinflussen kann.', kind: 'explain' },
        { id: 'q3', text: 'Nenne zwei Faktoren, die die Verlässlichkeit eines Korpus-Befunds einschränken.', kind: 'explain' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q1: '@from:bindings.contrastPair[logDice]',
        q2: {
          rubric: {
            criteria: [
              '„{{logDice:1.lemma}}" ist sehr stark gebunden (logDice {{logDice:1.logDice}})',
              'ein parlamentarisch/amtlich geprägtes Korpus hebt „Diskussion {{logDice:1.lemma}}/schließen" an',
              'Befunde sind korpusabhängig',
            ],
            minHits: 2,
          },
        },
        q3: {
          rubric: {
            criteria: ['Korpus-Zusammensetzung / Genre-Bias', 'geringe Frequenz = weniger belastbar', 'Mehrdeutigkeit/Homonyme verzerren'],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „{{logDice:1.lemma}}" bindet extrem stark (logDice {{logDice:1.logDice}}). Das dürfte u. a. am hohen Anteil parlamentarischer/amtlicher Texte liegen: Befunde sind korpusabhängig.',
          onWrong: 'Hoher logDice heißt „stark gebunden" – aber frage immer, woher die Daten stammen. Das Korpus prägt den Befund.',
        },
      },
      merksatz: 'Ein Beleg stützt ein Urteil – er ersetzt nicht den Blick auf seine Quelle.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's4-f4-methodenkritik2-lk', station: 4, format: 'F4', level: 'LK', source: 'corpus-template',
    kern: 'logdice-deuten',
    prompt: 'Deute logDice {{logDice:1.logDice}} für „{{logDice:1.lemma}} Applaus": Wähle die korrekte Aussage und begründe – inklusive einer Grenze des Maßes.',
    metasprache: ['Assoziationsmaß', 'Skala bis 14', 'Korpus-Bias'],
    corpusQuery: Q_APPLAUS_ADJ,
    bindings: { answer: ['logDice:1'] },
    payload: {
      sentence: 'Aussage über „{{logDice:1.lemma}} Applaus" (logDice {{logDice:1.logDice}}): ___',
      options: [
        { id: 'o1', label: 'stark an „Applaus" gebunden – sagt aber nichts über Bedeutung/Kontext' },
        { id: 'o2', label: 'die schönste Verbindung' },
        { id: 'o3', label: 'die einzig korrekte Verbindung' },
      ],
      requireJustification: true,
      belegContext: { lemma: 'Applaus', partner: 'tosend', adjacent: true, limit: 3 },
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: [
          'logDice misst statistische Bindung (Exklusivität)',
          'nennt eine Grenze: keine Aussage über Bedeutung/Stilwert/Kontext oder Korpus-Bias',
        ],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – logDice {{logDice:1.logDice}} zeigt: „{{logDice:1.lemma}}" ist exklusiv an „Applaus" gebunden. Die Zahl sagt nichts über Bedeutung, Stilwert, Kontext oder Korpus-Zusammensetzung.',
          onChoice: {
            '@selected': 'logDice ist ein statistisches Bindungsmaß – kein Werturteil. Trenne „stark gebunden" von „schön/korrekt".',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's4-f5-annotationsgrenze-lk', station: 4, format: 'F5', level: 'LK', source: 'static',
    kern: 'annotation-grenze',
    prompt: 'Beim POS-Tagging muss die Maschine jedem Wort eine Wortart zuweisen. „Die Läufer wurden ausgetauscht." – „Läufer" ist mehrdeutig (Sportler / Teppich / Schachfigur). Zwei mögliche Annotationen:',
    metasprache: ['Annotation', 'POS-Tagging', 'Homonym'],
    payload: {
      table: [
        { verbindung: 'A · „Läufer" = Person (Sportler), Verb „austauschen" = auswechseln' },
        { verbindung: 'B · „Läufer" = Gegenstand (Schachfigur/Teppich), Verb „austauschen" = ersetzen' },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Warum kann die Maschine „Läufer" hier nicht sicher zuordnen, und wovon hängt die richtige Deutung ab?', kind: 'explain' },
        { id: 'q2', text: 'Wenn der Tagger „Läufer" systematisch falsch deutet: Welche Folge hat das für die Kollokationsstatistik? Begründe.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              '„Läufer" ist ein Homonym – dieselbe Form, verschiedene Bedeutungen',
              'nur der weitere Kontext (hier unentschieden) entscheidet die Lesart',
              'die Maschine tagt nach Wahrscheinlichkeit, nicht nach Verstehen',
            ],
            minHits: 2,
          },
        },
        q2: {
          rubric: {
            criteria: [
              'falsch zugeordnete Belege landen in der falschen Bedeutungs-/Wortart-Klasse',
              'die Kollokationszahlen für beide Lesarten werden verzerrt (vermischt oder zu niedrig)',
              'Annotationsfehler pflanzen sich in die Statistik fort',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „Läufer" ist ein Homonym; ohne eindeutigen Kontext rät der Tagger. Ordnet er systematisch falsch zu, vermischen sich die Kollokationszahlen der Lesarten – der Annotationsfehler verzerrt die Statistik.',
          onWrong: 'Ein Homonym hat mehrere Bedeutungen bei gleicher Form. Tagt die Maschine falsch, zählt sie Belege in der falschen Klasse – die Statistik kippt.',
        },
      },
      merksatz: 'Jede automatische Auszeichnung ist eine Deutung – und kann irren.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }, { key: 'schuetze-2018', kontext: 'fachlich' }],
  },
]

export const station4 = { station: STATION, tasks: TASKS }
export default station4
