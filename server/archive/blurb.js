/**
 * server/archive/blurb.js
 *
 * Erklärtext zu den Kollokationen — mehrere gleichwertige Formulierungen PRO
 * WORTART (kein individueller Text je Wort, aber auch kein einzelner Satz für
 * alle Wörter derselben Wortart mehr). Die Wahl der Variante ist pro Lemma
 * stabil (Hash des Lemmas), damit ein Wort bei jedem Aufruf denselben Text
 * zeigt (Cache/SSR-Determinismus) und benachbarte Einträge im Archiv nicht
 * wortgleich wirken. Geteilt zwischen SSR-Seite (render.js) und App-Tab
 * (ArchivTab.jsx), damit beide denselben Wortlaut zeigen.
 *
 * Reiner Text ohne HTML. Der SSR-Aufrufer übergibt ein bereits escaptes Lemma;
 * in React wird ohnehin beim Rendern escaped.
 */

/** Stabiler, einfacher String-Hash (FNV-artig) für die deterministische Wahl. */
function stableIndex(str, mod) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % mod
}

const BY_POS = {
  Substantiv: (w) => [
    `Als Substantiv steht „${w}“ im Korpus in charakteristischen Verbindungen – mit beschreibenden Adjektiven, mit Verben, zu denen es als Subjekt oder Objekt gehört, und mit eng verwandten weiteren Substantiven.`,
    `„${w}“ ist als Substantiv im Korpus fest in typische Wortverbindungen eingebunden: mit Adjektiven, die es näher bestimmen, mit Verben, denen es als Subjekt oder Objekt zugeordnet ist, sowie mit verwandten Substantiven.`,
    `Im Korpus tritt das Substantiv „${w}“ bevorzugt mit bestimmten Adjektiven, Verben und benachbarten Substantiven auf – die folgende Übersicht zeigt die charakteristischsten dieser Verbindungen.`,
  ],
  Verb: (w) => [
    `Als Verb verbindet sich „${w}“ im Korpus typischerweise mit bestimmten Subjekten und Objekten sowie mit charakteristischen Adverbien.`,
    `„${w}“ verbindet sich als Verb im Korpus bevorzugt mit bestimmten Subjekten und Objekten sowie mit typischen Adverbien.`,
    `Im Korpus tritt das Verb „${w}“ gemeinsam mit charakteristischen Subjekten, Objekten und Adverbien auf – die folgende Übersicht zeigt die auffälligsten dieser Verbindungen.`,
  ],
  Adjektiv: (w) => [
    `Als Adjektiv bestimmt „${w}“ im Korpus bevorzugt bestimmte Substantive näher und tritt mit typischen Verben und Gradangaben auf.`,
    `„${w}“ bestimmt als Adjektiv im Korpus bevorzugt bestimmte Substantive näher und verbindet sich mit typischen Verben und Gradangaben.`,
    `Im Korpus begleitet das Adjektiv „${w}“ bevorzugt bestimmte Substantive und tritt mit charakteristischen Verben und Gradangaben auf – die folgende Übersicht zeigt die auffälligsten dieser Verbindungen.`,
  ],
  Adverb: (w) => [
    `Als Adverb modifiziert „${w}“ im Korpus charakteristische Verben und Adjektive.`,
    `„${w}“ modifiziert als Adverb im Korpus charakteristische Verben und Adjektive.`,
    `Im Korpus tritt das Adverb „${w}“ bevorzugt gemeinsam mit bestimmten Verben und Adjektiven auf – die folgende Übersicht zeigt die auffälligsten dieser Verbindungen.`,
  ],
}

export function collocationBlurbLead(lemma, wortart) {
  const w = lemma
  // Wortart kann Zusätze tragen ("Substantiv, feminin") → erstes Wort.
  const posKey = String(wortart || '').split(/[,\s/]/)[0]
  const variants = BY_POS[posKey]?.(w)
  if (!variants) return `„${w}“ tritt im Korpus in charakteristischen Wortverbindungen (Kollokationen) auf.`
  return variants[stableIndex(w, variants.length)]
}

/** Gemeinsamer Zusatzsatz zur Methodik (ohne den POS-Lead). */
export const BLURB_LOGDICE_NOTE = 'Wie stark eine Verbindung gebunden ist, misst der logDice-Wert (theoretisches Maximum: 14).'
