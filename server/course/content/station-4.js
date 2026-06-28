/**
 * server/course/content/station-4.js
 *
 * Aufgaben-Items für Station ④ „Texte, die zählen" (Korpus verstehen, logDice),
 * über alle vier Niveaustufen (AP10). Muster wie station-1.js.
 *
 * Quellen: planning/Kurs-Station-4-Korpus.md, planning/Kurs-Differenzierung.md
 * (Zeile Station ④), planning/Kurs-Engine-Spec.md.
 *
 * SCHNUPPER-REGEL (Kurs-Differenzierung, AP10-Auftrag): ④ ist eine Sek-II/LK-
 * Kernstation. DaZ/SekI bekommen nur eine reduzierte „Schnupper"-Variante auf der
 * Ebene „oft / selten zusammen" — OHNE logDice-Zahlen (nur Frequenz/qualitativ).
 * logDice/Skala/Formel bleiben Sek II/LK vorbehalten.
 *
 * Anker (verifiziert 2026-06-21): Haar/ATTR — häufigste „lang" (f 753, logDice 7,5)
 * vs. typischste „blond" (logDice 10,6, f 530): der „häufig ≠ typisch"-Aha.
 */

const STATION = {
  id: 's4',
  orderNo: 4,
  title: 'Texte, die zählen',
  ipa: 'ˈkɔʁpʊs',
  category: 'wortprofil',
  beamerConfig: { slideTracks: ['daten', 'logdice'] },
}

