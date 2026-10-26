/**
 * server/kollokationAnalyse.js
 *
 * Kollokator-Liste eines Lemmas wie im Admin-Panel unter „Kollokationen
 * analysieren": alle Relationen der Wortart zusammengeführt, dedupliziert,
 * nach logDice sortiert (Top 20). Gemeinsam genutzt von
 * GET /admin/analyze-kollokation und den Social-Card-Entwürfen.
 *
 * Als Factory, damit die Router ihre injizierten wortprofil-Funktionen
 * weiterreichen (Tests ersetzen sie dort).
 */

const POS_KANDIDATEN = ['Substantiv', 'Verb', 'Adjektiv']

export function createKollokationAnalyse({ fetchRelation, fetchBonusQuestion, POS_ROUNDS }) {
  async function analyzeKollokationForPos(lemma, pos) {
    const rounds = POS_ROUNDS[pos] ?? POS_ROUNDS.Substantiv
    const [roundResults, bonusQ] = await Promise.all([
      Promise.allSettled(rounds.map((r) => fetchRelation(lemma, pos, r.relCode))),
      fetchBonusQuestion(lemma, pos).catch(() => null),
    ])

    // Alle Relationen zusammenführen, deduplizieren, nach logDice sortieren
    const allRawItems = roundResults.flatMap((r) =>
      r.status === 'fulfilled'
        ? r.value.filter((it) => !it.lemma.includes(' ') && it.lemma.length > 1)
        : []
    )
    const seen = new Map()
    for (const it of allRawItems) {
      const key = it.lemma.toLowerCase()
      if (!seen.has(key) || parseFloat(it.logDice) > parseFloat(seen.get(key).logDice)) {
        seen.set(key, it)
      }
    }
    const kollokatoren = [...seen.values()]
      .sort((a, b) => parseFloat(b.logDice) - parseFloat(a.logDice))
      .slice(0, 20)
      .map((it) => ({ wort: it.lemma, logDice: parseFloat(parseFloat(it.logDice).toFixed(2)) }))

    const usable = kollokatoren.length >= 5

    return {
      lemma,
      pos,
      kollokatoren,
      bonus: bonusQ,
      usable,
      score: kollokatoren.slice(0, 3).reduce((sum, it) => sum + it.logDice, 0),
      kollCount: kollokatoren.length,
    }
  }

  /** Ohne Wortart-Vorgabe: die Wortart mit den meisten (dann stärksten) Kollokatoren. */
  async function analyzeKollokationBest(lemma) {
    const analyses = await Promise.all(POS_KANDIDATEN.map((candidate) => analyzeKollokationForPos(lemma, candidate)))
    analyses.sort((a, b) => {
      if (b.kollCount !== a.kollCount) return b.kollCount - a.kollCount
      return b.score - a.score
    })
    return analyses[0]
  }

  return { analyzeKollokationForPos, analyzeKollokationBest }
}
