// Neubau der eingefrorenen Kollokationen-Runden (runden.kollokatoren) geplanter Tage.
//
// Beim Speichern eines Tages im Admin friert fetchLemma die Optionen im Lemma ein.
// Seit der neuen Rangfolge (Häufigkeit × logDice, 2026-11-20) spielen bereits
// geplante Tage daher noch die alten Top 3, bis sie neu gebaut werden. Das Skript
// scripts/kollokationen-neubau.mjs nutzt diese reine Planungslogik.
//
// Lemmata werden über ihre Kennung von mehreren Tagen geteilt. Ein Lemma, das auch an
// einem Tag vor dem Stichtag vorkommt (Kalender oder Spezialwoche), bleibt
// standardmäßig unangetastet: Vergangene Tage sind über das Archiv nachspielbar, und
// gespeicherte Ergebnisse dort verweisen auf die alten Optionen.

/**
 * @param {object} p
 * @param {Record<string, { ids: string[] } | string[]>} p.kalender Datum → Eintrag mit Lemma-Kennungen
 * @param {Array<{ von: string, bis: string, lemma_id: string|null }>} [p.spezialwochen]
 * @param {Map<string, object>} p.byId Lemma-Index
 * @param {string} p.ab erster neu zu bauender Tag (ISO)
 * @param {string} [p.bis] letzter Tag (ISO), Standard: offen
 * @param {boolean} [p.auchVergangene] auch Lemmata, die schon vor `ab` vorkamen
 * @returns {{ neu: Array<{ id: string, lemma: object, daten: string[] }>,
 *   uebersprungen: Array<{ id: string, lemma: string|null, grund: string, daten: string[] }> }}
 */
export function planeNeubau({ kalender, spezialwochen = [], byId, ab, bis = '9999-12-31', auchVergangene = false }) {
  const kuenftig = new Map() // id → Daten im Zeitraum
  const vorher = new Map()   // id → Daten vor `ab`
  const merke = (map, id, datum) => {
    if (!id) return
    if (!map.has(id)) map.set(id, [])
    map.get(id).push(datum)
  }
  for (const [datum, eintrag] of Object.entries(kalender ?? {})) {
    // Kalendereintrag: { ids, thema, … } (aktuell) oder ein bloßes Array (Altdaten)
    const ids = Array.isArray(eintrag) ? eintrag : (eintrag?.ids ?? [])
    for (const id of ids) {
      if (datum < ab) merke(vorher, id, datum)
      else if (datum <= bis) merke(kuenftig, id, datum)
    }
  }
  for (const w of spezialwochen) {
    if (!w?.lemma_id || !w.von) continue
    const datum = `Spezialwoche ${w.von}`
    if (w.von < ab) merke(vorher, w.lemma_id, datum)
    else if (w.von <= bis) merke(kuenftig, w.lemma_id, datum)
  }

  const neu = []
  const uebersprungen = []
  for (const [id, daten] of [...kuenftig].sort(([, a], [, b]) => a[0].localeCompare(b[0]))) {
    const lemma = byId.get(id)
    daten.sort()
    if (!lemma) { uebersprungen.push({ id, lemma: null, grund: 'Lemma fehlt in der Datenbank', daten }); continue }
    if (vorher.has(id) && !auchVergangene) {
      uebersprungen.push({ id, lemma: lemma.lemma, grund: `kommt auch vorher vor (${vorher.get(id).sort().at(-1)})`, daten })
      continue
    }
    neu.push({ id, lemma, daten })
  }
  return { neu, uebersprungen }
}

/** Erste drei Wörter einer Optionsliste (Rang 1–3). */
export const top3 = (koll) => (Array.isArray(koll) ? koll : [])
  .filter((k) => Number(k?.rang) <= 3)
  .sort((a, b) => a.rang - b.rang)
  .map((k) => k.wort)

/**
 * Lemma mit neuen Kollokationen-Optionen; alle anderen Felder (Notiz, Definition,
 * Lückenfüller, übrige Runden) bleiben erhalten.
 */
export function mitNeuenKollokatoren(lemma, kollokatoren) {
  return { ...lemma, runden: { ...(lemma.runden ?? {}), kollokatoren } }
}

/**
 * Künftige Tage, die eine Kollokator-Korrektur vermutlich ändert: bei einem Paar jeder
 * Tag mit dieser Basis, sonst jeder Tag, dessen gespeicherte Kollokationen-Optionen das
 * Wort enthalten (auch als Teil eines Bindestrich-Worts). Eine Korrektur, die ein Wort
 * erst in die Liste bringt (aufgehobene Sperre), findet diese Suche nicht; dafür zeigt
 * der Tag-Editor beim Laden den Vergleich gespeichert ↔ aktuell.
 *
 * @param {{ art: string, basis?: string|null, kollokator: string }} korrektur
 * @param {object} p
 * @param {Record<string, { ids: string[] } | string[]>} p.kalender
 * @param {Map<string, object>} p.byId
 * @param {string} p.heute ISO; nur Tage danach
 * @returns {Array<{ datum: string, woerter: string[] }>} woerter = betroffene Basen des Tages
 */
export function betroffeneTage(korrektur, { kalender, byId, heute }) {
  const k = String(korrektur.kollokator).toLowerCase()
  const basis = korrektur.basis ? String(korrektur.basis).toLowerCase() : null
  const trifft = (lemma) => {
    if (korrektur.art === 'paar') return String(lemma.lemma ?? '').toLowerCase() === basis
    const woerter = (lemma.runden?.kollokatoren ?? []).map((o) => String(o?.wort ?? '').toLowerCase())
    return woerter.some((w) => w === k || w.split('-').includes(k))
  }
  const tage = []
  for (const [datum, eintrag] of Object.entries(kalender ?? {})) {
    if (datum <= heute) continue
    const ids = Array.isArray(eintrag) ? eintrag : (eintrag?.ids ?? [])
    const woerter = ids.map((id) => byId.get(id)).filter((l) => l && trifft(l)).map((l) => l.lemma)
    if (woerter.length) tage.push({ datum, woerter })
  }
  return tage.sort((a, b) => a.datum.localeCompare(b.datum))
}
