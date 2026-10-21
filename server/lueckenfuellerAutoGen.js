// Ergänzt beim Speichern eines Tages fehlende Lückenfüller-Runden.
//
// Die Runden hängen am Lemma (lemmata.lueckenfueller), der Kalender speichert
// nur den Zeiger lueckenfueller_id. /admin/tag hat früher nur bereits
// vorhandene Runden übernommen. Bei einem neuen Wort zeigte der Zeiger deshalb
// auf ein Lemma ohne Runden, und routes/public.js lieferte für den Tag keinen
// Lückenfüller aus — bis jemand im Admin-Panel auf „Generieren" klickte.
//
// Ziel ist eines der drei Kollokationen-Wörter des Tages oder ein Zwilling-/
// Zeitenwende-Wort, das (noch) kein eigenes Lemma hat. Vorhandene Runden werden
// nie neu gebaut: Ein Lemma kann an mehreren Tagen vorkommen, und ein Neubau
// würde die Runden bereits gespielter Tage verändern.
//
// Alle Datenzugriffe kommen als Parameter herein, damit das Modul ohne die
// Korpus-Datenbanken testbar ist.

export const LUECKENFUELLER_STATUS = Object.freeze({
  VORHANDEN: 'vorhanden',
  ERZEUGT: 'erzeugt',
  ZU_WENIG_MATERIAL: 'zu-wenig-material',
  UNBEKANNT: 'unbekannt',
})

/**
 * @returns {Promise<{ status: string|null, id?: string, runden?: number, lemma?: object }>}
 *   `lemma` ist gesetzt, wenn ein Lemma mit neuen Runden gespeichert werden muss.
 *   Der Aufrufer ersetzt damit den passenden Eintrag in seinen lemmaEntries oder
 *   hängt ihn an. `status: null` heißt: kein Lückenfüller für den Tag gesetzt.
 */
export async function ergaenzeLueckenfueller({
  lueckenfuellerId,
  lemmaEntries,
  weitereWoerter,
  getLemmataIndex,
  buildLueckenfueller,
  resolveCandidate,
  fetchLemma,
  toId,
}) {
  if (!lueckenfuellerId) return { status: null }

  const imTag = lemmaEntries.find((entry) => entry.id === lueckenfuellerId)
  if (imTag) {
    if (imTag.lueckenfueller) return { status: LUECKENFUELLER_STATUS.VORHANDEN, id: imTag.id }
    const runden = await buildLueckenfueller(imTag.lemma, imTag.pos)
    if (!runden) return { status: LUECKENFUELLER_STATUS.ZU_WENIG_MATERIAL, id: imTag.id }
    return {
      status: LUECKENFUELLER_STATUS.ERZEUGT,
      id: imTag.id,
      runden: runden.length,
      lemma: { ...imTag, lueckenfueller: runden },
    }
  }

  const { byId } = getLemmataIndex()
  const bestehend = byId.get(lueckenfuellerId)
  if (bestehend?.lueckenfueller) return { status: LUECKENFUELLER_STATUS.VORHANDEN, id: bestehend.id }

  const name = bestehend?.lemma ?? weitereWoerter.find((wort) => wort && toId(wort) === lueckenfuellerId)
  if (!name) return { status: LUECKENFUELLER_STATUS.UNBEKANNT, id: lueckenfuellerId }

  const best = await resolveCandidate(name, bestehend?.pos)
  if (!best?.result) return { status: LUECKENFUELLER_STATUS.ZU_WENIG_MATERIAL, id: lueckenfuellerId }

  const basis = bestehend ?? await fetchLemma(name, best.pos)
  return {
    status: LUECKENFUELLER_STATUS.ERZEUGT,
    id: basis.id,
    runden: best.result.length,
    lemma: { ...basis, lueckenfueller: best.result },
  }
}
