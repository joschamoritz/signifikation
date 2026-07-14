/**
 * server/course/content/station-3.js
 *
 * Aufgaben-Items für Station ③ „Wer hängt an wem?" (grammatische
 * Abhängigkeiten), über alle vier Niveaustufen (AP10). Muster wie station-1.js.
 *
 * Quellen: planning/Kurs-Station-3-Abhaengigkeiten.md, planning/Kurs-Differenzierung.md
 * (Zeile Station ③), planning/Kurs-Engine-Spec.md.
 *
 * Schwerpunkt = Syntax (Satzglieder, Dependenz, Slots), NICHT logDice-Magnitude.
 * Daher metric:'none' durchgehend; datentragende Items bleiben dennoch
 * corpus-template, damit der live geprüfte Top-Verbpartner ({{top.lemma}})
 * eingespielt wird. Satzglieder werden mit Buchstaben-Label (S/P/O) markiert,
 * nie nur über Farbe (Barrierearmut, Blaupause §3).
 *
 * Slot-Aha (verifiziert 2026-06-21): „Entscheidung" als OBJEKT → treffen (11,5)/
 * fällen; als SUBJEKT → fällt/ergeht/erfolgt. Derselbe Lemma, andere Verben.
 */

const STATION = {
  id: 's3',
  orderNo: 3,
  title: 'Abhängigkeiten',
  ipa: 'ˈzat͡sˌɡliːdɐ',
  category: 'wortprofil',
  beamerConfig: { slideTracks: [] },
}

