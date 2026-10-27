/**
 * server/kollokationAnalyse.js
 *
 * Kollokatoren eines Lemmas für die Social-Card-Entwürfe, auf dem Spielweg: dieselbe Abfrage wie
 * „Wort prüfen › Kollokationen“ und das Spiel (wortprofil.fetchKollokatorenAnalyse, Top-Pool über alle
 * Relationen der Wortart) und dieselbe Eignung (Pool ab MIN_KOLLOKATOREN). Bis 2026-10-27 lief hier eine
 * eigene Zusammenführung mit „ab 5 Kollokatoren“ und der Wortart mit den meisten Treffern.
 *
 * Als Factory, damit Job und Tests die wortprofil-Funktionen hineinreichen.
 */

const POS_KANDIDATEN = ['Substantiv', 'Verb', 'Adjektiv']

export function createKollokationAnalyse({ fetchKollokatorenAnalyse, MIN_KOLLOKATOREN }) {
  async function analysiere(lemma, pos) {
    const a = await fetchKollokatorenAnalyse(lemma, pos)
    return {
      lemma,
      pos,
      // Platz 1 ist die stärkste Verbindung (die Lösung im Rätsel), wie im Spiel
      kollokatoren: a.kollokatoren.map(({ wort, logDice }) => ({ wort, logDice })),
      pool: a.pool,
      usable: a.pool >= MIN_KOLLOKATOREN,
    }
  }

  /**
   * Mit Wortart (Kalender-Lemma): genau diese, wie im Spiel. Ohne Wortart: die mit dem größten Pool.
   * @returns {Promise<{ lemma, pos, kollokatoren: Array<{wort, logDice}>, pool: number, usable: boolean }>}
   */
  async function analyzeKollokationen(lemma, pos) {
    if (pos) return analysiere(lemma, pos)
    const analysen = await Promise.all(POS_KANDIDATEN.map((kandidat) => analysiere(lemma, kandidat)))
    return analysen.sort((a, b) => b.pool - a.pool)[0]
  }

  return { analyzeKollokationen }
}
