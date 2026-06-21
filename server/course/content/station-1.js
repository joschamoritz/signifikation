/**
 * server/course/content/station-1.js
 *
 * Konkrete Aufgaben-Items für Station ① „Wortpartner & Kollokationen" (AP4),
 * über ALLE vier Niveaustufen (DaZ / SekI / SekII / LK).
 *
 * Quellen: planning/Kurs-Station-1-Kollokationen.md, planning/Kurs-Differenzierung.md
 * (Zeile Station ①), planning/Kurs-Engine-Spec.md.
 *
 * Datenpolitik (Engine-Spec §1.4 + Blaupause §8):
 *   - logDice/Frequenz sind VOLATIL (DB-Rebuild) → datentragende Items sind
 *     `corpus-template`: sie deklarieren eine `corpusQuery` gegen wortprofil.db
 *     und füllen Werte/Belege erst zur Lauf-/Bauzeit. KEINE harten Zahlen im Item.
 *   - `static` nur dort, wo nichts Volatiles drinsteckt: DaZ-Alltagspaare, der
 *     kontrastive Übersetzen-Baustein, kuratierte DaZ-Markiersätze und der
 *     LK-Formel-Erklärtext.
 *   - DaZ/SekI: keine logDice-Zahlen (display.metric ≠ logDice/both, keine
 *     {{*.logDice}}-Platzhalter im Feedback) — Engine-Spec §5 / Lint-Regel 4.
 *
 * Engine-Direktiven (Spec §4; aufgelöst von der Render-/Fill-Engine in AP8/AP9):
 *   "@from:bindings"            – Kandidaten/Optionen aus answer+near+mid-Rängen
 *   "@from:bindings.answer"     – Lösungs-ID(s) aus den answer-Rängen
 *   "@from:bindings.contrastPair" – die zwei Kontrast-Einträge (häufigste ↔ typischste)
 *   "@from:bindings.tableRows"  – Datenzeilen (F5)
 *   { belegQuery: … }           – authentischer Satz aus belege.db (lemma+partner)
 *
 * Verifiziert gegen die echten DBs (2026-06-21): die Anker-Lemmata + Relationen
 * liefern reale Daten (Entscheidung/~OBJA: treffen 11,5; Fehler/ATTR: schwer 8,5
 * vs. groß 6,5 bei f 2047; etc.) — siehe course.content.station1.test.js.
 */

const STATION = {
  id: 's1',
  orderNo: 1,
  title: 'Wortpartner & Kollokationen',
  ipa: 'kɔlokaˈt͡si̯oːn',
  category: 'wortprofil',
  beamerConfig: {
    // Folien-Strecken aus tools/instagram-kollokation.html (Blaupause §5/§4a).
    slideTracks: ['spektrum', 'logdice', 'uebersetzen'],
  },
}

