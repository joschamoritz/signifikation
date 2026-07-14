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
  title: 'Wortpartner',
  ipa: 'kɔlokaˈt͡si̯oːn',
  category: 'wortprofil',
  beamerConfig: {
    // Folien-Strecken aus tools/instagram-kollokation.html (Blaupause §5/§4a).
    slideTracks: ['spektrum', 'logdice', 'uebersetzen'],
  },
}

// Wiederkehrende Korpus-Abfragen (Engine-Spec §2). Anker gegen die echten DBs
// verifiziert (2026-06-22): Hilfe/~OBJA leisten(ld10,4); Ziel/~OBJA
// erreichen(11,7)/verfolgen(10,5); Maßnahme/~OBJA ergreifen(10,7)/treffen(10,1);
// Mehrheit/ATTR absolut(ld10,4) typisch vs. groß(f9524) nur häufig.
const Q_ENTSCHEIDUNG_VERB = { lemma: 'Entscheidung', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_FEHLER_ADJ        = { lemma: 'Fehler',       pos: 'Substantiv', relation: 'ATTR',   minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_HILFE_VERB        = { lemma: 'Hilfe',         pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_VERANTWORTUNG_VERB = { lemma: 'Verantwortung', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_MASSNAHME_VERB    = { lemma: 'Maßnahme',      pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_MEHRHEIT_ADJ      = { lemma: 'Mehrheit',      pos: 'Substantiv', relation: 'ATTR',   minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
// AP21-QA Aufgaben-Ausbau: frische Anker, gegen wortprofil.db verifiziert (2026-07-01).
//   Ziel/~OBJA → erreichen(11,7) verfolgen(10,5) · Beitrag/~OBJA → leisten(12,7, dominant)
//   Problem/ATTR → groß(f6520) häufig vs. gesundheitlich(10,0)/technisch typisch
//   Erfolg/ATTR → groß(f6566) häufig vs. sportlich/durchschlagend typisch
//   Preis/ATTR  → hoch(f8411) häufig vs. niedrig(9,7) typisch gebunden
const Q_ZIEL_VERB    = { lemma: 'Ziel',    pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_BEITRAG_VERB = { lemma: 'Beitrag', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_PROBLEM_ADJ  = { lemma: 'Problem', pos: 'Substantiv', relation: 'ATTR',   minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_ERFOLG_ADJ   = { lemma: 'Erfolg',  pos: 'Substantiv', relation: 'ATTR',   minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }
const Q_PREIS_ADJ    = { lemma: 'Preis',   pos: 'Substantiv', relation: 'ATTR',   minFrequency: 5, limit: 25, filter: { singleWordOnly: true } }

// SekI „echte Entscheidung" (AP21-QA): Antwort-Pools ohne das generische „haben"
// (schwacher, unspezifischer Partner) + ABWEGIGE Distraktor-Lemmas eines anderen
// Nomens. Verifiziert gegen wortprofil.db (2026-06-27):
//   Entscheidung/~OBJA → treffen, fällen, begründen, herbeiführen, überlassen
//   Verantwortung/~OBJA → übernehmen, tragen, wahrnehmen, nachkommen, entziehen
//   Lied/~OBJA  → singen, anstimmen, komponieren, mitsingen, intonieren (Distraktoren)
//   Koffer/~OBJA → packen, auspacken, schleppen, schmuggeln, transportieren (Distraktoren)
const Q_ENTSCHEIDUNG_VERB_CLEAN  = { ...Q_ENTSCHEIDUNG_VERB,  exclude: ['haben'] }
const Q_VERANTWORTUNG_VERB_CLEAN = { ...Q_VERANTWORTUNG_VERB, exclude: ['haben', 'werden'] }
const Q_LIED_DISTRACTOR   = { lemma: 'Lied',   pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, exclude: ['haben', 'schreiben', 'spielen', 'hören', 'widmen', 'präsentieren', 'interpretieren', 'vortragen'], filter: { singleWordOnly: true } }
const Q_KOFFER_DISTRACTOR = { lemma: 'Koffer', pos: 'Substantiv', relation: '~OBJA', minFrequency: 5, limit: 25, exclude: ['haben', 'packt', 'abgestellt', 'öffnen', 'schnappen', 'mitnehmen'], filter: { singleWordOnly: true } }

const TASKS = [
  // ════════════════════════════ DaZ ════════════════════════════
  // erkennen (rezeptiv) + kontrastiv · Metasprache „Wörter, die zusammenpassen"
  // Formate F1, F2 (+ kontrastiv F3). Keine Zahlen.

  {
    id: 's1-f1-alltag-daz', station: 1, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'wortpartner-erkennen',
    prompt: 'Welche Wörter gehören zusammen? Ziehe jeden Partner auf das Wort, zu dem er passt.',
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
    // ab SekI über belegQuery eingespielt. Bewusst ANDERES Wortpaar als in F1
    // („Fehler machen" statt „Entscheidung treffen"), damit die Lösung von F1
    // nicht 1:1 wiederholt wird — und es führt das Lemma „Fehler" der höheren
    // Stufen ein.
    prompt: 'Markiere die zwei Wörter, die ein festes Wortpaar bilden.',
    metasprache: ['Wörter, die zusammenpassen'],
    payload: {
      sentence: 'Heute darf ich keinen Fehler machen.',
      markTask: 'kollokation',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ text: 'Fehler machen', tokenRange: [4, 6], label: 'Wortpartner' }] },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „Fehler machen" gehört als festes Wortpaar zusammen.',
          onWrong: 'Suche das Nomen und sein Verb: „Fehler … machen".',
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
        // Distraktor ohne verräterischen Klammer-Hinweis — die Erklärung (heavy
        // rain wörtlich) trägt das Feedback, nicht die Antwortoption (AP21-QA).
        { id: 'v2', label: 'schwerer', typical: false },
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

  // — zweite Varianten (Untervarianten b) desselben Aufgabentyps) —
  {
    id: 's1-f1-alltag2-daz', station: 1, format: 'F1', level: 'DaZ', source: 'static',
    kern: 'wortpartner-erkennen',
    prompt: 'Welche Wörter gehören zusammen? Ziehe jeden Partner auf das Wort, zu dem er passt.',
    metasprache: ['Wörter, die zusammenpassen'],
    payload: {
      anchors: [
        { id: 'a1', label: 'Musik' },
        { id: 'a2', label: 'ein Foto' },
        { id: 'a3', label: 'Sport' },
      ],
      candidates: [
        { id: 'c1', label: 'hören' },
        { id: 'c2', label: 'machen' },
        { id: 'c3', label: 'treiben' },
      ],
      multiplePerAnchor: false,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: ['c1'], a2: ['c2'], a3: ['c3'] } },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Genau – „Musik hören", „ein Foto machen", „Sport treiben". Diese Wörter sind feste Partner.',
          onWrong: 'Fast! Sprich die Paare laut – was klingt richtig? „Musik … hören".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'reder-2006', kontext: 'fachlich' }],
  },

  {
    id: 's1-f2-markieren2-daz', station: 1, format: 'F2', level: 'DaZ', source: 'static',
    kern: 'wortpartner-markieren',
    prompt: 'Markiere die zwei Wörter, die ein festes Wortpaar bilden.',
    metasprache: ['Wörter, die zusammenpassen'],
    payload: {
      sentence: 'Am Abend muss ich die Hausaufgaben machen.',
      markTask: 'kollokation',
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { spans: [{ text: 'Hausaufgaben machen', tokenRange: [5, 7], label: 'Wortpartner' }] },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – „Hausaufgaben machen" gehört als festes Wortpaar zusammen.',
          onWrong: 'Suche das Nomen und sein Verb: „Hausaufgaben … machen".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bildung-rp-kollokationen', kontext: 'fachlich' }],
  },

  {
    id: 's1-f3-uebersetzen2-daz', station: 1, format: 'F3', level: 'DaZ', source: 'static',
    kern: 'kontrast-uebersetzen',
    prompt: 'Was sagt man auf Deutsch? Wähle die richtige Verbindung – wörtlich übersetzen klappt nicht.',
    metasprache: ['Wörter, die zusammenpassen'],
    payload: {
      compareDimension: 'uebersetzung',
      frame: 'Ich ___ Hunger.',
      variants: [
        { id: 'v1', label: 'habe', typical: true },
        // Distraktor ohne verräterischen Klammer-Hinweis (Erklärung im Feedback).
        { id: 'v2', label: 'bin', typical: false },
      ],
      requireJustification: false,
    },
    display: { showMetrics: false, metric: 'none' },
    solution: {
      preferred: ['v1'],
      rubric: {
        criteria: ['wählt „habe Hunger"', 'erkennt, dass die wörtliche Übersetzung nicht passt'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        DaZ: {
          onCorrect: 'Richtig – im Deutschen sagt man „Hunger haben". Im Englischen „to be hungry" (= Hunger sein). Jede Sprache hat eigene Partner.',
          onWrong: 'Im Deutschen passt „Hunger haben", nicht „Hunger sein". Kollokationen kann man nicht Wort für Wort übersetzen.',
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
    // AP21-QA: echte Entscheidung statt „alles passt irgendwie" — 5 echte
    // Kollokatoren + 5 abwegige Verben aus „Lied" (Musik), die klar NICHT zu
    // „Entscheidung" gehören. SuS müssen wirklich unterscheiden.
    prompt: 'Welche Verben sind typische Partner von „Entscheidung"? Ziehe nur die passenden auf das Wort — manche Verben gehören gar nicht dazu.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_ENTSCHEIDUNG_VERB_CLEAN,
    distractorQuery: Q_LIED_DISTRACTOR,
    bindings: { answer: [1, 2, 3, 4, 5], distractors: { rankRange: [1, 5] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Entscheidung' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
      // Kollokations-Aufgabe → Beleg zeigt die Objekt-Kollokation „Entscheidung treffen".
      belegContext: { lemma: 'Entscheidung', partner: 'treffen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„Entscheidung {{top.lemma}}" ist eine typische Verbindung – diese Verben stehen im Korpus oft mit „Entscheidung".',
          onWrong: '„{{selected.lemma}}" ist kein typischer Partner von „Entscheidung". Typisch ist z. B. „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }],
  },

  {
    id: 's1-f1-verantwortung-verb-seki', station: 1, format: 'F1', level: 'SekI', source: 'corpus-template',
    kern: 'kollokation-zuordnen',
    // Distraktoren aus „Koffer" (Gepäck-Verben) — keine Überschneidung mit den
    // Verantwortung-Partnern (übernehmen/tragen/…).
    prompt: 'Welche Verben sind typische Partner von „Verantwortung"? Ziehe nur die passenden auf das Wort — manche Verben gehören gar nicht dazu.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_VERANTWORTUNG_VERB_CLEAN,
    distractorQuery: Q_KOFFER_DISTRACTOR,
    bindings: { answer: [1, 2, 3, 4, 5], distractors: { rankRange: [1, 5] } },
    payload: {
      anchors: [{ id: 'a1', label: 'Verantwortung' }],
      candidates: '@from:bindings',
      multiplePerAnchor: true,
      // „Verantwortung tragen" liefert vollständigere Belegsätze als „übernehmen".
      belegContext: { lemma: 'Verantwortung', partner: 'tragen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { map: { a1: '@from:bindings.answer' } },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„Verantwortung {{top.lemma}}" ist eine typische Verbindung – diese Verben stehen im Korpus oft mit „Verantwortung".',
          onWrong: '„{{selected.lemma}}" ist kein typischer Partner von „Verantwortung". Typisch ist z. B. „{{top.lemma}}".',
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
    id: 's1-f3-hilfe-vergleich-seki', station: 1, format: 'F3', level: 'SekI', source: 'corpus-template',
    kern: 'variantenvergleich-verb',
    // Single-Choice-Begründung (statt Freitext): SekI kreuzt die Begründung an.
    prompt: '„Hilfe ___" – welches Verb ist der typische Partner? Wähle das Verb und kreuze die passende Begründung an.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_HILFE_VERB,
    bindings: { answer: [1], contrastPair: ['logDice:1', 'logDice:last'] },
    payload: {
      frame: 'Hilfe ___',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: false,
      justificationChoice: {
        prompt: 'Woran erkennst du den typischen Partner?',
        options: [
          { id: 'r1', label: 'Weil sich diese Verbindung vertraut anhört – man hört und liest sie oft so.', correct: true, feedback: 'Genau – die typische Verbindung klingt vertraut, weil man sie im Deutschen oft verwendet. (Genau das zeigt später auch das Korpus.)' },
          { id: 'r2', label: 'Weil das Verb kürzer und einfacher ist.', correct: false, feedback: 'Die Länge des Verbs entscheidet nicht – es geht darum, welche Wörter man üblicherweise zusammen verwendet.' },
          { id: 'r3', label: 'Beide Verben sind ohnehin gleich üblich.', correct: false, feedback: 'Nicht ganz – einen der Partner hört man mit „Hilfe" deutlich häufiger als den anderen.' },
        ],
      },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { preferred: '@from:bindings.answer' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„Hilfe {{top.lemma}}" klingt natürlich – das ist die typische Verbindung.',
          onWrong: '„{{selected.lemma}}" hört man hier seltener. Typisch ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bildung-rp-kollokationen', kontext: 'fachlich' }],
  },

  {
    id: 's1-f3-massnahme-vergleich-seki', station: 1, format: 'F3', level: 'SekI', source: 'corpus-template',
    kern: 'variantenvergleich-verb',
    prompt: '„Maßnahme ___" – welches Verb ist der typische Partner? Wähle das Verb und kreuze die passende Begründung an.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_MASSNAHME_VERB,
    bindings: { answer: [1], contrastPair: ['logDice:1', 'logDice:last'] },
    payload: {
      frame: 'Maßnahme ___',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: false,
      justificationChoice: {
        prompt: 'Warum ist diese Verbindung typischer?',
        options: [
          { id: 'r1', label: 'Weil man diese Verbindung im Deutschen oft so verwendet – sie klingt typisch.', correct: true, feedback: 'Richtig – typische Partner verwendet man im Deutschen regelmäßig zusammen. (Im Korpus zeigt sich das später als häufiges gemeinsames Vorkommen.)' },
          { id: 'r2', label: 'Weil das Wort vornehmer klingt.', correct: false, feedback: 'Der Klang allein entscheidet nicht; entscheidend ist, welche Wörter man üblicherweise zusammen verwendet.' },
          { id: 'r3', label: 'Weil man das Verb auch mit jedem anderen Nomen nutzen kann.', correct: false, feedback: 'Im Gegenteil – ein typischer Partner bindet sich gerade an dieses Nomen, nicht an beliebige.' },
        ],
      },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { preferred: '@from:bindings.answer' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„Maßnahme {{top.lemma}}" ist die typische Verbindung.',
          onWrong: '„{{selected.lemma}}" passt hier seltener. Typisch ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }],
  },

  {
    id: 's1-f3-ziel-vergleich-seki', station: 1, format: 'F3', level: 'SekI', source: 'corpus-template',
    kern: 'variantenvergleich-verb',
    prompt: '„Ein Ziel ___" – welches Verb ist der typische Partner? Wähle das Verb und kreuze die passende Begründung an.',
    metasprache: ['Kollokation', 'typische Wortverbindung'],
    corpusQuery: Q_ZIEL_VERB,
    bindings: { answer: [1], contrastPair: ['logDice:1', 'logDice:last'] },
    payload: {
      frame: 'ein Ziel ___',
      compareDimension: 'typikalitaet',
      variants: '@from:bindings.contrastPair',
      requireJustification: false,
      justificationChoice: {
        prompt: 'Woran erkennst du den typischen Partner?',
        options: [
          { id: 'r1', label: 'Weil man diese Verbindung im Deutschen oft so verwendet – sie klingt typisch.', correct: true, feedback: 'Richtig – „ein Ziel erreichen/verfolgen" verwendet man regelmäßig zusammen. (Im Korpus zeigt sich das später als häufiges gemeinsames Vorkommen.)' },
          { id: 'r2', label: 'Weil das Verb allgemeiner und für alles brauchbar ist.', correct: false, feedback: 'Im Gegenteil – ein typischer Partner bindet sich gerade an dieses Nomen, nicht an beliebige.' },
          { id: 'r3', label: 'Weil beide Verben ohnehin gleich üblich sind.', correct: false, feedback: 'Nicht ganz – einen der Partner hört man mit „Ziel" deutlich häufiger als den anderen.' },
        ],
      },
      // Kollokations-Aufgabe → Beleg zeigt die Objekt-Kollokation „Ziel erreichen".
      belegContext: { lemma: 'Ziel', partner: 'erreichen', limit: 3 },
    },
    display: { showMetrics: false, metric: 'none' },
    solution: { preferred: '@from:bindings.answer' },
    feedback: {
      byLevel: {
        SekI: {
          onCorrect: '„Ziel {{top.lemma}}" ist die typische Verbindung.',
          onWrong: '„{{selected.lemma}}" passt hier seltener. Typisch ist „{{top.lemma}}".',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }],
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
      // Attributive Adjazenz-Belege „schwerer Fehler" (die typische Verbindung).
      belegContext: { lemma: 'Fehler', partner: 'schwer', adjacent: true, limit: 3 },
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
    id: 's1-f4-mehrheit-luecke-sek2', station: 1, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'luecke-adjektiv',
    // Frischer Anker mit demselben häufig-≠-typisch-Kontrast wie „Fehler":
    // „groß" ist häufiger (f hoch), „absolut" spezifischer gebunden (logDice hoch).
    prompt: '„Bei der Abstimmung erreichte der Antrag eine ___ Mehrheit." Wähle die am spezifischsten gebundene Option und begründe deine Wahl.',
    metasprache: ['Kollokation', 'Frequenz', 'logDice', 'Assoziationsstärke'],
    corpusQuery: Q_MEHRHEIT_ADJ,
    bindings: { answer: ['logDice:1'], contrastPair: ['logDice:1', 'freq:1'], near: { rankRange: [3, 8] } },
    payload: {
      sentence: 'Bei der Abstimmung erreichte der Antrag eine ___ Mehrheit.',
      options: '@from:bindings',
      requireJustification: true,
      // Attributive Adjazenz-Belege „absolute Mehrheit".
      belegContext: { lemma: 'Mehrheit', partner: 'absolut', adjacent: true, limit: 3 },
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: '@from:bindings.answer',
      rubric: {
        criteria: ['wählt „{{logDice:1.lemma}}"', 'begründet mit Bindungsstärke (logDice), nicht nur mit Häufigkeit'],
        minHits: 1,
        accepts: ['„{{freq:1.lemma}} Mehrheit" als korrekt, aber unspezifischer einordnen'],
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „{{logDice:1.lemma}} Mehrheit" ist am stärksten gebunden (logDice {{logDice:1.logDice}}).',
          onChoice: {
            '@selected': '„{{selected.lemma}} Mehrheit": logDice {{selected.logDice}}. „{{logDice:1.lemma}}" bindet mit {{logDice:1.logDice}} spezifischer; „{{freq:1.lemma}}" ist zwar häufiger (f {{freq:1.frequency}}), aber unspezifischer.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }, { key: 'bubenhofer-2015', kontext: 'fachlich' }],
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

  {
    id: 's1-f3-problem-vergleich-sek2', station: 1, format: 'F3', level: 'SekII', source: 'corpus-template',
    kern: 'variantenvergleich-adjektiv',
    prompt: 'Welches Adjektiv ist für „Problem" typischer? Vergleiche „großes Problem" mit der spezifischer gebundenen Verbindung und begründe – achte auf Häufigkeit UND Bindungsstärke.',
    metasprache: ['frei', 'Kollokation', 'Frequenz', 'logDice', 'Assoziationsstärke'],
    corpusQuery: Q_PROBLEM_ADJ,
    // „groß" ist häufiger (f hoch, logDice niedrig), das spezifische Adjektiv ist
    // typischer (logDice hoch). Derselbe Pool, zwei Sortierungen.
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
          'wählt das logDice-stärkere Adjektiv („{{logDice:1.lemma}}") als typischer',
          'unterscheidet Rohhäufigkeit von Bindungsstärke (logDice)',
          'erkennt: „{{freq:1.lemma}}" ist häufiger, passt aber zu fast jedem Nomen',
        ],
        minHits: 2,
        accepts: ['„{{freq:1.lemma}} Problem" als nicht-falsch, aber unspezifisch anerkennen'],
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: '„{{logDice:1.lemma}} Problem" bindet spezifisch (logDice {{logDice:1.logDice}}). „{{freq:1.lemma}} Problem" ist zwar häufiger (f {{freq:1.frequency}}), aber „{{freq:1.lemma}}" passt zu fast allem.',
          onChoice: {
            '@selected': '„{{selected.lemma}}" hat logDice {{selected.logDice}}. Vergleiche: „{{logDice:1.lemma}}" ist mit logDice {{logDice:1.logDice}} stärker an „Problem" gebunden – Häufigkeit allein entscheidet nicht.',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }, { key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },

  {
    id: 's1-f4-ziel-luecke-sek2', station: 1, format: 'F4', level: 'SekII', source: 'corpus-template',
    kern: 'luecke-verb',
    prompt: '„Um konkurrenzfähig zu bleiben, will das Unternehmen dieses ehrgeizige Ziel unbedingt ___." Wähle den am stärksten gebundenen Verbpartner und begründe deine Wahl.',
    metasprache: ['Kollokation', 'Frequenz', 'logDice', 'Assoziationsstärke'],
    corpusQuery: Q_ZIEL_VERB,
    bindings: { answer: ['logDice:1'], contrastPair: ['logDice:1', 'logDice:last'], near: { rankRange: [3, 8] } },
    payload: {
      sentence: 'Um konkurrenzfähig zu bleiben, will das Unternehmen dieses ehrgeizige Ziel unbedingt ___.',
      options: '@from:bindings',
      requireJustification: true,
      // Objekt-Kollokation → Belege zeigen „Ziel erreichen" im echten Satz.
      belegContext: { lemma: 'Ziel', partner: 'erreichen', limit: 3 },
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      correctOptionId: '@from:bindings.answer',
      rubric: {
        criteria: ['wählt „{{logDice:1.lemma}}"', 'begründet mit Bindungsstärke (logDice), nicht nur mit Häufigkeit'],
        minHits: 1,
      },
    },
    feedback: {
      byLevel: {
        SekII: {
          onCorrect: 'Richtig – „ein Ziel {{logDice:1.lemma}}" ist am stärksten gebunden (logDice {{logDice:1.logDice}}).',
          onChoice: {
            '@selected': '„Ziel {{selected.lemma}}": logDice {{selected.logDice}}. „{{logDice:1.lemma}}" bindet mit {{logDice:1.logDice}} spezifischer an „Ziel".',
          },
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'steyer-2000', kontext: 'korpus' }, { key: 'bubenhofer-2015', kontext: 'fachlich' }],
  },

  {
    id: 's1-f5-preis-datenblick-sek2', station: 1, format: 'F5', level: 'SekII', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Lies die Tabelle der Adjektiv-Verbindungen zu „Preis" und beantworte die Fragen.',
    metasprache: ['Frequenz', 'logDice', 'Typikalität', 'Kookkurrenz'],
    corpusQuery: Q_PREIS_ADJ,
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
              'das typischere Adjektiv ist für „Preis" charakteristisch',
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
    id: 's1-f5-mehrheit-datenblick-lk', station: 1, format: 'F5', level: 'LK', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Deute die Datenlage zu „Mehrheit": Welche Verbindung ist typisch gebunden, welche nur häufig – und was folgt daraus methodisch?',
    metasprache: ['logDice', 'Assoziationsstärke', 'Korpusvergleich', 'Kookkurrenz'],
    corpusQuery: Q_MEHRHEIT_ADJ,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'freq:1', 'logDice:3', 'logDice:last'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Ordne die Verbindungen grob auf der Skala (zufällig / erkennbar / typisch) ein.', kind: 'compare' },
        { id: 'q2', text: 'Begründe, warum die häufigste Verbindung nicht automatisch die typischer gebundene ist.', kind: 'explain' },
        { id: 'q3', text: 'Nenne zwei Dinge, die ein hoher logDice NICHT garantiert.', kind: 'explain' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q2: {
          rubric: {
            criteria: [
              'Frequenz misst nur Rohhäufigkeit',
              'logDice gewichtet die Exklusivität der Bindung',
              'die häufigere Verbindung verteilt sich auf viele Nomen (unspezifisch)',
            ],
            minHits: 2,
          },
        },
        q3: {
          rubric: {
            criteria: ['nichts über Bedeutung/Stilwert', 'nichts über Kontext/Angemessenheit', 'nichts über Korpus-Bias'],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt. „{{logDice:1.lemma}}" (logDice {{logDice:1.logDice}}) ist für „Mehrheit" charakteristisch gebunden, „{{freq:1.lemma}}" (f {{freq:1.frequency}}) nur häufig. Die Zahl sagt nichts über Bedeutung, Kontext oder Korpus-Bias.',
          onWrong: 'Trenne „Wie oft?" (Frequenz) von „Wie exklusiv gebunden?" (logDice). Eine hohe Zahl ist kein Urteil über Bedeutung oder Angemessenheit.',
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

  {
    id: 's1-f5-problem-datenblick-lk', station: 1, format: 'F5', level: 'LK', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Deute die Datenlage zu „Problem": Welche Verbindung ist typisch gebunden, welche nur häufig – und was folgt daraus methodisch?',
    metasprache: ['logDice', 'Assoziationsstärke', 'Korpusvergleich', 'Kookkurrenz'],
    corpusQuery: Q_PROBLEM_ADJ,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'freq:1', 'logDice:3', 'logDice:last'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Ordne die Verbindungen grob auf der Skala (zufällig / erkennbar / typisch) ein.', kind: 'compare' },
        { id: 'q2', text: 'Begründe, warum das häufigste Adjektiv nicht automatisch das typischer gebundene ist.', kind: 'explain' },
        { id: 'q3', text: 'Nenne zwei Dinge, die ein hoher logDice NICHT garantiert.', kind: 'explain' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q2: {
          rubric: {
            criteria: [
              'Frequenz misst nur Rohhäufigkeit',
              'logDice gewichtet die Exklusivität der Bindung',
              'das häufigere Adjektiv („{{freq:1.lemma}}") verteilt sich auf viele Nomen (unspezifisch)',
            ],
            minHits: 2,
          },
        },
        q3: {
          rubric: {
            criteria: ['nichts über Bedeutung/Stilwert', 'nichts über Kontext/Angemessenheit', 'nichts über Korpus-Bias'],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt. „{{logDice:1.lemma}}" (logDice {{logDice:1.logDice}}) ist für „Problem" charakteristisch gebunden, „{{freq:1.lemma}}" (f {{freq:1.frequency}}) nur häufig. Die Zahl sagt nichts über Bedeutung, Kontext oder Korpus-Bias.',
          onWrong: 'Trenne „Wie oft?" (Frequenz) von „Wie exklusiv gebunden?" (logDice). Eine hohe Zahl ist kein Urteil über Bedeutung oder Angemessenheit.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's1-f5-erfolg-datenblick-lk', station: 1, format: 'F5', level: 'LK', source: 'corpus-template',
    kern: 'haeufig-vs-typisch',
    prompt: 'Deute die Datenlage zu „Erfolg": Welche Adjektiv-Verbindung ist typisch, welche nur häufig – und was sagt der logDice NICHT aus?',
    metasprache: ['logDice', 'Assoziationsstärke', 'Korpusvergleich', 'Kookkurrenz'],
    corpusQuery: Q_ERFOLG_ADJ,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'freq:1', 'logDice:3', 'logDice:last'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Ordne die Verbindungen grob auf der Skala (zufällig / erkennbar / typisch) ein.', kind: 'compare' },
        { id: 'q2', text: 'Begründe, warum eine seltenere Verbindung trotzdem hohen logDice haben kann.', kind: 'explain' },
        { id: 'q3', text: 'Nenne zwei Dinge, die ein hoher logDice NICHT garantiert.', kind: 'explain' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q2: {
          rubric: {
            criteria: ['logDice gewichtet das Verhältnis gemeinsames/einzelnes Vorkommen', 'wenn A fast nur mit B auftritt, steigt logDice trotz geringerer Rohfrequenz'],
            minHits: 1,
          },
        },
        q3: {
          rubric: {
            criteria: ['nichts über Bedeutung/Stilwert', 'nichts über Kontext/Angemessenheit', 'nichts über Korpus-Bias'],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt. logDice gewichtet Exklusivität: „{{logDice:1.lemma}}" (logDice {{logDice:1.logDice}}) ist für „Erfolg" charakteristisch, „{{freq:1.lemma}}" (f {{freq:1.frequency}}) nur häufig. Die Zahl sagt aber nichts über Bedeutung, Kontext oder Korpus-Bias.',
          onWrong: 'Trenne zwei Fragen: „Wie oft?" (Frequenz) und „Wie exklusiv gebunden?" (logDice). Eine hohe Zahl ist kein Urteil über Bedeutung oder Angemessenheit.',
        },
      },
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },

  {
    id: 's1-f5-beitrag-datenblick-lk', station: 1, format: 'F5', level: 'LK', source: 'corpus-template',
    kern: 'exklusive-bindung',
    // Sonderfall: „leisten" ist bei „Beitrag" zugleich das häufigste UND das am
    // stärksten gebundene Verb (logDice sehr hoch). Genau das ist der LK-Aha:
    // manche Partner sind hochfrequent UND exklusiv – dann fallen freq und logDice
    // zusammen. Frage zielt auf die Deutung dieses Sonderfalls.
    prompt: 'Deute die Datenlage zu „Beitrag": Ein Verb ist zugleich das häufigste und das am stärksten gebundene. Was bedeutet dieser Sonderfall – und wo läge der Unterschied bei einem Nomen wie „Problem"?',
    metasprache: ['logDice', 'Assoziationsstärke', 'Frequenz', 'Exklusivität'],
    corpusQuery: Q_BEITRAG_VERB,
    bindings: { tableRows: ['logDice:1', 'logDice:2', 'logDice:3', 'logDice:last'], contrastPair: ['freq:1', 'logDice:1'] },
    payload: {
      table: '@from:bindings.tableRows',
      columns: ['verbindung', 'frequency', 'logDice'],
      questions: [
        { id: 'q1', text: 'Was bedeutet es, wenn dasselbe Verb zugleich das häufigste und das am stärksten gebundene ist?', kind: 'explain' },
        { id: 'q2', text: 'Bei „großes Problem" fallen häufigste und typischste Verbindung auseinander, bei „Beitrag leisten" nicht. Erkläre den Unterschied.', kind: 'explain' },
      ],
    },
    display: { showMetrics: true, metric: 'both' },
    solution: {
      answers: {
        q1: {
          rubric: {
            criteria: [
              '„{{logDice:1.lemma}}" tritt sehr oft mit „Beitrag" auf UND fast nur mit „Beitrag" (exklusiv)',
              'hohe Frequenz und hoher logDice schließen sich nicht aus – sie können zusammenfallen',
            ],
            minHits: 1,
          },
        },
        q2: {
          rubric: {
            criteria: [
              'bei „Problem" ist das häufigste Adjektiv („groß") unspezifisch (passt zu vielem) → niedriger logDice',
              'bei „Beitrag" ist der häufigste Partner zugleich exklusiv gebunden → hoher logDice',
              'die Frage ist immer: verteilt sich der Partner auf viele Nomen oder bindet er spezifisch?',
            ],
            minHits: 2,
          },
        },
      },
    },
    feedback: {
      byLevel: {
        LK: {
          onCorrect: 'Korrekt – „{{logDice:1.lemma}}" bindet extrem stark an „Beitrag" (logDice {{logDice:1.logDice}}) und ist dennoch hochfrequent: hohe Frequenz und hohe Exklusivität können zusammenfallen. Bei „großes Problem" tun sie es nicht, weil „groß" zu fast jedem Nomen passt.',
          onWrong: 'Frag nicht nur „wie oft", sondern „wie exklusiv". „{{logDice:1.lemma}}" ist beides; „groß" ist häufig, aber unspezifisch.',
        },
      },
      merksatz: 'Häufig und exklusiv schließen sich nicht aus.',
      tonalitaet: 'woerterbuch-nuechtern',
    },
    beleg: [{ key: 'bubenhofer-2015', kontext: 'fachlich' }, { key: 'luedeling-walter-2009', kontext: 'fachlich' }],
  },
]

export const station1 = { station: STATION, tasks: TASKS }
export default station1
