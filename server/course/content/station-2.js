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

  {
    id: 's2-f1-verschiebe-daz', station: 2, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'verbstellung-v2',
    // Feldermodell (Gallmann 2015): der klassische DaZ-Stolperstein — das Vorfeld
    // muss NICHT das Subjekt sein, das finite Verb steht immer an Position 2.
    prompt: 'Schiebe ein Satzteil ins Vorfeld – vor das Verb. Merke: Das Verb „sucht" bleibt immer an Position 2.',
    metasprache: ['Vorfeld', 'Verb an Position 2'],
    payload: {
      verb: { id: 'vb', text: 'sucht' },
      chunks: [
        { id: 'c1', text: 'Der Hund', role: 'wer?' },
        { id: 'c2', text: 'im Garten', role: 'wo?' },
        { id: 'c3', text: 'einen Ball', role: 'was?' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { validVorfeld: ['c1', 'c2', 'c3'] },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – egal welches Satzteil im Vorfeld steht: Das Verb „sucht" bleibt an Position 2.',
          onWrong: 'Stell genau ein Satzteil ins Vorfeld. Das Verb bleibt direkt dahinter (Position 2).',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'gallmann-2015-topologie', kontext: 'fachlich' }],
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
      // Attributiver Bauplan Adjektiv+Nomen → Adjazenz-Belege „scharfe Kritik".
      belegContext: { lemma: 'Kritik', partner: 'scharf', adjacent: true, limit: 3 },
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

  {
    id: 's2-f3-verschiebe-seki', station: 2, format: 'F3', level: 'SekI', source: 'static',
    kern: 'verschiebeprobe-satzglied',
    // Verschiebeprobe als Satzglied-Test: nur was sich als geschlossene Einheit
    // ins Vorfeld stellen lässt, ist ein Satzglied (Gallmann 2015, Abs. 3.2).
    prompt: 'Verschiebeprobe: Welche Wortgruppen sind Satzglieder? Schiebe eine geschlossene Einheit ins Vorfeld – die umgedrehte Gruppe „Regel die" ist keine.',
    metasprache: ['Satzglied', 'Vorfeld', 'Verschiebeprobe'],
    payload: {
      verb: { id: 'vb', text: 'erklärt' },
      chunks: [
        { id: 'c1', text: 'Der Lehrer', role: 'Subjekt' },
        { id: 'c2', text: 'heute', role: 'adv. Zeit' },
        { id: 'c3', text: 'die Regel', role: 'Objekt' },
        { id: 'c4', text: 'genau', role: 'adv. Art' },
        { id: 'c5', text: 'Regel die', role: 'kein Satzglied' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { validVorfeld: ['c1', 'c2', 'c3', 'c4'] },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Richtig – ein Satzglied lässt sich als geschlossene Einheit ins Vorfeld schieben. „Regel die" ist nur eine umgedrehte Wortfolge, kein Satzglied.',
          onWrong: 'Prüfe: Lässt sich die Gruppe als Einheit (in dieser Reihenfolge) ins Vorfeld stellen? Genau dann ist es ein Satzglied.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'gallmann-2015-topologie', kontext: 'fachlich' }],
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
      // Verb-Nomen-Kollokation → Belege zeigen „Kritik üben" im echten Satz.
      belegContext: { lemma: 'Kritik', partner: 'üben', limit: 3 },
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
    id: 's2-f3-verschiebe-sek2', station: 2, format: 'F3', level: 'SekII', source: 'static',
    kern: 'verschiebeprobe-konstituente',
    // Konstituenten-Integrität: eine Präpositionalphrase verschiebt sich als
    // GANZE ins Vorfeld, nicht zur Hälfte (Gallmann 2015, Abs. 3.2).
    prompt: 'Verschiebeprobe am topologischen Feld: Welche Gruppen sind Satzglieder? Eine Präpositionalphrase muss als Ganzes ins Vorfeld – „auf eine" allein ist kein Satzglied.',
    metasprache: ['Satzglied', 'Konstituente', 'Präpositionalphrase', 'Vorfeld'],
    payload: {
      verb: { id: 'vb', text: 'wartet' },
      chunks: [
        { id: 'c1', text: 'Die Journalistin', role: 'Subjekt' },
        { id: 'c2', text: 'seit Tagen', role: 'adv. Zeit' },
        { id: 'c3', text: 'auf eine Antwort', role: 'Präpositionalobjekt' },
        { id: 'c4', text: 'auf eine', role: 'unvollständige PP' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { validVorfeld: ['c1', 'c2', 'c3'] },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – die Präpositionalphrase „auf eine Antwort" ist eine Konstituente und verschiebt sich nur als Ganzes. „auf eine" ist unvollständig, also kein Satzglied.',
          onWrong: 'Eine Konstituente lässt sich nur vollständig verschieben. „auf eine" ohne „Antwort" ist kein Satzglied – die PP muss komplett ins Vorfeld.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'gallmann-2015-topologie', kontext: 'fachlich' }],
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
    // FVG kurz einführen statt voraussetzen (AP21-QA): Definition + Beispiele im
    // Prompt, damit der Grenzfall ohne Vorwissen bearbeitbar ist.
    prompt: 'Ein Funktionsverbgefüge (FVG) ist eine feste Verbindung aus Funktionsverb + Nomen, in der das Verb seine eigene Bedeutung weitgehend verliert und das Nomen den Inhalt trägt (z. B. „in Frage stellen", „zur Sprache bringen"). Grenzfall: Ist „{{top.lemma}} Kritik" ein FVG oder eine (noch) freie, aber feste Verb-Nomen-Verbindung? Wähle und begründe.',
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
      justifyPrompt: 'Begründe über Festigkeit (Bindungsstärke) und Durchsichtigkeit der Bedeutung.',
      belegContext: { lemma: 'Kritik', partner: 'üben', limit: 3 },
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
    id: 's2-f4-felder-lk', station: 2, format: 'F4', level: 'LK', source: 'static',
    kern: 'topologische-felder',
    // Vollständige Feldanalyse inkl. Satzklammer (Gallmann 2015): das finite
    // Verb in der linken, das infinite in der rechten Klammer; dazwischen das
    // Mittelfeld. Interaktiv (Tippen→Feld) statt Freitext.
    prompt: 'Topologische Feldanalyse: Weise jedem Teil sein Feld zu – Vorfeld, linke Klammer (finites Verb), Mittelfeld und rechte Klammer (infinites Verb).',
    metasprache: ['Vorfeld', 'linke Satzklammer', 'Mittelfeld', 'rechte Satzklammer'],
    payload: {
      sentence: 'Der Hund hat im Garten einen Ball gesucht.',
      markTask: 'felder',
      labels: ['Vorfeld', 'linke Klammer', 'Mittelfeld', 'rechte Klammer'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Der Hund', tokenRange: [0, 2], label: 'Vorfeld' },
        { text: 'hat', tokenRange: [2, 3], label: 'linke Klammer' },
        { text: 'im Garten einen Ball', tokenRange: [3, 7], label: 'Mittelfeld' },
        { text: 'gesucht', tokenRange: [7, 8], label: 'rechte Klammer' },
      ],
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – Vorfeld „Der Hund", linke Klammer „hat" (finit), Mittelfeld „im Garten einen Ball", rechte Klammer „gesucht" (infinit). Die Satzklammer umschließt das Mittelfeld.',
          onWrong: 'Bestimme die Satzklammer zuerst: finites Verb = linke Klammer, infinites Verb = rechte Klammer. Davor das Vorfeld, dazwischen das Mittelfeld.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'gallmann-2015-topologie', kontext: 'fachlich' }],
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