// Wiederkehrende Korpus-Abfragen (Engine-Spec §2).
const Q_ENTSCHEIDUNG_VERB = { lemma: 'Entscheidung', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_FEHLER_ADJ        = { lemma: 'Fehler',       pos: 'Substantiv', relation: 'ATTR',   minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

const TASKS = [
  // ════════════════════════════ DaZ ════════════════════════════
  // erkennen (rezeptiv) + kontrastiv · Metasprache „Wörter, die zusammenpassen"
  // Formate F1, F2 (+ kontrastiv F3). Keine Zahlen.

  {
    id: 's1-f1-alltag-daz', station: 1, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'wortpartner-erkennen',
    prompt: 'Welche Wörter gehören zusammen? Ziehe die Partner zusammen.',
    metasprache: ['Wörter, die zusammenpassen'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Zähne' },
        { id: 'a2', label: 'den Tisch' },
        { id: 'a3', label: 'eine Entscheidung' },
      ],
      candidates: [
        { id: 'c1', label: 'putzen' },
        { id: 'c2', label: 'decken' },
        { id: 'c3', label: 'treffen' },
      ],
      multiplePerAnchor: false,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1'], a2: ['c2'], a3: ['c3'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – diese Wörter passen zusammen: „Zähne putzen", „den Tisch decken", „eine Entscheidung treffen".',
          onWrong: 'Fast! Diese Wörter gehören als feste Partner zusammen. Sprich sie laut – was klingt richtig?',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'reder-2006', kontext: 'fachlich' }],
  },

  {
    id: 's1-f2-markieren-daz', station: 1, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'wortpartner-markieren',
    // Kuratierter, einfacher Satz (DaZ braucht kontrollierte Eingabe; echte
    // Korpussätze sind für Sprachanfänger oft zu komplex). Echte Belege werden
    // ab SekI über belegQuery eingespielt.
    prompt: 'Markiere die zwei Wörter, die zusammengehören.',
    metasprache: ['Wörter, die zusammenpassen'],
    payload: {
      sentence: 'Wir müssen heute eine Entscheidung treffen.',
      markTask: 'kollokation',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ text: 'Entscheidung treffen', tokenRange: [4, 6], label: 'Wortpartner' }] },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „Entscheidung treffen" gehört zusammen.',
          onWrong: 'Suche das Nomen und sein Verb: „Entscheidung … treffen".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bildung-rp-kollokationen', kontext: 'fachlich' }],
  },

  {
    id: 's1-f3-uebersetzen-daz', station: 1, format: 'F3', level: 'DaZ', source: 'static',
    kern: 'kontrast-uebersetzen',
    prompt: 'Was sagt man auf Deutsch? Wähle die richtige Verbindung – wörtlich übersetzen klappt nicht.',
    metasprache: ['Wörter, die zusammenpassen'],
    payload: {
      compareDimension: 'uebersetzung',
      frame: '___ Regen',
      variants: [
        { id: 'v1', label: 'starker', typical: true },
        { id: 'v2', label: 'strong (wörtlich aus dem Englischen)', typical: false },
      ],
      requireJustification: false,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      preferred: ['v1'],
      rubric: {
        criteria: ['wählt „starker Regen"', 'erkennt, dass die wörtliche Übersetzung nicht passt'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – im Deutschen sagt man „starker Regen". Im Englischen „heavy rain" (= schwerer Regen). Jede Sprache hat eigene Partner.',
          onWrong: 'Im Deutschen passt „starker Regen". Kollokationen kann man nicht Wort für Wort übersetzen.',
        },
      },
      merksatz: 'Wörterbücher übersetzen Wörter — Korpora übersetzen Konventionen.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'reder-2006', kontext: 'fachlich' }],
  },

  // ════════════════════════════ SekI ════════════════════════════
  // erkennen + selbst bilden · „Kollokation = typische Wortverbindung"
  // Formate F1–F3. typisch/untypisch + grobe Häufigkeit, OHNE logDice.

  {
    id: 's1-f1-entscheidung-verb-seki', station: 1, format: 'F1', level: 'SekI', source: 'corpus-template',
    kern: 'kollokation-zuordnen',
    prompt: 'Welche Verben passen typisch zu „Entscheidung"? Ordne die typischen Partner zu.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_ENTSCHEIDUNG_VERB,
    bindings: { answer: [1, 2], near: { rankRange: [4, 10] }, mid: { rankRange: [12, 20] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Entscheidung' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„Entscheidung {{top.lemma}}" ist eine sehr typische Verbindung – sie kommt im Korpus besonders oft vor.',
          onWrong: '„{{selected.lemma}}" passt seltener zu „Entscheidung". Typisch ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }],
  },

  {
    id: 's1-f2-entscheidung-markieren-seki', station: 1, format: 'F2', level: 'SekI', source: 'corpus-template',
    kern: 'kollokation-markieren',
    prompt: 'Markiere im echten Beispielsatz die typische Wortverbindung.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_ENTSCHEIDUNG_VERB,
    bindings: { answer: [1] },
    payload: {
      // Authentischer Satz aus belege.db zu Lemma + stärkstem Partner.
      belegQuery: { lemma: 'Entscheidung', partner: '{{top.lemma}}', source: 'belege.db' },
      markTask: 'kollokation',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ label: 'Kollokation' }], note: 'Spans aus geparstem Belegsatz; Engine liefert Token-Indizes für Lemma + {{top.lemma}}.' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: 'Genau – „Entscheidung {{top.lemma}}" ist die feste Verbindung in diesem Satz.',
          onWrong: 'Suche das Nomen „Entscheidung" und sein typisches Verb im Satz.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'beleg-satz' }],
  },

  {
    id: 's1-f3-entscheidung-vergleich-seki', station: 1, format: 'F3', level: 'SekI', source: 'corpus-template',
    kern: 'variantenvergleich-verb',
    prompt: '„eine Entscheidung ___" – welches Verb klingt natürlich? Wähle und begründe in einem Satz.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_ENTSCHEIDUNG_VERB,
    bindings: { answer: [1], contrastPair: ['logDice:1', 'logDice:last'] },
    payload: {
      frame: 'eine Entscheidung ___',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: true,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      preferred: '@from:bindings.answer',
      rubric: {
        criteria: ['wählt „{{top.lemma}}" als typisch', 'begründet mit dem Natürlichkeitsempfinden'],
        minHits: 1,
        accepts: ['Hinweis, dass die andere Variante „komisch"/ungewohnt klingt'],
      },
    },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„eine Entscheidung {{top.lemma}}" klingt natürlich – das ist die typische Verbindung.',
          onWrong: '„{{selected.lemma}}" hört man hier seltener. Typisch ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bildung-rp-kollokationen', kontext: 'fachlich' }],
  },

  // ════════════════════════════ SekII ════════════════════════════
  // Typikalität begründen · „frei – Kollokation – Idiom", Frequenz vs. logDice
  // Formate F3–F5. logDice sichtbar.

  {
    id: 's1-f3-fehler-vergleich-sek2', station: 1, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'variantenvergleich-adjektiv',
    prompt: 'Welches Adjektiv ist für „Fehler" typischer? Vergleiche und begründe – achte auf Häufigkeit UND Bindungsstärke.',
    metasprache: ['frei', 'Kollokation', 'Idiom', 'Frequenz', 'logDice', 'Assoziationsstärke'],
    corpusQuery: Q_FEHLER_ADJ,
    // Kontrast „häufigste vs. typischste": groß ist häufiger (f hoch, logDice
    // niedrig), schwer ist typischer (logDice hoch). Derselbe Pool, zwei Sortierungen.
    bindings: { answer: ['logDice:1'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      frame: '___ Fehler',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      preferred: '@from:bindings.answer',
      rubric: {
        criteria: [
          'wählt das logDice-stärkere Adjektiv („{{logDice:1.lemma}}") als typischer',
          'unterscheidet Rohhäufigkeit von Bindungsstärke (logDice)',
          'erkennt: die häufigere Verbindung („{{freq:1.lemma}}") ist nicht automatisch die typischere',
        ],
        minHits: 2,
        accepts: ['„{{freq:1.lemma}} Fehler" als nicht-falsch, aber weniger spezifisch anerkennen'],
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: '„{{logDice:1.lemma}} Fehler" bindet spezifisch (logDice {{logDice:1.logDice}}). „{{freq:1.lemma}} Fehler" ist zwar häufiger (f {{freq:1.frequency}}), aber „{{freq:1.lemma}}" passt zu fast allem.',
          onChoice: {
            '@selected': '„{{selected.lemma}}" hat logDice {{selected.logDice}}. Vergleiche: „{{logDice:1.lemma}}" ist mit logDice {{logDice:1.logDice}} stärker an „Fehler" gebunden – Häufigkeit allein entscheidet nicht.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }, { key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },

  {
    id: 's1-f4-fehler-luecke-sek2', station: 1, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'luecke-adjektiv',
    prompt: '„Ihm ist ein ___ Fehler unterlaufen." Wähle die typischste Option und begründe deine Wahl.',
    metasprache: ['Kollokation', 'Frequenz', 'logDice', 'Assoziationsstärke'],
    corpusQuery: Q_FEHLER_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['logDice:1', 'freq:1'], near: { rankRange: [3, 8] } },
    payload: {
      sentence: 'Ihm ist ein ___ Fehler unterlaufen.',
      // Optionen: typischstes + häufigstes Adjektiv + ein schwächerer Distraktor.
      options: '@from:bindings',
      requireJustification: true,
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: '@from:bindings.answer',
      rubric: {
        criteria: ['wählt „{{logDice:1.lemma}}"', 'begründet mit Bindungsstärke (logDice), nicht nur mit Häufigkeit'],
        minHits: 1,
        accepts: ['„{{freq:1.lemma}}" als verständlich, aber unspezifischer einordnen'],
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „{{logDice:1.lemma}} Fehler" ist am stärksten gebunden (logDice {{logDice:1.logDice}}).',
          onChoice: {
            '@selected': '„{{selected.lemma}} Fehler": logDice {{selected.logDice}}. „{{logDice:1.lemma}}" bindet mit {{logDice:1.logDice}} spezifischer an „Fehler". „{{freq:1.lemma}}" ist sogar häufiger (f {{freq:1.frequency}}), aber unspezifisch.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }],
  },

  {
    id: 's1-f5-fehler-datenblick-sek2', station: 1, format: 'F5', level: 'SekII', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Lies die Tabelle der Adjektiv-Verbindungen zu „Fehler" und beantworte die Fragen.',
    metasprache: ['Frequenz', 'logDice', 'Typikalität', 'Kookkurrenz'],
    corpusQuery: Q_FEHLER_ADJ,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'freq:1', 'logDice:3'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      reveal: ['frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Welche Verbindung ist am häufigsten?', kind: 'pick-row' },
        { id: 'q2', text: 'Welche ist am typischsten (höchster logDice)?', kind: 'pick-row' },
        { id: 'q3', text: 'Erkläre in 2–3 Sätzen, warum die häufigere nicht automatisch die typischere ist.', kind: 'explain' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q1: '@from:bindings.contrastPair[freq]',
        q2: '@from:bindings.contrastPair[logDice]',
        q3: {
          rubric: {
            criteria: [
              'logDice misst Bindungsstärke, nicht Rohhäufigkeit',
              'das häufigere Adjektiv passt zu vielen Nomen (unspezifisch)',
              'das typischere Adjektiv ist für „Fehler" charakteristisch',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Genau – die häufigste Verbindung ist nicht die typischste. logDice höher = stärker gebunden.',
          onWrong: 'Vergleiche die Spalten: hohe Frequenz heißt „kommt oft vor", hoher logDice heißt „spezifisch gebunden".',
        },
      },
      merksatz: 'Häufigkeit lügt – logDice misst Typizität.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'steyer-2000', kontext: 'korpus' }],
  },

  // ════════════════════════════ LK ════════════════════════════
  // quantifizieren & reflektieren · logDice, Assoziationsstärke, Korpusvergleich
  // Formate F5 + Formelidee. Volle Datenlage + Methodenkritik.

  {
    id: 's1-f5-fehler-datenblick-lk', station: 1, format: 'F5', level: 'LK', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Deute die Datenlage zu „Fehler": Welche Verbindung ist typisch, welche nur häufig – und was sagt der logDice NICHT aus?',
    metasprache: ['logDice', 'Assoziationsstärke', 'Korpusvergleich', 'Kookkurrenz'],
    corpusQuery: Q_FEHLER_ADJ,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'freq:1', 'logDice:3', 'logDice:last'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Ordne die Verbindungen grob auf der Skala (zufällig / erkennbar / typisch) ein.', kind: 'compare' },
        { id: 'q2', text: 'Begründe, warum eine seltene Verbindung trotzdem hohen logDice haben kann.', kind: 'explain' },
        { id: 'q3', text: 'Nenne zwei Dinge, die ein hoher logDice NICHT garantiert.', kind: 'explain' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q2: {
          rubric: {
            criteria: ['logDice gewichtet das Verhältnis gemeinsames/einzelnes Vorkommen', 'wenn A fast nur mit B auftritt, steigt logDice trotz geringer Rohfrequenz'],
            minHits: 1,
          },
        },
        q3: {
          rubric: {
            criteria: ['logDice sagt nichts über Bedeutung/Stilwert', 'nichts über Kontext/Angemessenheit', 'nichts über Korpus-Bias'],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt. logDice gewichtet Exklusivität: „{{logDice:1.lemma}}" (logDice {{logDice:1.logDice}}) ist für „Fehler" charakteristisch, „{{freq:1.lemma}}" (f {{freq:1.frequency}}) nur häufig. Die Zahl sagt aber nichts über Bedeutung, Kontext oder Korpus-Bias.',
          onWrong: 'Trenne zwei Fragen: „Wie oft?" (Frequenz) und „Wie exklusiv gebunden?" (logDice). Eine hohe Zahl ist kein Urteil über Bedeutung oder Angemessenheit.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's1-f5-formel-lk', station: 1, format: 'F5', level: 'LK', source: 'static',
    kern: 'logdice-formel',
    // Erklär-/Formel-Item: qualitativ, nicht volatil → bewusst static (Blaupause §8).
    prompt: 'Die logDice-Idee: Welche Größe macht eine seltene Verbindung trotzdem „stark"? Entscheide qualitativ.',
    metasprache: ['logDice', 'Assoziationsstärke'],
    payload: {
      table: [
        { verbindung: 'A kommt fast nur zusammen mit B vor', frequency: null, logDice: null },
        { verbindung: 'A kommt sehr oft vor, aber mit vielen Partnern', frequency: null, logDice: null },
      ],
      columns: ['verbindung'],
      questions: [
        { id: 'q1', text: 'Welcher Fall bekommt den höheren logDice – und warum?', kind: 'explain' },
      ],
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              'Fall 1 (exklusive Bindung) bekommt höheren logDice',
              'entscheidend ist das Verhältnis gemeinsames Vorkommen f(A,B) zu einzelnem Vorkommen f(A)+f(B)',
              'Rohhäufigkeit allein genügt nicht',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Richtig – logDice = 14 + log₂(2·f(A,B) / (f(A)+f(B))). Je exklusiver die Bindung, desto näher an 14 (theoret. Maximum). Reine Häufigkeit zählt nicht.',
          onWrong: 'Schau auf das Verhältnis: nicht „wie oft", sondern „wie exklusiv". Eine seltene, aber fast ausschließliche Verbindung schlägt eine häufige, beliebige.',
        },
      },
      merksatz: 'Nicht wie oft — sondern wie exklusiv.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },
]

export const station1 = { station: STATION, tasks: TASKS }
export default station1
