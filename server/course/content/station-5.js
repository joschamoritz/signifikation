/**
 * server/course/content/station-5.js
 *
 * Aufgaben-Items für Station ⑤ „Belegen statt raten" (AP10/AP21-QA-Redesign).
 *
 * NEUE IDENTITÄT (AP21-QA): forschendes Lernen / data-driven learning. Nicht
 * „Profil ansehen" (das unklare „Schau im Profil nach" der QA), sondern ein
 * echter Forschungszyklus an ECHTEN Belegen:
 *   Hypothese (vor dem Befund) → am Korpus/Beleg prüfen → Befund deuten →
 *   begründet Stellung nehmen → Geltung des eigenen Befunds beurteilen.
 *
 * Abgrenzung: ④ durchschaut/kritisiert das Werkzeug (rezeptiv); ⑤ wendet es im
 * selbstgesteuerten Zyklus an (produktiv) und beurteilt die Validität des
 * EIGENEN Befunds. Einzige Station mit von-Brand-Modell 2 (Erarbeitetes anwenden).
 *
 * Differenzierung: DaZ/SekI qualitativ OHNE logDice (Vermutung an echten Sätzen
 * prüfen). Sek II voller Zyklus mit logDice. LK + Stellungnahme + Methodenkritik
 * (Absence ≠ Absence; Geltungsbereich des Befunds).
 *
 * Korpusdaten verifiziert 2026-06-28: Fehler/~OBJA → machen (f 5851); Bestellung/
 * ~OBJA → aufgeben (logDice 7,8); Regen/ATTR → stark (f 403) vs. strömend
 * (logDice 11,6). Static-LK-Items (Absence/Geltung) literaturgestützt (L/W 2009).
 */

const STATION = {
  id: 's5',
  orderNo: 5,
  title: 'Belegen statt raten',
  ipa: 'ʁeˈʃɛʁʃə',
  category: 'wortprofil',
  beamerConfig: { slideTracks: ['logdice'] },
}

