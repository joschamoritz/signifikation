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
  MEHRDEUTIG: 'mehrdeutig',
})

/**
 * Gemeinsame Zuordnung „Wort oder Kennung → vorhandenes Lemma“ für den Speicherweg,
 * „Runden erzeugen“ und die Rundenzählung: genauer Wortname, dann genaue Kennung.
 * Trifft nur die aus dem Wort abgeleitete Kennung (`toId`) ein Lemma mit ANDEREM
 * Namen („Essen“ → `essen`, das Verb), ist das eine Kollision: Dort darf nichts
 * angelegt oder überschrieben werden.
 *
 * @returns {{ lemma: object|null, kollision: object|null }}
 */
export function findeLueckenfuellerLemma({ name, getLemmataIndex, toId }) {
  const { byId, byLemma } = getLemmataIndex()
  const vorhanden = byLemma?.get(name) ?? byId.get(name) ?? null
  if (vorhanden) return { lemma: vorhanden, kollision: null }
  const kennung = toId(name)
  return { lemma: null, kollision: (kennung && byId.get(kennung)) || null }
}

/**
 * Das Admin-Formular nimmt für den Lückenfüller das WORT („Lektüre“), gespeichert
 * wird aber die Kennung („lektuere“). Übersetzt eine Eingabe in die Kennung;
 * eine bereits übergebene Kennung (Altdaten, Entwurfs-Postfach, API) bleibt
 * unverändert. Reihenfolge: genau passende Kennung/Name eines Tag-Lemmas, die
 * bisher für diesen Tag gespeicherte Kennung (wenn ihr Lemma so heißt wie die
 * Eingabe), vorhandenes Lemma (`findeLueckenfuellerLemma`), sonst dieselbe Regel
 * wie beim Anlegen eines Lemmas (`toId`).
 *
 * @returns {{ kennung: string, mehrdeutig: boolean }} `kennung` ist leer, wenn nichts
 *   eingetragen ist oder die Eingabe mehrdeutig ist (die abgeleitete Kennung gehört
 *   schon zu einem Lemma mit anderem Namen – dann wird nichts übernommen).
 */
export function ermittleLueckenfuellerId({ eingabe, lemmaEntries = [], getLemmataIndex, toId, bisherigeKennung = '' }) {
  const roh = String(eingabe ?? '').trim()
  if (!roh) return { kennung: '', mehrdeutig: false }

  if (lemmaEntries.some((entry) => entry.id === roh)) return { kennung: roh, mehrdeutig: false }
  const imTag = lemmaEntries.find((entry) => entry.lemma === roh)
  if (imTag) return { kennung: imTag.id, mehrdeutig: false }

  const bisher = String(bisherigeKennung ?? '').trim()
  if (bisher && (bisher === roh || getLemmataIndex().byId.get(bisher)?.lemma === roh)) {
    return { kennung: bisher, mehrdeutig: false }
  }

  const { lemma, kollision } = findeLueckenfuellerLemma({ name: roh, getLemmataIndex, toId })
  if (lemma) return { kennung: lemma.id, mehrdeutig: false }
  const abgeleitet = toId(roh)
  // Ein Treffer der abgeleiteten Kennung auf ein Wort DIESES Tages gilt als dieses Wort: Der Speicherweg
  // bricht bei abweichender Schreibung schon vorher ab, der Name ist hier also konsistent (und die
  // Vorschlagskarte, die über wortZuId vergleicht, kommt zum selben Ergebnis).
  const imTagAbgeleitet = abgeleitet && lemmaEntries.find((entry) => entry.id === abgeleitet)
  if (imTagAbgeleitet) return { kennung: imTagAbgeleitet.id, mehrdeutig: false }
  if (kollision) return { kennung: '', mehrdeutig: true }

  // Leeres Ergebnis (nur Sonderzeichen): Eingabe behalten, dann meldet der
  // Speicherweg „unbekannt“, statt den Lückenfüller still zu verwerfen.
  return { kennung: abgeleitet || roh, mehrdeutig: false }
}

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
