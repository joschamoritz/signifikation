/**
 * server/archive/blurb.js
 *
 * Erklärtext zu den Kollokationen — ein Template PRO WORTART (kein individueller
 * Text je Wort). Das Lemma wird eingesetzt. Geteilt zwischen SSR-Seite
 * (render.js) und App-Tab (ArchivTab.jsx), damit beide denselben Wortlaut zeigen.
 *
 * Reiner Text ohne HTML. Der SSR-Aufrufer übergibt ein bereits escaptes Lemma;
 * in React wird ohnehin beim Rendern escaped.
 */
export function collocationBlurbLead(lemma, wortart) {
  const w = lemma
  const byPos = {
    Substantiv: `Als Substantiv steht „${w}" im Korpus in charakteristischen Verbindungen — mit beschreibenden Adjektiven, mit Verben, zu denen es als Subjekt oder Objekt gehört, und mit eng verwandten weiteren Substantiven.`,
    Verb: `Als Verb verbindet sich „${w}" im Korpus typischerweise mit bestimmten Subjekten und Objekten sowie mit charakteristischen Adverbien.`,
    Adjektiv: `Als Adjektiv bestimmt „${w}" im Korpus bevorzugt bestimmte Substantive näher und tritt mit typischen Verben und Gradangaben auf.`,
    Adverb: `Als Adverb modifiziert „${w}" im Korpus charakteristische Verben und Adjektive.`,
  }
  // Wortart kann Zusätze tragen ("Substantiv, feminin") → erstes Wort.
  const posKey = String(wortart || '').split(/[,\s/]/)[0]
  return byPos[posKey] || `„${w}" tritt im Korpus in charakteristischen Wortverbindungen (Kollokationen) auf.`
}

/** Gemeinsamer Zusatzsatz zur Methodik (ohne den POS-Lead). */
export const BLURB_LOGDICE_NOTE = 'Wie typisch eine Verbindung ist, misst Signifikation mit dem logDice-Wert.'