const Q_HAAR_ADJ = { lemma: 'Haar', pos: 'Substantiv', relation: 'ATTR', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

const TASKS = [
  // ──────────────── DaZ · Schnupper „oft zusammen" (keine Zahlen) ────────────────
  {
    id: 's4-f1-oft-daz', station: 4, format: 'F1', level: 'DaZ', source: 'corpus-template',
    kern: 'oft-zusammen',
    prompt: 'Welche Wörter kommen oft zusammen mit „Haar" vor? Ordne die häufigen Partner zu.',
    metasprache: ['oft', 'selten'],
    corpusQuery: Q_HAAR_ADJ,
    bindings: { answer: ['freq:1', 'freq:2'], near: { rankRange: [5, 12] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Haar' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „{{freq:1.lemma}}es Haar" kommt sehr oft vor.',
          onWrong: '„{{selected.lemma}}" kommt seltener mit „Haar" vor. Oft hört man „{{freq:1.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  {
    id: 's4-f2-markieren-daz', station: 4, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'oft-markieren',
    // Kuratierter, einfacher Satz (DaZ braucht kontrollierte Eingabe).
    prompt: 'Markiere die zwei Wörter, die oft zusammen vorkommen.',
    metasprache: ['oft', 'selten'],
    payload: {
      sentence: 'Sie hat lange blonde Haare.',
      markTask: 'kollokation',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ text: 'blonde Haare', tokenRange: [3, 5], label: 'oft zusammen' }] },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „blonde Haare" hört man oft zusammen.',
          onWrong: 'Suche das Adjektiv und das Nomen, die oft zusammen vorkommen.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  // ──────────────── SekI · Schnupper „Häufigkeit lesen" (Frequenz, kein logDice) ────────────────
  {
    id: 's4-f1-haeufig-zuordnen-seki', station: 4, format: 'F1', level: 'SekI', source: 'corpus-template',
    kern: 'haeufigkeit-zuordnen',
    prompt: 'Welche Adjektive kommen häufig mit „Haar" vor? Ordne die häufigen Partner zu.',
    metasprache: ['Korpus', 'Häufigkeit', 'Beleg'],
    corpusQuery: Q_HAAR_ADJ,
    bindings: { answer: ['freq:1', 'freq:2'], near: { rankRange: [6, 14] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Haar' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
    },
    // Schnupper: Frequenz als „oft/selten" erlaubt, ABER kein logDice.
    display: { showMetrics: true, metric: 'frequency' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„{{freq:1.lemma}}es Haar" kommt im Korpus besonders häufig vor.',
          onWrong: '„{{selected.lemma}}" ist seltener. Häufiger ist „{{freq:1.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  {
    id: 's4-f2-frequenztabelle-seki', station: 4, format: 'F2', level: 'SekI', source: 'corpus-template',
    kern: 'frequenz-lesen',
    prompt: 'Lies die Häufigkeitstabelle: Welche Verbindung kommt am häufigsten vor?',
    metasprache: ['Korpus', 'Häufigkeit'],
    corpusQuery: Q_HAAR_ADJ,
    bindings: { tableRows: ['freq:1', 'freq:2', 'freq:3', 'freq:4'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      // Bewusst NUR Frequenz-Spalte (Schnupper, kein logDice).
      columns: ['verbindung', 'frequency'],
      questions: [
        { id: 'q1', text: 'Welche Verbindung kommt am häufigsten vor?', kind: 'pick-row' },
      ],
    },
    display: { showMetrics: true, metric: 'frequency' },
    solution: { answers: { q1: '@from:bindings.contrastPair[freq]' } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – „{{freq:1.lemma}}es Haar" steht in der Häufigkeit ganz oben.',
          onWrong: 'Schau in die Spalte „Häufigkeit": die höchste Zahl steht oben.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  // ──────────────── SekII · Frequenz von Typikalität trennen (logDice) ────────────────
  {
    id: 's4-f2-tabelle-lesen-sek2', station: 4, format: 'F2', level: 'SekII', source: 'corpus-template',
    kern: 'tabelle-lesen',
    prompt: 'Lies die Tabelle: Welche Adjektiv-Verbindung zu „Haar" ist am häufigsten, welche am typischsten (höchster logDice)?',
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
          onCorrect: 'Genau – die häufigste Verbindung ist nicht die typischste. Beide Spalten sagen Verschiedenes.',
          onWrong: 'Frequenz = „wie oft", logDice = „wie spezifisch gebunden". Vergleiche die beiden Spalten.',
        },
      },
      merksatz: 'Häufigkeit lügt – logDice misst Typizität.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'korpus-pipeline', kontext: 'korpus' }],
  },

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

  {
    id: 's4-f4-skala-verorten-sek2', station: 4, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'skala-verorten',
    prompt: 'Ordne die Verbindung „{{logDice:1.lemma}} Haar" grob auf der logDice-Skala ein und begründe.',
    metasprache: ['logDice', 'Skala bis 14', 'Typikalität'],
    corpusQuery: Q_HAAR_ADJ,
    bindings: { answer: ['logDice:1'] },
    payload: {
      sentence: '„{{logDice:1.lemma}} Haar" hat logDice {{logDice:1.logDice}} (Skala bis 14). Wo liegt das? ___',
      options: [
        { id: 'o1', label: 'typisch (um ~10)' },
        { id: 'o2', label: 'erkennbar (um ~7)' },
        { id: 'o3', label: 'eher zufällig (niedrig)' },
      ],
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: ['ordnet hohen logDice als „typisch" ein', 'nutzt die Skala-Faustregel (Richtwerte, kein fester Grenzwert)'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – logDice {{logDice:1.logDice}} liegt im typischen Bereich (Faustregel: ~10 typisch, ~7 erkennbar, niedrig zufällig).',
          onChoice: {
            '@selected': 'Die Skala reicht bis 14. logDice {{logDice:1.logDice}} ist hoch → typisch. Die Werte sind Richtwerte, keine harten Grenzen.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },

  // ──────────────── LK · logDice deuten + Methodenkritik / Formel ────────────────
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

  {
    id: 's4-f5-formel-lk', station: 4, format: 'F5', level: 'LK', source: 'static',
    kern: 'logdice-formel',
    // Formel-Erklärung: qualitativ, nicht korpus-volatil → bewusst static.
    prompt: 'Die logDice-Formel deuten: Welche Größe macht eine seltene Verbindung trotzdem „stark"?',
    metasprache: ['logDice', 'Assoziationsmaß', 'Skala bis 14'],
    payload: {
      table: [
        { verbindung: 'A tritt fast nur mit B auf (selten, aber exklusiv)', frequency: null, logDice: null },
        { verbindung: 'A tritt sehr oft auf, aber mit vielen Partnern', frequency: null, logDice: null },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Welcher Fall bekommt den höheren logDice – und warum? Beziehe dich auf das Verhältnis von gemeinsamem zu einzelnem Vorkommen.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'Fall 1 (exklusive Bindung) bekommt höheren logDice',
              'logDice = 14 + log₂(2·f(A,B) / (f(A)+f(B))) – das Verhältnis zählt, nicht die Rohzahl',
              'nach oben durch 14 begrenzt',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Richtig – entscheidend ist 2·f(A,B) / (f(A)+f(B)): je exklusiver die Bindung, desto näher an 14. Reine Häufigkeit zählt nicht.',
          onWrong: 'Schau auf das Verhältnis gemeinsames zu einzelnem Vorkommen – nicht „wie oft", sondern „wie exklusiv".',
        },
      },
      merksatz: 'Nicht wie oft — sondern wie exklusiv.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },
]

export const station4 = { station: STATION, tasks: TASKS }
export default station4
