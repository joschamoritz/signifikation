/**
 * server/course/content/station-2.js
 *
 * Aufgaben-Items für Station ② „Wörter mit Funktion" (Wortarten als Werkzeug),
 * über alle vier Niveaustufen (AP10). Muster wie content/station-1.js.
 *
 * Quellen: planning/Kurs-Station-2-Wortarten.md, planning/Kurs-Differenzierung.md
 * (Zeile Station ②), planning/Kurs-Engine-Spec.md.
 *
 * Datenpolitik (wie ①): datentragende Items = corpus-template (corpusQuery +
 * Platzhalter, keine harten logDice-Zahlen). static nur für nicht-volatile
 * Grammatik-Aufgaben (Bausteine sortieren, Form-vs-Funktion/Konversion).
 * DaZ/SekI ohne logDice (Engine-Spec §5 / Lint-Regel 4).
 *
 * Anker (gegen echte DBs verifiziert, 2026-06-21):
 *   Kritik/ATTR  → scharf (11,0) heftig (10,4) …       (Bauplan Adjektiv + Nomen)
 *   Kritik/~OBJA → üben (12,3, top!) stoßen äußern …   (der „Kritik üben"-Aha)
 */

const STATION = {
  id: 's2',
  orderNo: 2,
  title: 'Wörter mit Funktion',
  ipa: 'ˈvɔʁtˌʔaːɐ̯tn̩',
  category: 'wortprofil',
  beamerConfig: { slideTracks: ['spektrum'] },
}