const Q_REGEN_ADJ   = { lemma: 'Regen',      pos: 'Substantiv', relation: 'ATTR',  minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_FEHLER_VERB = { lemma: 'Fehler',     pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_BEST_VERB   = { lemma: 'Bestellung', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

const TASKS = [
  // ════════════════ DaZ · behaupten → an echten Sätzen prüfen ════════════════

  // Vermutung an der Konkordanz prüfen (statt „Schau im Profil nach").
  {
    id: 's5-f2-vermutung-daz', station: 5, format: 'F2', level: 'DaZ', source: 'corpus-template',
    kern: 'vermutung-pruefen',
    prompt: 'Sagt man „einen Fehler machen" oder „einen Fehler tun"? Rate nicht – schau in echte Sätze. Welches Verb steht wirklich neben „Fehler"?',
    metasprache: ['Vermutung', 'Beleg', 'prüfen'],
    corpusQuery: Q_FEHLER_VERB,
    bindings: { answer: ['freq:1'], near: { rankRange: [4, 6] } },
    payload: {
      kwic: { partner: '{{freq:1.lemma}}', limit: 4 },
      options: '@from:bindings',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { correctOptionId: '@from:bindings.answer' },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – in den echten Sätzen steht „{{freq:1.lemma}}", nicht „tun". So prüfst du eine Vermutung: am Beleg, nicht im Bauchgefühl.',
          onWrong: 'Lies die Sätze noch einmal: Welches Verb steht wirklich neben „Fehler"? Es ist „{{freq:1.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'beleg-satz' }],
  },

  // Den belegten Partner im echten Satz markieren.
  {
    id: 's5-f2-markieren-daz', station: 5, format: 'F2', level: 'DaZ', source: 'corpus-template',
    kern: 'beleg-markieren',
    prompt: 'Markiere im echten Beispielsatz die zwei Wörter, die zusammengehören (das Nomen und sein Verb).',
    metasprache: ['Beleg', 'prüfen'],
    corpusQuery: Q_BEST_VERB,
    bindings: { answer: ['logDice:1'] },
    payload: {
      belegQuery: { lemma: 'Bestellung', partner: '{{top.lemma}}', source: 'belege.db' },
      markTask: 'kollokation',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ label: 'Kollokation' }], note: 'Zielwörter Bestellung + {{top.lemma}}.' },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „Bestellung {{top.lemma}}" gehört zusammen. Der echte Satz belegt es.',
          onWrong: 'Suche das Nomen „Bestellung" und das Verb, das dazugehört.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'korpus-pipeline-schnupper', kontext: 'beleg-satz' }],
  },

  // ════════════════ SekI · einfache Hypothese am Profil/Beleg prüfen ════════════════

  {
    id: 's5-f1-vermutung-seki', station: 5, format: 'F1', level: 'SekI', source: 'corpus-template',
    kern: 'vermutung-zuordnen',
    prompt: 'Du vermutest, welche Adjektive typisch zu „Regen" passen. Prüfe am Profil und ordne die passenden Partner zu.',
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
    prompt: 'Prüfe deine Vermutung am echten Beleg: Markiere die typische Verbindung mit „Regen".',
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
      belegContext: { lemma: 'Regen', partner: 'strömend', adjacent: true, limit: 3 },
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
          onCorrect: 'Überraschung: „{{top.lemma}}er Regen" ist die typische Verbindung. „stark" hört man zwar oft, aber die Belege zeigen etwas anderes.',
          onWrong: 'Prüfe am Beleg statt zu raten: Typisch ist „{{top.lemma}}", nicht unbedingt das erste Bauchgefühl.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'malloggi-2021', kontext: 'fachlich' }],
  },

  // ════════════════ SekII · voller Forschungszyklus (logDice) ════════════════

  // Schritt: Hypothese bilden → Profil befragen.
  {
    id: 's5-f1-zuordnen-sek2', station: 5, format: 'F1', level: 'SekII', source: 'corpus-template',
    kern: 'profil-befragen',
    prompt: 'Forschungszyklus, Schritt 1–2: Notiere zuerst (innerlich) deine Hypothese, dann befrage das Profil zu „Regen" und ordne die typischsten Adjektive zu.',
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

  // Schritt: Befund am echten Beleg prüfen.
  {
    id: 's5-f2-markieren-sek2', station: 5, format: 'F2', level: 'SekII', source: 'corpus-template',
    kern: 'beleg-pruefen',
    prompt: 'Forschungszyklus, Schritt 3: Prüfe deinen Befund am echten Beleg. Markiere die typische Verbindung mit „Regen".',
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

  // Schritt: Abweichung zwischen Hypothese und Befund deuten.
  {
    id: 's5-f3-befund-deuten-sek2', station: 5, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'befund-deuten',
    prompt: 'Forschungszyklus, Schritt 4: Hypothese „stark" vs. Befund – welche Verbindung mit „Regen" ist typischer? Deute die Abweichung.',
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

  // Schritt: begründet Stellung nehmen (Zyklus-Abschluss).
  {
    id: 's5-f4-stellung-sek2', station: 5, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'stellung-nehmen',
    prompt: 'Forschungszyklus, Schritt 5: „Bei dem Unwetter fiel ___ Regen." Wähle die datengestützt beste Variante und begründe mit deinem Befund.',
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

  // ════════════════ LK · Stellungnahme + Methodenkritik am eigenen Befund ════════════════

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

  // Methodenkritik 1: Aus Nichtvorkommen folgt nichts (Absence ≠ Absence).
  {
    id: 's5-f5-absence-lk', station: 5, format: 'F5', level: 'LK', source: 'static',
    kern: 'absence-of-evidence',
    prompt: 'Jemand behauptet: „Eine Reise antreten gibt es nicht – in meinen 10 Chatnachrichten habe ich keinen einzigen Beleg gefunden." Beurteile diesen Schluss.',
    metasprache: ['Beleg', 'Validität', 'Generalisierung'],
    payload: {
      table: [
        { verbindung: 'Korpus A: 10 eigene Chatnachrichten – kein Beleg für „eine Reise antreten"' },
        { verbindung: 'Korpus B: 2 Mrd. Wörter Zeitungs-/Literaturtexte – zahlreiche Belege' },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Ist der Schluss „gibt es nicht" gültig? Begründe, was aus dem Nichtvorkommen in einem kleinen Korpus folgt – und was nicht.', kind: 'explain' },
        { id: 'q2', text: 'Welche zwei Eigenschaften müsste ein Korpus haben, damit ein Nichtvorkommen überhaupt etwas bedeutet?', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'der Schluss ist ungültig: aus Nichtvorkommen folgt nicht „gibt es nicht" (absence of evidence ≠ evidence of absence)',
              '10 Nachrichten sind viel zu klein; seltene Verbindungen brauchen große Korpora',
              'ein Befund gilt zunächst nur für das untersuchte Korpus, nicht für „die Sprache"',
            ],
            minHits: 2,
          },
        },
        q2: {
          rubric: {
            criteria: ['ausreichende Größe (sonst fehlen seltene Phänomene)', 'passende Zusammensetzung/Textsorte zur Frage'],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – aus dem Nichtvorkommen in 10 Nachrichten folgt nichts. Seltene Verbindungen brauchen große Korpora; ein Befund gilt erst einmal nur für das untersuchte Korpus.',
          onWrong: 'Trenne „nicht gefunden" von „gibt es nicht". 10 Nachrichten sind viel zu klein – absence of evidence ist nicht evidence of absence.',
        },
      },
      merksatz: 'Nicht gefunden heißt nicht: gibt es nicht.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  // Methodenkritik 2: Geltungsbereich des eigenen Befunds.
  {
    id: 's5-f5-geltung-lk', station: 5, format: 'F5', level: 'LK', source: 'static',
    kern: 'geltungsbereich',
    prompt: 'Du hast am Korpus (geschriebenes Deutsch, v. a. 20. Jh.) herausgefunden: „strömender Regen" ist die typische Verbindung. Für welche Aussage darf dein Befund gelten?',
    metasprache: ['Geltungsbereich', 'Validität', 'Korpusabhängigkeit'],
    payload: {
      table: [
        { verbindung: 'A · „Im geschriebenen Deutsch des 20. Jh. ist strömender Regen eine typische Verbindung."' },
        { verbindung: 'B · „Alle Deutschsprachigen sagen heute immer strömender Regen."' },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Welche Aussage ist durch deinen Befund gedeckt?', kind: 'pick-row' },
        { id: 'q2', text: 'Was müsstest du tun, um auch über gesprochene Gegenwartssprache eine Aussage treffen zu dürfen?', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: 'geschriebenen Deutsch des 20',
        q2: {
          rubric: {
            criteria: [
              'ein passendes Korpus heranziehen (gesprochene Gegenwartssprache)',
              'Befund gilt nur für das untersuchte Korpus – keine unzulässige Verallgemeinerung',
            ],
            minHits: 1,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Richtig – dein Befund deckt nur das untersuchte Korpus (geschriebenes Deutsch, 20. Jh.). Für gesprochene Gegenwartssprache bräuchtest du ein anderes Korpus. Befunde sind korpusabhängig.',
          onWrong: 'Aussage B verallgemeinert unzulässig. Ein Befund gilt zuerst nur für das Korpus, aus dem er stammt.',
        },
      },
      merksatz: 'Ein Befund gilt so weit wie sein Korpus.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'luedeling-walter-2009', kontext: 'fachlich' }, { key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },
]

export const station5 = { station: STATION, tasks: TASKS }
export default station5