const Q_ENTSCH_OBJ = { lemma: 'Entscheidung', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
// AP21-QA Aufgaben-Ausbau: frische Objekt-Anker, gegen wortprofil.db verifiziert
// (2026-07-01): Frage/~OBJA → stellen(10,8); Ziel/~OBJA → erreichen(11,7).
// Belege (Nomen+Verb) in belege.db geprüft.
const Q_FRAGE_OBJ   = { lemma: 'Frage',   pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_ZIEL_OBJ    = { lemma: 'Ziel',    pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

const TASKS = [
  // ──────────────── DaZ · Wer tut was? (keine Zahlen) ────────────────
  {
    id: 's3-f1-wertutwas-daz', station: 3, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'akteur-handlung',
    prompt: 'Wer tut was? Ordne zu.',
    metasprache: ['wer?', 'was tut die Person?'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Wer handelt?' },
        { id: 'a2', label: 'Was tut er/sie?' },
      ],
      candidates: [
        { id: 'c1', label: 'Das Gericht' },
        { id: 'c2', label: 'trifft' },
      ],
      multiplePerAnchor: false,
      // Belege müssen zur Aufgabe passen: hier geht es um Subjekt+Prädikat
      // (das Gericht handelt, trifft). Daher Paarung „Gericht"+„treffen" – die
      // Sätze zeigen das Gericht als Handelnden, NICHT die Objekt-Kollokation
      // „Entscheidung treffen" mit fremden Subjekten (AP21-QA).
      belegContext: { lemma: 'Gericht', partner: 'treffen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1'], a2: ['c2'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „Das Gericht" handelt (wer?), „trifft" ist die Handlung (was tut es?).',
          onWrong: 'Frage: Wer macht etwas? Und: Was tut diese Person?',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-wermarkieren-daz', station: 3, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'akteur-handlung-markieren',
    prompt: 'Markiere, wer handelt (S) und was er tut (P). Beschrifte mit dem Buchstaben.',
    metasprache: ['wer? (S)', 'was tut? (P)'],
    payload: {
      sentence: 'Das Gericht trifft eine Entscheidung.',
      markTask: 'S-P-O',
      labels: ['S', 'P'],
      belegContext: { lemma: 'Gericht', partner: 'treffen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Das Gericht', tokenRange: [0, 2], label: 'S' },
        { text: 'trifft', tokenRange: [2, 3], label: 'P' },
      ],
    },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „Das Gericht" (S) handelt, „trifft" (P) ist die Handlung.',
          onWrong: 'Wer macht etwas? Das ist S. Was tut die Person? Das ist P.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-wermarkieren2-daz', station: 3, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'akteur-handlung-markieren',
    prompt: 'Markiere, wer handelt (S) und was er tut (P). Beschrifte mit dem Buchstaben.',
    metasprache: ['wer? (S)', 'was tut? (P)'],
    payload: {
      sentence: 'Die Kinder spielen draußen.',
      markTask: 'S-P-O',
      labels: ['S', 'P'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Die Kinder', tokenRange: [0, 2], label: 'S' },
        { text: 'spielen', tokenRange: [2, 3], label: 'P' },
      ],
    },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „Die Kinder" (S) handeln, „spielen" (P) ist die Handlung.',
          onWrong: 'Wer macht etwas? Das ist S. Was tun sie? Das ist P. („draußen" gehört zu keinem von beiden.)',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f1-wertutwas2-daz', station: 3, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'akteur-handlung',
    prompt: 'Wer tut was? Ordne zu.',
    metasprache: ['wer?', 'was tut die Person?'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Wer handelt?' },
        { id: 'a2', label: 'Was tut er/sie?' },
      ],
      candidates: [
        { id: 'c1', label: 'Der Hund' },
        { id: 'c2', label: 'bellt' },
      ],
      multiplePerAnchor: false,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1'], a2: ['c2'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „Der Hund" handelt (wer?), „bellt" ist die Handlung (was tut er?).',
          onWrong: 'Frage: Wer macht etwas? Und: Was tut diese Person/dieses Tier?',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-wermarkieren3-daz', station: 3, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'akteur-handlung-markieren',
    prompt: 'Markiere, wer handelt (S) und was er tut (P). Beschrifte mit dem Buchstaben.',
    metasprache: ['wer? (S)', 'was tut? (P)'],
    payload: {
      sentence: 'Die Sonne scheint hell.',
      markTask: 'S-P-O',
      labels: ['S', 'P'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Die Sonne', tokenRange: [0, 2], label: 'S' },
        { text: 'scheint', tokenRange: [2, 3], label: 'P' },
      ],
    },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „Die Sonne" (S) handelt, „scheint" (P) ist die Handlung. („hell" beschreibt nur, wie sie scheint.)',
          onWrong: 'Wer/was macht etwas? Das ist S. Was tut es? Das ist P.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-wermarkieren4-daz', station: 3, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'akteur-handlung-markieren',
    prompt: 'Markiere, wer handelt (S) und was er tut (P). Beschrifte mit dem Buchstaben.',
    metasprache: ['wer? (S)', 'was tut? (P)'],
    payload: {
      sentence: 'Die Katze schläft ruhig.',
      markTask: 'S-P-O',
      labels: ['S', 'P'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Die Katze', tokenRange: [0, 2], label: 'S' },
        { text: 'schläft', tokenRange: [2, 3], label: 'P' },
      ],
    },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „Die Katze" (S) handelt, „schläft" (P) ist die Handlung.',
          onWrong: 'Wer/was macht etwas? Das ist S. Was tut es? Das ist P. („ruhig" gehört zu keinem von beiden.)',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  // ──────────────── SekI · Satzglieder S/P/O ────────────────
  {
    id: 's3-f1-satzglieder-seki', station: 3, format: 'F1', level: 'SekI', source: 'static',
    kern: 'satzglieder-zuordnen',
    prompt: 'Ordne die Satzteile ihren Satzgliedern zu.',
    metasprache: ['Satzglied', 'Subjekt', 'Prädikat', 'Objekt'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Subjekt' },
        { id: 'a2', label: 'Prädikat' },
        { id: 'a3', label: 'Objekt' },
      ],
      candidates: [
        { id: 'c1', label: 'Das Gericht' },
        { id: 'c2', label: 'trifft' },
        { id: 'c3', label: 'eine Entscheidung' },
      ],
      multiplePerAnchor: false,
      // Satzglied-Aufgabe: Beleg zeigt das Gericht als Handelnden (Subjekt + Prädikat).
      belegContext: { lemma: 'Gericht', partner: 'treffen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1'], a2: ['c2'], a3: ['c3'] } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – Subjekt (Das Gericht), Prädikat (trifft), Objekt (eine Entscheidung).',
          onWrong: 'Frage: Wer/was? → Subjekt. Was geschieht? → Prädikat. Wen/was? → Objekt.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-spo-markieren-seki', station: 3, format: 'F2', level: 'SekI', source: 'static',
    kern: 'spo-markieren',
    prompt: 'Markiere Subjekt (S), Prädikat (P) und Objekt (O). Beschrifte jeweils mit dem Buchstaben.',
    metasprache: ['Subjekt', 'Prädikat', 'Objekt'],
    payload: {
      sentence: 'Das Parlament trifft eine wichtige Entscheidung.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'O'],
      belegContext: { lemma: 'Parlament', partner: 'treffen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Das Parlament', tokenRange: [0, 2], label: 'S' },
        { text: 'trifft', tokenRange: [2, 3], label: 'P' },
        { text: 'eine wichtige Entscheidung', tokenRange: [3, 6], label: 'O' },
      ],
    },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Richtig – „Entscheidung" steht im Objekt-Slot, darum das typische Verb „treffen".',
          onWrong: 'Frage: Wer? (S), was geschieht? (P), wen/was? (O). „Entscheidung" ist hier das Objekt.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-spo-markieren2-seki', station: 3, format: 'F2', level: 'SekI', source: 'static',
    kern: 'spo-markieren',
    prompt: 'Markiere Subjekt (S), Prädikat (P) und Objekt (O). Beschrifte jeweils mit dem Buchstaben.',
    metasprache: ['Subjekt', 'Prädikat', 'Objekt'],
    payload: {
      sentence: 'Der Richter verkündet das Urteil.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'O'],
      // Beleg zeigt dieselbe S-P-O-Struktur im echten Satz (Richter verkündet Urteil).
      belegContext: { lemma: 'Richter', partner: 'verkünden', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Der Richter', tokenRange: [0, 2], label: 'S' },
        { text: 'verkündet', tokenRange: [2, 3], label: 'P' },
        { text: 'das Urteil', tokenRange: [3, 5], label: 'O' },
      ],
    },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Richtig – Subjekt (Der Richter), Prädikat (verkündet), Objekt (das Urteil).',
          onWrong: 'Frage: Wer? → Subjekt. Was geschieht? → Prädikat. Wen/was? → Objekt.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f1-satzglieder2-seki', station: 3, format: 'F1', level: 'SekI', source: 'static',
    kern: 'satzglieder-zuordnen',
    prompt: 'Ordne die Satzteile ihren Satzgliedern zu.',
    metasprache: ['Satzglied', 'Subjekt', 'Prädikat', 'Objekt'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Subjekt' },
        { id: 'a2', label: 'Prädikat' },
        { id: 'a3', label: 'Objekt' },
      ],
      candidates: [
        { id: 'c1', label: 'Der Trainer' },
        { id: 'c2', label: 'lobt' },
        { id: 'c3', label: 'die Mannschaft' },
      ],
      multiplePerAnchor: false,
      belegContext: { lemma: 'Mannschaft', partner: 'loben', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1'], a2: ['c2'], a3: ['c3'] } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – Subjekt (Der Trainer), Prädikat (lobt), Objekt (die Mannschaft).',
          onWrong: 'Frage: Wer/was? → Subjekt. Was geschieht? → Prädikat. Wen/was? → Objekt.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-spo-markieren3-seki', station: 3, format: 'F2', level: 'SekI', source: 'static',
    kern: 'spo-markieren',
    prompt: 'Markiere Subjekt (S), Prädikat (P) und Objekt (O). Beschrifte jeweils mit dem Buchstaben.',
    metasprache: ['Subjekt', 'Prädikat', 'Objekt'],
    payload: {
      sentence: 'Der Kapitän erzielt das Tor.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'O'],
      // Beleg zeigt dieselbe S-P-O-Struktur im echten Satz (jemand erzielt ein Tor).
      belegContext: { lemma: 'Tor', partner: 'erzielen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Der Kapitän', tokenRange: [0, 2], label: 'S' },
        { text: 'erzielt', tokenRange: [2, 3], label: 'P' },
        { text: 'das Tor', tokenRange: [3, 5], label: 'O' },
      ],
    },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Richtig – Subjekt (Der Kapitän), Prädikat (erzielt), Objekt (das Tor).',
          onWrong: 'Frage: Wer? → Subjekt. Was geschieht? → Prädikat. Wen/was? → Objekt.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f2-spo-markieren4-seki', station: 3, format: 'F2', level: 'SekI', source: 'static',
    kern: 'spo-markieren',
    prompt: 'Markiere Subjekt (S), Prädikat (P) und Objekt (O). Beschrifte jeweils mit dem Buchstaben.',
    metasprache: ['Subjekt', 'Prädikat', 'Objekt'],
    payload: {
      sentence: 'Die Mannschaft feiert den Sieg.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'O'],
      belegContext: { lemma: 'Sieg', partner: 'feiern', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Die Mannschaft', tokenRange: [0, 2], label: 'S' },
        { text: 'feiert', tokenRange: [2, 3], label: 'P' },
        { text: 'den Sieg', tokenRange: [3, 5], label: 'O' },
      ],
    },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Richtig – Subjekt (Die Mannschaft), Prädikat (feiert), Objekt (den Sieg).',
          onWrong: 'Frage: Wer? → Subjekt. Was geschieht? → Prädikat. Wen/was? → Objekt.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  // ──────────────── SekII · Dependenz / Slot ↔ Partner ────────────────
  {
    id: 's3-f3-kopf-dependent-sek2', station: 3, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'kopf-dependent',
    prompt: 'Bestimme die Abhängigkeit: Markiere das regierende Verb als „Kopf" und das abhängige Akkusativobjekt als „Dependent".',
    metasprache: ['Kopf', 'Dependent', 'Dependenz'],
    corpusQuery: Q_ENTSCH_OBJ,
    bindings: { answer: [1] },
    payload: {
      belegQuery: { lemma: 'Entscheidung', partner: '{{top.lemma}}', source: 'belege.db' },
      markTask: 'kopf-dependent',
      labels: ['Kopf', 'Dependent'],
      // Wort→Label-Mapping für die tolerante Auswertung (Belegsatz ohne
      // Token-Indizes). {{top.lemma}} = regierendes Verb (Kopf).
      labelWords: { Kopf: '{{top.lemma}}', Dependent: 'Entscheidung' },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ label: 'Kopf' }, { label: 'Dependent' }], note: 'Kopf = Verb „{{top.lemma}}", Dependent = Akkusativobjekt „Entscheidung".' },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „{{top.lemma}}" ist der Kopf, „Entscheidung" das abhängige Akkusativobjekt.',
          onWrong: 'Das Verb regiert das Objekt: „{{top.lemma}}" (Kopf) → „Entscheidung" (Dependent).',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'beleg-satz' }],
  },

  {
    id: 's3-f4-slot-bestimmen-sek2', station: 3, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'slot-bestimmen',
    prompt: 'In „eine Entscheidung {{top.lemma}}" – welchen Slot besetzt „Entscheidung"? Wähle und begründe.',
    metasprache: ['Slot', 'Subjekt', 'Objekt'],
    corpusQuery: Q_ENTSCH_OBJ,
    bindings: { answer: [1] },
    payload: {
      sentence: 'Das Gremium muss eine Entscheidung {{top.lemma}}.',
      options: [
        { id: 'o1', label: 'Objekt (jemand trifft sie)' },
        { id: 'o2', label: 'Subjekt (sie handelt selbst)' },
        { id: 'o3', label: 'Prädikativ' },
      ],
      requireJustification: true,
      justifyPrompt: 'Begründe: Warum besetzt „Entscheidung" hier diesen Slot?',
      // Objekt-Slot → Belege zeigen die Objekt-Kollokation „Entscheidung treffen".
      belegContext: { lemma: 'Entscheidung', partner: 'treffen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: ['„Entscheidung" als Objekt', 'verknüpft den Objekt-Slot mit dem Verb „{{top.lemma}}"'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – hier ist „Entscheidung" das Objekt (jemand trifft sie), darum „{{top.lemma}}".',
          onChoice: {
            '@selected': 'Frage: Wer/was handelt? Das Gremium. „Entscheidung" ist das Ziel der Handlung → Objekt-Slot → „{{top.lemma}}".',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f5-slotwechsel-sek2', station: 3, format: 'F5', level: 'SekII', source: 'static',
    kern: 'slot-wechsel',
    // Slot-Wechsel braucht ZWEI Relationen (Objekt- vs. Subjekt-Verben) – eine
    // corpusQuery deckt nur eine ab → bewusst static (kuratierter Kontrast).
    prompt: 'Warum verlangt derselbe Begriff andere Verben, je nach Slot?',
    metasprache: ['Slot', 'syntaktische Funktion'],
    payload: {
      table: [
        { verbindung: 'Er trifft eine Entscheidung. (Entscheidung = Objekt)', frequency: null, logDice: null },
        { verbindung: 'Die Entscheidung fällt morgen. (Entscheidung = Subjekt)', frequency: null, logDice: null },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Erkläre in 2–3 Sätzen, warum der Wechsel vom Objekt- in den Subjekt-Slot einen anderen Verbpartner verlangt.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'im Objekt-Slot ist „Entscheidung" Ziel einer Handlung → Handlungsverben (treffen/fällen)',
              'im Subjekt-Slot ist sie Träger des Geschehens → Vorgangsverben (fallen/ergehen)',
              'der typische Partner hängt von der syntaktischen Funktion ab, nicht nur vom Wort',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – der Slot bestimmt den Partner: Objekt → treffen/fällen, Subjekt → fallen/ergehen. Die Funktion entscheidet.',
          onWrong: 'Frag, ob „Entscheidung" handelt (Subjekt) oder ob mit ihr gehandelt wird (Objekt) – daran hängt der Verbpartner.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f3-kopf-dependent2-sek2', station: 3, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'kopf-dependent',
    prompt: 'Bestimme die Abhängigkeit: Markiere das regierende Verb als „Kopf" und das abhängige Akkusativobjekt als „Dependent".',
    metasprache: ['Kopf', 'Dependent', 'Dependenz'],
    corpusQuery: Q_FRAGE_OBJ,
    bindings: { answer: [1] },
    payload: {
      belegQuery: { lemma: 'Frage', partner: '{{top.lemma}}', source: 'belege.db' },
      markTask: 'kopf-dependent',
      labels: ['Kopf', 'Dependent'],
      labelWords: { Kopf: '{{top.lemma}}', Dependent: 'Frage' },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ label: 'Kopf' }, { label: 'Dependent' }], note: 'Kopf = Verb „{{top.lemma}}", Dependent = Akkusativobjekt „Frage".' },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „{{top.lemma}}" ist der Kopf, „Frage" das abhängige Akkusativobjekt.',
          onWrong: 'Das Verb regiert das Objekt: „{{top.lemma}}" (Kopf) → „Frage" (Dependent).',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'beleg-satz' }],
  },

  {
    id: 's3-f4-slot-bestimmen2-sek2', station: 3, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'slot-bestimmen',
    prompt: 'In „ein Ziel {{top.lemma}}" – welchen Slot besetzt „Ziel"? Wähle und begründe.',
    metasprache: ['Slot', 'Subjekt', 'Objekt'],
    corpusQuery: Q_ZIEL_OBJ,
    bindings: { answer: [1] },
    payload: {
      sentence: 'Der Vorstand will dieses ehrgeizige Ziel {{top.lemma}}.',
      options: [
        { id: 'o1', label: 'Objekt (jemand erreicht es)' },
        { id: 'o2', label: 'Subjekt (es handelt selbst)' },
        { id: 'o3', label: 'Prädikativ' },
      ],
      requireJustification: true,
      justifyPrompt: 'Begründe: Warum besetzt „Ziel" hier diesen Slot?',
      belegContext: { lemma: 'Ziel', partner: 'erreichen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: ['„Ziel" als Objekt', 'verknüpft den Objekt-Slot mit dem Verb „{{top.lemma}}"'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – hier ist „Ziel" das Objekt (jemand erreicht es), darum „{{top.lemma}}".',
          onChoice: {
            '@selected': 'Frage: Wer/was handelt? Der Vorstand. „Ziel" ist das Ziel der Handlung → Objekt-Slot → „{{top.lemma}}".',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f5-slotwechsel2-sek2', station: 3, format: 'F5', level: 'SekII', source: 'static',
    kern: 'slot-wechsel',
    prompt: 'Warum verlangt derselbe Begriff andere Verben, je nach Slot?',
    metasprache: ['Slot', 'syntaktische Funktion'],
    payload: {
      table: [
        { verbindung: 'Sie führen eine Diskussion. (Diskussion = Objekt)', frequency: null, logDice: null },
        { verbindung: 'Eine Diskussion entsteht im Plenum. (Diskussion = Subjekt)', frequency: null, logDice: null },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Erkläre in 2–3 Sätzen, warum der Wechsel vom Objekt- in den Subjekt-Slot einen anderen Verbpartner verlangt.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'im Objekt-Slot ist „Diskussion" Ziel einer Handlung → Handlungsverben (führen)',
              'im Subjekt-Slot ist sie Träger des Geschehens → Vorgangsverben (entstehen/aufkommen)',
              'der typische Partner hängt von der syntaktischen Funktion ab, nicht nur vom Wort',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – der Slot bestimmt den Partner: Objekt → führen, Subjekt → entstehen/aufkommen. Die Funktion entscheidet.',
          onWrong: 'Frag, ob „Diskussion" geführt wird (Objekt) oder selbst geschieht (Subjekt) – daran hängt der Verbpartner.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  // ──────────────── LK · Rektion / Feinanalyse ────────────────
  {
    id: 's3-f4-rektion-lk', station: 3, format: 'F4', level: 'LK', source: 'corpus-template',
    kern: 'rektion',
    prompt: 'Bestimme die Rektion: In welchem Kasus steht „Entscheidung" als Dependent von „{{top.lemma}}"? Wähle und begründe.',
    metasprache: ['Rektion', 'Kasus', 'syntaktische Funktion'],
    corpusQuery: Q_ENTSCH_OBJ,
    bindings: { answer: [1] },
    payload: {
      sentence: 'Der Senat muss eine Entscheidung {{top.lemma}}.',
      options: [
        { id: 'o1', label: 'Akkusativobjekt' },
        { id: 'o2', label: 'Dativobjekt' },
        { id: 'o3', label: 'Genitivattribut' },
      ],
      requireJustification: true,
      justifyPrompt: 'Begründe die Rektion mit der Kasusprobe (wen/was?).',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      correctOptionId: 'o1',
      rubric: {
        criteria: ['Akkusativobjekt', 'erklärt die Rektion: das Verb „{{top.lemma}}" regiert den Akkusativ', 'Probe „wen/was?"'],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „{{top.lemma}}" regiert den Akkusativ; „eine Entscheidung" ist Akkusativobjekt (Probe: wen/was?).',
          onChoice: {
            '@selected': 'Wende die Kasusprobe an: „{{top.lemma}}" + wen/was? → Akkusativobjekt, nicht Dativ/Genitiv.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f4-satzglieder-lk', station: 3, format: 'F4', level: 'LK', source: 'static',
    kern: 'satzglied-feinanalyse',
    // Interaktive Satzgliedanalyse (Tippen→Label) statt reinem Freitext (AP21-QA
    // „im LK auch Aufgaben zum Schieben/Klicken"). Format F4, aber markTask →
    // LabelTask im Dispatcher; volle Analyse inkl. adverbialer Bestimmung.
    prompt: 'Vollständige Satzgliedanalyse: Weise jedem Satzteil seine Funktion zu – Subjekt (S), Prädikat (P), adverbiale Bestimmung (Adv) und Akkusativobjekt (O).',
    metasprache: ['Satzglied', 'Subjekt', 'Prädikat', 'adverbiale Bestimmung', 'Akkusativobjekt'],
    payload: {
      sentence: 'Der Senat trifft nach langer Beratung eine Entscheidung.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'Adv', 'O'],
      belegContext: { lemma: 'Senat', partner: 'treffen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Der Senat', tokenRange: [0, 2], label: 'S' },
        { text: 'trifft', tokenRange: [2, 3], label: 'P' },
        { text: 'nach langer Beratung', tokenRange: [3, 6], label: 'Adv' },
        { text: 'eine Entscheidung', tokenRange: [6, 8], label: 'O' },
      ],
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – S „Der Senat", P „trifft", adverbiale Bestimmung „nach langer Beratung", O „eine Entscheidung". Das Prädikat regiert das Akkusativobjekt; die adverbiale Bestimmung ist frei verschiebbar (Verschiebeprobe).',
          onWrong: 'Gehe die Satzglieder durch: Wer? (S) – was geschieht? (P) – wann/wie? (Adv) – wen/was? (O). Die Verschiebeprobe trennt die Satzglieder.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f5-genitivattribut-lk', station: 3, format: 'F5', level: 'LK', source: 'static',
    kern: 'genitivattribut',
    // AP21-QA Klick statt Freitext + mehr Variation: statt der reinen
    // Erklär-Tabelle jetzt eine eigenständige, anklickbare Aufgabe zum
    // Genitivattribut (LabelTask via markTask, wie s3-f4-satzglieder-lk).
    prompt: 'Markiere im Satz Subjekt (S), Prädikat (P), Objekt (O) und das Genitivattribut (Gen) – ein Attribut, das ein Nomen näher bestimmt.',
    metasprache: ['Satzglied', 'Genitivattribut', 'Subjekt', 'Prädikat', 'Objekt'],
    payload: {
      sentence: 'Die Begründung der Entscheidung überzeugt niemanden.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'O', 'Gen'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Die Begründung', tokenRange: [0, 2], label: 'S' },
        { text: 'der Entscheidung', tokenRange: [2, 4], label: 'Gen' },
        { text: 'überzeugt', tokenRange: [4, 5], label: 'P' },
        { text: 'niemanden.', tokenRange: [5, 6], label: 'O' },
      ],
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „Die Begründung" ist Subjekt, „der Entscheidung" als Genitivattribut bestimmt „Begründung" näher, „überzeugt" ist das Prädikat, „niemanden" das Akkusativobjekt. Das Genitivattribut ist Teil des Subjekts, aber eine eigene Satzgliedfunktion.',
          onWrong: 'Suche zuerst S/P/O wie gewohnt. Das Genitivattribut steckt INNERHALB des Subjekts und hängt an einem Nomen („Begründung"), nicht am Verb.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f4-rektion-dativ-lk', station: 3, format: 'F4', level: 'LK', source: 'static',
    kern: 'rektion-dativ',
    // AP21-QA Mehr Variation LK: bisher liefen beide Rektion-Items immer auf
    // „Akkusativobjekt" hinaus (Q_ENTSCH_OBJ/Q_BEITRAG_OBJ, beide ~OBJA). Dativ
    // ist kein erlaubter corpusQuery.relation-Code (RELATIONS-Whitelist) → hier
    // bewusst static mit einem echten Dativverb, Antwortoptionen nicht in
    // Standardreihenfolge (Dativobjekt an Position 2, nicht immer 1 richtig).
    prompt: 'Bestimme die Rektion: In welchem Kasus steht „dieser Entscheidung" als Dependent von „vertraut"? Wähle und begründe.',
    metasprache: ['Rektion', 'Kasus', 'syntaktische Funktion'],
    payload: {
      sentence: 'Der Vorstand vertraut dieser Entscheidung.',
      options: [
        { id: 'o1', label: 'Genitivattribut' },
        { id: 'o2', label: 'Dativobjekt' },
        { id: 'o3', label: 'Akkusativobjekt' },
      ],
      requireJustification: true,
      justifyPrompt: 'Begründe die Rektion mit der Kasusprobe (wem?).',
      belegContext: { lemma: 'Entscheidung', partner: 'vertrauen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      correctOptionId: 'o2',
      rubric: {
        criteria: ['Dativobjekt', 'erklärt die Rektion: das Verb „vertrauen" regiert den Dativ (nicht den Akkusativ)', 'Probe „wem?"'],
        minHits: 2,
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „vertrauen" regiert den Dativ; „dieser Entscheidung" ist Dativobjekt (Probe: wem?). Anders als „treffen"/„leisten" verlangt „vertrauen" keinen Akkusativ.',
          onChoice: {
            '@selected': 'Wende die Kasusprobe an: „vertrauen" + wem? → Dativobjekt. Nicht jedes Verb regiert den Akkusativ.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f4-satzglieder2-lk', station: 3, format: 'F4', level: 'LK', source: 'static',
    kern: 'satzglied-feinanalyse',
    prompt: 'Vollständige Satzgliedanalyse: Weise jedem Satzteil seine Funktion zu – Subjekt (S), Prädikat (P), adverbiale Bestimmung (Adv) und Akkusativobjekt (O).',
    metasprache: ['Satzglied', 'Subjekt', 'Prädikat', 'adverbiale Bestimmung', 'Akkusativobjekt'],
    payload: {
      sentence: 'Der Trainer lobt nach dem Spiel die Mannschaft.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'Adv', 'O'],
      belegContext: { lemma: 'Mannschaft', partner: 'loben', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Der Trainer', tokenRange: [0, 2], label: 'S' },
        { text: 'lobt', tokenRange: [2, 3], label: 'P' },
        { text: 'nach dem Spiel', tokenRange: [3, 6], label: 'Adv' },
        { text: 'die Mannschaft', tokenRange: [6, 8], label: 'O' },
      ],
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – S „Der Trainer", P „lobt", adverbiale Bestimmung „nach dem Spiel", O „die Mannschaft". Das Prädikat regiert das Akkusativobjekt; die adverbiale Bestimmung ist frei verschiebbar (Verschiebeprobe).',
          onWrong: 'Gehe die Satzglieder durch: Wer? (S) – was geschieht? (P) – wann? (Adv) – wen/was? (O). Die Verschiebeprobe trennt die Satzglieder.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },

  {
    id: 's3-f5-praedikativ-lk', station: 3, format: 'F5', level: 'LK', source: 'static',
    kern: 'praedikativ',
    // AP21-QA Klick statt Freitext + mehr Variation: eigenständige,
    // anklickbare Aufgabe zum Prädikativ statt reiner Erklär-Tabelle.
    prompt: 'Markiere im Satz Subjekt (S), das Kopulaverb als Prädikat (P) und das Prädikativ (Präd) – die Eigenschaft, die dem Subjekt zugeschrieben wird.',
    metasprache: ['Satzglied', 'Prädikativ', 'Kopulaverb', 'Subjekt'],
    payload: {
      sentence: 'Diese Entscheidung ist mutig.',
      markTask: 'S-P-O',
      labels: ['S', 'P', 'Präd'],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      spans: [
        { text: 'Diese Entscheidung', tokenRange: [0, 2], label: 'S' },
        { text: 'ist', tokenRange: [2, 3], label: 'P' },
        { text: 'mutig.', tokenRange: [3, 4], label: 'Präd' },
      ],
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „ist" ist das Kopulaverb (Prädikat), „mutig" das Prädikativ: es schreibt dem Subjekt „Diese Entscheidung" eine Eigenschaft zu, ohne – anders als ein Objekt – vom Verb regiert zu werden.',
          onWrong: 'Frage: Welches Verb verbindet nur (Kopulaverb, meist „sein/werden/bleiben")? Welches Wort danach beschreibt eine Eigenschaft des Subjekts? Das ist das Prädikativ.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },
]

export const station3 = { station: STATION, tasks: TASKS }
export default station3
