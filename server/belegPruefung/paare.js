/**
 * Welche Paare aus Basis und Kollokator ein Spieltag als Beleg anzeigen kann:
 * die Kollokationen-Runde jedes Tagesworts, die Wort-Zwilling-Kollokatoren
 * (je nach Zuordnung zu Wort A oder B) und die Zeitenwende-Wörter. Genau diese
 * Paare fragt das Frontend über /api/v1/belege ab.
 */

/** Schlüssel eines Paars, wie er in `beleg_pruefung` steht. */
export function paarSchluessel(basis, kollokator) {
  return `${String(basis).toLowerCase()}\u0000${String(kollokator).toLowerCase()}`
}

/**
 * @param {string} datum
 * @param {{kalender: object, wortzwilling: object, zeitenwende: object}} maps  aus loadDailyContentMaps()
 * @param {Map<string, object>} lemmataById  aus getLemmataIndex().byId
 * @returns {Array<{basis: string, kollokator: string}>} ohne Dubletten
 */
export function paareFuerDatum(datum, { kalender, wortzwilling, zeitenwende }, lemmataById) {
  const paare = new Map()
  const dazu = (basis, kollokator) => {
    if (!basis || !kollokator) return
    paare.set(paarSchluessel(basis, kollokator), { basis, kollokator })
  }

  const eintrag = kalender?.[datum]
  const ids = Array.isArray(eintrag) ? eintrag : (eintrag?.ids ?? [])
  for (const id of ids) {
    const lemma = lemmataById.get(id)
    for (const k of lemma?.runden?.kollokatoren ?? []) dazu(lemma.lemma, k.wort)
  }

  const wz = wortzwilling?.[datum]
  for (const k of wz?.kollokatoren ?? []) dazu(k.zuordnung === 'A' ? wz.wortA : wz.wortB, k.wort)

  const zw = zeitenwende?.[datum]
  for (const w of zw?.words ?? []) dazu(zw.lemma, w.wort)

  return [...paare.values()]
}
