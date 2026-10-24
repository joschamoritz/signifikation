/**
 * Spielmodi der Statistik – eine Quelle für Schema, Konto und Auswertung.
 *
 * Die vier täglichen Modi stehen in der Reihenfolge, in der der Admin sie zeigt (MODI in admin.js).
 * Spiele zum Wort der Woche melden unter eigenen Schlüsseln `woche_<modus>` (ohne Kollokationen, die
 * es dort nicht gibt) und mit dem echten Spieltag. Alte App-Versionen melden sie weiter unter dem
 * Tagesmodus auf dem Montag der Woche; das nimmt der Server unverändert an.
 */

export const SPIELMODI = Object.freeze(['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller'])

export const WOCHE_PREFIX = 'woche_'

/** `woche_wortzwilling`, `woche_zeitenwende`, `woche_lueckenfueller` */
export const WOCHE_SPIELE = Object.freeze(SPIELMODI.filter((m) => m !== 'kollokationen').map((m) => `${WOCHE_PREFIX}${m}`))

/** Alle Schlüssel, die der Server in `stats.spiel` annimmt. */
export const STAT_SPIELE = Object.freeze([...SPIELMODI, ...WOCHE_SPIELE])

/** `woche_wortzwilling` → `wortzwilling`; Tagesmodi bleiben unverändert. */
export function grundModus(spiel) {
  return String(spiel).startsWith(WOCHE_PREFIX) ? String(spiel).slice(WOCHE_PREFIX.length) : String(spiel)
}

export const istWocheSpiel = (spiel) => WOCHE_SPIELE.includes(spiel)