const Q_KRITIK_ADJ  = { lemma: 'Kritik',  pos: 'Substantiv', relation: 'ATTR',  minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_KRITIK_VERB = { lemma: 'Kritik',  pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

const TASKS = [
  // ──────────────── DaZ · Bausteine benennen (keine Zahlen) ────────────────
  {
    id: 's2-f1-bausteine-daz', station: 2, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'bausteine-sortieren',
    prompt: 'Sortiere die Wörter: Welches ist ein Nomen, ein Verb, ein Adjektiv?',
    metasprache: ['Nomen (Namenwort)', 'Verb (Tunwort)', 'Adjektiv (Wiewort)'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Nomen (Namenwort)' },
        { id: 'a2', label: 'Verb (Tunwort)' },
        { id: 'a3', label: 'Adjektiv (Wiewort)' },
      ],
      candidates: [
        { id: 'c1', label: 'Kritik' },
        { id: 'c2', label: 'üben' },
        { id: 'c3', label: 'scharf' },
      ],
      multiplePerAnchor: false,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1'], a2: ['c2'], a3: ['c3'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „Kritik" ist ein Nomen, „üben" ein Verb, „scharf" ein Adjektiv.',
          onWrong: 'Frage: Ist es ein Ding (Nomen), eine Tätigkeit (Verb) oder eine Eigenschaft (Adjektiv)?',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'hoffmann-leimbrink-wortarten', kontext: 'fachlich' }],
  },

  {
    id: 's2-f2-bausteine-markieren-daz', station: 2, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'bauplan-markieren',
    prompt: 'Markiere im Satz das Adjektiv und das Nomen, die zusammengehören.',
    metasprache: ['Adjektiv', 'Nomen'],
    payload: {
      sentence: 'Die Zeitung übt scharfe Kritik.',
      markTask: 'bauplan',
      labels: ['Adjektiv', 'Nomen'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'scharfe', tokenRange: [3, 4], label: 'Adjektiv' },
        { text: 'Kritik', tokenRange: [4, 5], label: 'Nomen' },
      ],
    },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „scharfe Kritik" ist Adjektiv + Nomen.',
          onWrong: 'Suche das Eigenschaftswort (scharfe) und das Ding-Wort (Kritik).',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'hoffmann-leimbrink-wortarten', kontext: 'fachlich' }],
  },

  // ──────────────── SekI · Wortarten bestimmen, Muster benennen ────────────────
  {
    id: 's2-f1-kritik-adj-seki', station: 2, format: 'F1', level: 'SekI', source: 'corpus-template',
    kern: 'bauplan-adj-nomen',
    prompt: 'Welche Adjektive passen typisch zu „Kritik"? Ordne die typischen Partner zu.',
    metasprache: ['Wortart', 'Bauplan (Adjektiv + Nomen)'],
    corpusQuery: Q_KRITIK_ADJ,
    bindings: { answer: [1, 2], near: { rankRange: [4, 10] }, mid: { rankRange: [12, 20] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Kritik' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„{{top.lemma}} Kritik" ist ein typischer Bauplan: Adjektiv + Nomen.',
          onWrong: '„{{selected.lemma}}" passt seltener zu „Kritik". Typisch ist z. B. „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }],
  },

  {
    id: 's2-f2-kritik-markieren-seki', station: 2, format: 'F2', level: 'SekI', source: 'corpus-template',
    kern: 'bauplan-markieren',
    prompt: 'Markiere im echten Beispielsatz das Adjektiv und das Nomen (Bauplan Adjektiv + Nomen).',
    metasprache: ['Bauplan (Adjektiv + Nomen)'],
    corpusQuery: Q_KRITIK_ADJ,
    bindings: { answer: [1] },
    payload: {
      belegQuery: { lemma: 'Kritik', partner: '{{top.lemma}}', source: 'belege.db' },
      markTask: 'bauplan',
      labels: ['Adjektiv', 'Nomen'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ label: 'Adjektiv' }, { label: 'Nomen' }], note: 'Spans aus geparstem Belegsatz; Zielwörter Kritik + {{top.lemma}}.' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – „{{top.lemma}} Kritik" folgt dem Bauplan Adjektiv + Nomen.',
          onWrong: 'Suche das Adjektiv (Eigenschaft) und das Nomen „Kritik".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'beleg-satz' }],
  },

  {
    id: 's2-f3-bauplan-vergleich-seki', station: 2, format: 'F3', level: 'SekI', source: 'corpus-template',
    kern: 'bauplan-benennen',
    prompt: 'Beide folgen dem Bauplan Adjektiv + Nomen – welches Adjektiv ist für „Kritik" typisch? Wähle und begründe.',
    metasprache: ['Wortart', 'Bauplan (Adjektiv + Nomen)'],
    corpusQuery: Q_KRITIK_ADJ,
    bindings: { answer: [1], contrastPair: ['logDice:1', 'logDice:last'] },
    payload: {
      frame: '___ Kritik',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      preferred: '@from:bindings.answer',
      rubric: {
        criteria: ['wählt „{{top.lemma}}" als typisch', 'erkennt den Bauplan Adjektiv + Nomen'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„{{top.lemma}} Kritik" klingt natürlich – Adjektiv + Nomen, typische Verbindung.',
          onWrong: '„{{selected.lemma}}" passt seltener. Typisch ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bildung-rp-kollokationen', kontext: 'fachlich' }],
  },

  // ──────────────── SekII · Wortart über Funktion (logDice sichtbar) ────────────────
  {
    id: 's2-f3-funktion-vergleich-sek2', station: 2, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'form-vs-funktion',
    prompt: 'In „{{top.lemma}} Kritik" – welche Wortart hat „{{top.lemma}}"? Entscheide über die Funktion im Satz.',
    metasprache: ['Form vs. Funktion', 'Wortart', 'logDice'],
    corpusQuery: Q_KRITIK_VERB,
    bindings: { answer: [1] },
    payload: {
      frame: '{{top.lemma}} Kritik',
      compareDimension: 'typikalitaet',
      // Literale Varianten (Wortart-Entscheidung), Anker-Verb live via {{top.lemma}}.
      variants: [
        { id: 'v1', label: 'Verb (es ist das Prädikat)', typical: true },
        { id: 'v2', label: 'Nomen', typical: false },
      ],
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      preferred: ['v1'],
      rubric: {
        criteria: ['erkennt „{{top.lemma}}" als Verb (Prädikat)', 'begründet über die Funktion, nicht über die Bedeutung'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „{{top.lemma}}" ist hier das Prädikat, also ein Verb. „{{top.lemma}} Kritik" bindet stark (logDice {{top.logDice}}).',
          onChoice: {
            '@selected': 'Die Wortart hängt an der Funktion im Satz: „{{top.lemma}}" ist das Prädikat → Verb, unabhängig von der Bedeutung.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'hoffmann-leimbrink-wortarten', kontext: 'fachlich' }, { key: 'steyer-2000', kontext: 'korpus' }],
  },

  {
    id: 's2-f4-funktion-bestimmen-sek2', station: 2, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'funktion-bestimmen',
    prompt: 'Bestimme die Wortart von „{{top.lemma}}" in „Die Opposition {{top.lemma}} scharfe Kritik." über die Funktion. Wähle und begründe.',
    metasprache: ['Form vs. Funktion', 'Wortart', 'Prädikat'],
    corpusQuery: Q_KRITIK_VERB,
    bindings: { answer: [1] },
    payload: {
      sentence: 'Die Opposition {{top.lemma}} scharfe ___.',
      options: [
        { id: 'o1', label: 'Kritik (Nomen, Objekt)' },
        { id: 'o2', label: 'kritisch (Adjektiv)' },
        { id: 'o3', label: 'kritisieren (Verb)' },
      ],
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: ['„Kritik" als Nomen/Objekt', 'bestimmt die Wortart über die syntaktische Funktion'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „Kritik" ist das Akkusativobjekt (Nomen); „{{top.lemma}}" ist das Verb. Wortart = Funktion im Satz.',
          onChoice: {
            '@selected': 'Prüfe die Funktion: Was tut das Wort im Satz? „Kritik" ist das Objekt von „{{top.lemma}}".',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'hoffmann-leimbrink-wortarten', kontext: 'fachlich' }],
  },

  {
    id: 's2-f5-form-funktion-sek2', station: 2, format: 'F5', level: 'SekII', source: 'static',
    kern: 'form-vs-funktion-konversion',
    // Form vs. Funktion / Konversion: nicht korpus-volatil → bewusst static.
    prompt: 'Gleiches Wort, andere Rolle: Woran erkennst du die Wortart von „üben"?',
    metasprache: ['Form vs. Funktion', 'Konversion'],
    payload: {
      table: [
        { verbindung: 'Die Partei übt Kritik.', frequency: null, logDice: null },
        { verbindung: 'Das Üben macht den Meister.', frequency: null, logDice: null },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'In welchem Satz ist „üben/Üben" ein Verb, in welchem ein Nomen? Begründe über die Funktion.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'Satz 1: „übt" = Verb (Prädikat, konjugiert)',
              'Satz 2: „das Üben" = Nomen (Artikel, großgeschrieben → Konversion)',
              'Wortart richtet sich nach der Funktion, nicht nach dem Wortstamm',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – „übt" ist Prädikat (Verb), „das Üben" ist durch den Artikel zum Nomen geworden (Konversion). Die Funktion entscheidet.',
          onWrong: 'Schau auf die Funktion: Wird das Wort konjugiert (Verb) oder steht ein Artikel davor (Nomen)?',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'didaktik-wortarten-d2', kontext: 'fachlich' }],
  },

  // ──────────────── LK · Grenzfälle (FVG, Konversion) ────────────────
  {
    id: 's2-f4-fvg-grenzfall-lk', station: 2, format: 'F4', level: 'LK', source: 'corpus-template',
    kern: 'funktionsverbgefuege',
    prompt: 'Grenzfall: Ist „{{top.lemma}} Kritik" eine feste Verb-Nomen-Verbindung oder ein Funktionsverbgefüge? Wähle und begründe.',
    metasprache: ['Funktionsverbgefüge', 'feste Verb-Nomen-Verbindung', 'logDice'],
    corpusQuery: Q_KRITIK_VERB,
    bindings: { answer: [1] },
    payload: {
      sentence: 'Die Abgeordnete {{top.lemma}} scharfe Kritik.',
      options: [
        { id: 'o1', label: 'feste Verb-Nomen-Verbindung (Grenzfall zum FVG)' },
        { id: 'o2', label: 'freie Kombination' },
        { id: 'o3', label: 'Idiom' },
      ],
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: [
          'erkennt die feste Bindung (sehr hoher logDice {{top.logDice}})',
          'ordnet „{{top.lemma}} Kritik" zwischen freier Kombination und Idiom ein (FVG-nah)',
        ],
        minHits: 1,
        accepts: ['Hinweis, dass die Bedeutung weitgehend kompositionell bleibt → kein vollständiges Idiom'],
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „{{top.lemma}} Kritik" ist eine sehr feste Verb-Nomen-Verbindung (logDice {{top.logDice}}), in der Forschung ein Grenzfall zum Funktionsverbgefüge. Kein Idiom (Bedeutung bleibt durchsichtig).',
          onChoice: {
            '@selected': 'Prüfe Festigkeit und Durchsichtigkeit: hoher logDice ({{top.logDice}}) → fest; Bedeutung bleibt nachvollziehbar → kein Idiom.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'hoffmann-leimbrink-wortarten', kontext: 'fachlich' }, { key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },

  {
    id: 's2-f5-konversion-lk', station: 2, format: 'F5', level: 'LK', source: 'static',
    kern: 'konversion',
    prompt: 'Konversion analysieren: Wie wird aus dem Verb „üben" das Nomen „das Üben"? Welche grammatischen Marker zeigen den Wortartwechsel?',
    metasprache: ['Konversion', 'Wortartwechsel', 'Nominalisierung'],
    payload: {
      table: [
        { verbindung: 'sie üben (Verb, konjugiert)', frequency: null, logDice: null },
        { verbindung: 'das Üben (Nomen, Artikel + Großschreibung)', frequency: null, logDice: null },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Nenne zwei formale Marker, die „das Üben" als Nomen ausweisen, obwohl der Wortstamm ein Verb ist.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: ['Artikel „das" (Nominalisierung)', 'Großschreibung', 'keine Konjugation / Wegfall der Personalendung', 'Wortart = Funktion, nicht Wortstamm'],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Richtig – Artikel + Großschreibung machen aus dem Verb durch Konversion ein Nomen. Der Wortstamm bleibt, die Wortart wechselt mit der Funktion.',
          onWrong: 'Achte auf Artikel, Großschreibung und ob das Wort konjugiert wird – das entscheidet die Wortart, nicht der Stamm.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'didaktik-wortarten-d2', kontext: 'fachlich' }],
  },
]

export const station2 = { station: STATION, tasks: TASKS }
export default station2
