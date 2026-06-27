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
  title: 'Wer hängt an wem?',
  ipa: 'ˈzat͡sˌɡliːdɐ',
  category: 'wortprofil',
  beamerConfig: { slideTracks: [] },
}

const Q_ENTSCH_OBJ = { lemma: 'Entscheidung', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

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
    id: 's3-f5-feinanalyse-lk', station: 3, format: 'F5', level: 'LK', source: 'static',
    kern: 'slot-feinanalyse',
    prompt: 'Feinanalyse: Wie verändert sich die syntaktische Funktion von „Entscheidung" über Objekt, Subjekt und Prädikativ/Genitiv?',
    metasprache: ['Rektion', 'Prädikativ', 'Genitiv', 'syntaktische Funktion'],
    payload: {
      table: [
        { verbindung: 'eine Entscheidung treffen (Akkusativobjekt)', frequency: null, logDice: null },
        { verbindung: 'die Entscheidung fällt (Subjekt)', frequency: null, logDice: null },
        { verbindung: 'das ist eine kluge Entscheidung (Prädikativ)', frequency: null, logDice: null },
        { verbindung: 'die Begründung der Entscheidung (Genitivattribut)', frequency: null, logDice: null },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Ordne jeder Zeile die syntaktische Funktion zu und erkläre, wie sie den Verb-/Bezugspartner steuert.', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'Objekt → Handlungsverben (treffen/fällen)',
              'Subjekt → Vorgangsverben (fallen/ergehen)',
              'Prädikativ → Kopulaverb (sein) + Bewertung',
              'Genitivattribut → Bezug auf ein übergeordnetes Nomen',
              'die syntaktische Funktion (nicht das Wort) steuert die Partnerwahl',
            ],
            minHits: 3,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – jede syntaktische Funktion eröffnet einen anderen Partner-Slot. Das Wort bleibt, die Struktur entscheidet über Rektion und typische Verbindung.',
          onWrong: 'Bestimme je Zeile die Funktion (Objekt/Subjekt/Prädikativ/Genitiv) – daran hängt der jeweils typische Partner.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'schuetze-2018', kontext: 'fachlich' }],
  },
]

export const station3 = { station: STATION, tasks: TASKS }
export default station3
