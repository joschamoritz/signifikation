/**
 * server/course/content/station-5.js
 *
 * Aufgaben-Items für Station ⑤ „Belegen statt raten" (Mini-Recherche),
 * über alle vier Niveaustufen (AP10). Muster wie station-1.js.
 *
 * Quellen: planning/Kurs-Station-5-Recherche.md, planning/Kurs-Differenzierung.md
 * (Zeile Station ⑤), planning/Kurs-Engine-Spec.md.
 *
 * Der Forschungszyklus (Hypothese → prüfen → deuten → Stellung) wird auf die
 * Standard-F-Mechaniken (F1–F5) ABGEBILDET, damit die interaktiven Komponenten
 * (AP8) wiederverwendbar bleiben; die Recherche-Rahmung steckt in prompt/feedback.
 *
 * SCHNUPPER-REGEL (AP10-Auftrag): ⑤ ist Sek-II/LK-Kernstation. DaZ/SekI bekommen
 * nur eine reduzierte „Schnupper"-Variante OHNE logDice-Zahlen (qualitativ
 * „oft/typisch"). logDice bleibt Sek II/LK.
 *
 * Kernbeispiel (verifiziert 2026-06-21): Regen/ATTR — Sprachgefühl sagt „stark"
 * (f 403, häufig), Korpus sagt „strömend" (logDice 11,6, typisch). LK-Bias:
 * Diskussion/~OBJA — „eröffnen" (logDice 13,1) durch parlamentarisches Korpus.
 */

const STATION = {
  id: 's5',
  orderNo: 5,
  title: 'Belegen statt raten',
  ipa: 'ʁeˈʃɛʁʃə',
  category: 'wortprofil',
  beamerConfig: { slideTracks: ['logdice'] },
}

const Q_REGEN_ADJ      = { lemma: 'Regen',      pos: 'Substantiv', relation: 'ATTR',  minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_DISKUSSION_VERB = { lemma: 'Diskussion', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

const TASKS = [
  // ──────────────── DaZ · geführt, 1 Schritt (keine Zahlen) ────────────────
  {
    id: 's5-f1-nachschauen-daz', station: 5, format: 'F1', level: 'DaZ', source: 'corpus-template',
    kern: 'nachschauen',
    prompt: 'Schau im Profil nach: Welches Adjektiv passt typisch zu „Regen"? Ordne es zu.',
    metasprache: ['nachschauen', 'prüfen'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1'], near: { rankRange: [5, 12] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Regen' }],
      candidates: '@from:bindings',
      multiplePerAnchor: false,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „{{top.lemma}}er Regen" passt typisch. Das Profil zeigt, welche Wörter zusammengehören.',
          onWrong: 'Schau ins Profil: Welches Wort steht bei „Regen" ganz oben? Das ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  // ──────────────── SekI · einfache Frage am Profil prüfen (kein logDice) ────────────────
  {
    id: 's5-f1-zuordnen-seki', station: 5, format: 'F1', level: 'SekI', source: 'corpus-template',
    kern: 'profil-zuordnen',
    prompt: 'Welche Adjektive passen typisch zu „Regen"? Ordne die passenden Partner zu.',
    metasprache: ['Vermutung', 'prüfen'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1', 'logDice:2'], near: { rankRange: [6, 14] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Regen' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„{{top.lemma}}er Regen" ist eine typische Verbindung – das Profil bestätigt deine Vermutung.',
          onWrong: '„{{selected.lemma}}" passt seltener. Typisch ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'korpus' }],
  },

  {
    id: 's5-f2-markieren-seki', station: 5, format: 'F2', level: 'SekI', source: 'corpus-template',
    kern: 'beleg-markieren',
    prompt: 'Markiere im echten Beispielsatz die typische Verbindung mit „Regen".',
    metasprache: ['Beleg', 'prüfen'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1'] },
    payload: {
      belegQuery: { lemma: 'Regen', partner: '{{top.lemma}}', source: 'belege.db' },
      markTask: 'kollokation',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ label: 'Kollokation' }], note: 'Zielwörter Regen + {{top.lemma}}.' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – „{{top.lemma}}er Regen" ist die typische Verbindung im Beleg.',
          onWrong: 'Suche „Regen" und sein typisches Adjektiv im Satz.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'beleg-satz' }],
  },

  {
    id: 's5-f3-hypothese-pruefen-seki', station: 5, format: 'F3', level: 'SekI', source: 'corpus-template',
    kern: 'hypothese-pruefen',
    prompt: 'Viele tippen auf „stark". Prüfe am Profil: Welches Adjektiv ist die typische Verbindung mit „Regen"? Begründe.',
    metasprache: ['Vermutung', 'prüfen', 'Befund'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      frame: '___ Regen',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      preferred: '@from:bindings.answer',
      rubric: {
        criteria: ['wählt „{{top.lemma}}" als typisch', 'erkennt, dass die Vermutung („stark") nicht die typischste Verbindung ist'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Überraschung: „{{top.lemma}}er Regen" ist die typische Verbindung. „stark" hört man zwar oft, aber das Profil zeigt etwas anderes.',
          onWrong: 'Prüfe am Profil statt zu raten: Typisch ist „{{top.lemma}}", nicht unbedingt das erste Bauchgefühl.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'malloggi-2021', kontext: 'fachlich' }],
  },

  // ──────────────── SekII · Hypothese → Befund → Deutung (logDice) ────────────────
  {
    id: 's5-f1-zuordnen-sek2', station: 5, format: 'F1', level: 'SekII', source: 'corpus-template',
    kern: 'profil-befragen',
    prompt: 'Befrage das Profil zu „Regen" und ordne die typischsten Adjektive zu.',
    metasprache: ['Hypothese', 'Befund', 'Beleg'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1', 'logDice:2'], near: { rankRange: [4, 10] }, mid: { rankRange: [12, 20] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Regen' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: '„{{logDice:1.lemma}} Regen" bindet am stärksten (logDice {{logDice:1.logDice}}).',
          onWrong: '„{{selected.lemma}}" (logDice {{selected.logDice}}) ist schwächer gebunden als „{{logDice:1.lemma}}" ({{logDice:1.logDice}}).',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's5-f2-markieren-sek2', station: 5, format: 'F2', level: 'SekII', source: 'corpus-template',
    kern: 'beleg-pruefen',
    prompt: 'Prüfe deinen Befund am echten Beleg: Markiere die typische Verbindung mit „Regen".',
    metasprache: ['Befund', 'Beleg'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1'] },
    payload: {
      belegQuery: { lemma: 'Regen', partner: '{{top.lemma}}', source: 'belege.db' },
      markTask: 'kollokation',
    },
    display: { showMetrics: true, metric: 'both' },
    solution: { spans: [{ label: 'Kollokation' }], note: 'Zielwörter Regen + {{top.lemma}} (logDice {{top.logDice}}).' },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – „{{top.lemma}} Regen" (logDice {{top.logDice}}) steht so auch im echten Beleg.',
          onWrong: 'Der Befund war „{{top.lemma}}" – suche diese Verbindung im Satz.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline', kontext: 'beleg-satz' }],
  },

  {
    id: 's5-f3-befund-deuten-sek2', station: 5, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'befund-deuten',
    prompt: 'Hypothese „stark" vs. Befund: Welche Verbindung mit „Regen" ist typischer? Deute die Abweichung.',
    metasprache: ['Hypothese', 'Befund', 'Frequenz', 'logDice'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      frame: '___ Regen',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      preferred: '@from:bindings.answer',
      rubric: {
        criteria: [
          'wählt „{{logDice:1.lemma}}" (höchster logDice) als typisch',
          'erklärt: „{{freq:1.lemma}}" ist häufiger, aber unspezifischer',
          'Beleg schlägt Bauchgefühl',
        ],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: '„{{logDice:1.lemma}} Regen" ist mit logDice {{logDice:1.logDice}} am typischsten. „{{freq:1.lemma}}" kommt zwar oft vor (f {{freq:1.frequency}}), bindet aber schwächer – das Sprachgefühl lag daneben.',
          onChoice: {
            '@selected': '„{{selected.lemma}}" hat logDice {{selected.logDice}}. Der Befund: „{{logDice:1.lemma}}" ({{logDice:1.logDice}}) ist typischer – belegen statt raten.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'malloggi-2021', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's5-f4-stellung-sek2', station: 5, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'stellung-nehmen',
    prompt: '„Bei dem Unwetter fiel ___ Regen." Wähle die datengestützt beste Variante und begründe mit deinem Befund.',
    metasprache: ['Befund', 'Stellungnahme', 'logDice'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['logDice:1', 'freq:1'], near: { rankRange: [3, 8] } },
    payload: {
      sentence: 'Bei dem Unwetter fiel ___ Regen.',
      options: '@from:bindings',
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: '@from:bindings.answer',
      rubric: {
        criteria: ['wählt „{{logDice:1.lemma}}"', 'begründet mit dem Korpus-Befund (logDice), nicht mit dem Bauchgefühl'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „{{logDice:1.lemma}} Regen" ist datengestützt die typischste Wahl (logDice {{logDice:1.logDice}}).',
          onChoice: {
            '@selected': '„{{selected.lemma}}" (logDice {{selected.logDice}}) ist schwächer gebunden als „{{logDice:1.lemma}}" ({{logDice:1.logDice}}). Stütze dein Urteil auf den Befund.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'malloggi-2021', kontext: 'fachlich' }],
  },

  // ──────────────── LK · Stellungnahme + Methodenkritik (Korpus-Bias) ────────────────
  {
    id: 's5-f4-stellung-lk', station: 5, format: 'F4', level: 'LK', source: 'corpus-template',
    kern: 'datengestuetzte-stellungnahme',
    prompt: '„Bei dem Unwetter fiel ___ Regen." Wähle datengestützt und formuliere eine kurze Stellungnahme, die den Befund einordnet.',
    metasprache: ['Befund', 'Stellungnahme', 'Validität'],
    corpusQuery: Q_REGEN_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['logDice:1', 'freq:1'], near: { rankRange: [3, 8] } },
    payload: {
      sentence: 'Bei dem Unwetter fiel ___ Regen.',
      options: '@from:bindings',
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: '@from:bindings.answer',
      rubric: {
        criteria: [
          'wählt „{{logDice:1.lemma}}" und stützt sich auf den logDice-Befund',
          'ordnet die Aussagekraft ein (z. B. Frequenzhöhe, Eindeutigkeit)',
        ],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „{{logDice:1.lemma}} Regen" (logDice {{logDice:1.logDice}}) ist datengestützt die typische Wahl. Eine gute Stellungnahme nennt auch die Belastbarkeit des Befunds.',
          onChoice: {
            '@selected': '„{{selected.lemma}}" (logDice {{selected.logDice}}) bindet schwächer als „{{logDice:1.lemma}}". Belege deine Stellungnahme – und benenne die Grenzen.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'malloggi-2021', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's5-f5-korpusbias-lk', station: 5, format: 'F5', level: 'LK', source: 'corpus-template',
    kern: 'methodenkritik-korpusbias',
    prompt: 'Datenblick „Diskussion": Welches Verb bindet am stärksten – und was verrät das über das Korpus?',
    metasprache: ['Korpusabhängigkeit', 'Korpus-Bias', 'Validität', 'logDice'],
    corpusQuery: Q_DISKUSSION_VERB,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'logDice:3', 'freq:1'], contrastPair: ['freq:1', 'logDice:1'] },
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
]

export const station5 = { station: STATION, tasks: TASKS }
export default station5
