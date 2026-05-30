/**
 * server/classroom/content.js
 *
 * Reine Helfer fuer den content_snapshot-Bau. fetchLemma wird per Dependency
 * Injection hereingereicht, damit dieses Modul OHNE wortprofil.db isoliert
 * testbar ist.
 */

/** Fisher-Yates – neue gemischte Kopie. */
export function shuffleArr(arr) {
  const a = Array.isArray(arr) ? [...arr] : []
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Kollokatoren-Quelle fuer den Klassenraum (Modus Kollokationen).
 *
 * Entscheidung (User, Praxistest): IMMER live aus wortprofil.db generieren —
 * dieselbe Quelle wie das Anlegen eines Tageslemmas (fetchLemma →
 * buildMixedRound: Top-3 staerkste Kollokate + 7 Distraktoren). Das gespeicherte
 * `runden.kollokatoren`-Feld ist teils leer/veraltet (z. B. „Barrikade": im
 * Tagesspiel ok, aber leeres gespeichertes Feld → Klassenraum 0 Optionen).
 *
 * Defensiver Fallback: Schlaegt der Live-Abruf fehl (wortprofil.db nicht
 * erreichbar) oder liefert leer, wird auf das gespeicherte Feld zurueckgegriffen,
 * damit der Klassenraum nicht komplett ausfaellt.
 *
 * Wird gemischt zurueckgegeben: buildMixedRound liefert [Top-3, …Distraktoren]
 * in fester Reihenfolge; das Tagesspiel mischt clientseitig, der Klassenraum-
 * Kiosk NICHT — ohne Mischen staenden die 3 richtigen Woerter oben. `rang`
 * bleibt im Objekt → server-autoritatives Scoring (per `wort`) unveraendert.
 *
 * @param {object} lemma       geparstes Lemma ({ lemma, pos, runden })
 * @param {object} deps
 * @param {Function} deps.fetchLemma  async (lemma, pos) → { runden: { kollokatoren } }
 * @param {Function} [deps.logWarn]   optionaler Warn-Logger
 * @returns {Promise<Array<{wort:string, rang:number}>>}
 */
export async function resolveKollokatoren(lemma, { fetchLemma, logWarn } = {}) {
  let koll = []
  try {
    if (typeof fetchLemma === 'function') {
      const fresh = await fetchLemma(lemma.lemma, lemma.pos || 'Substantiv')
      if (Array.isArray(fresh?.runden?.kollokatoren) && fresh.runden.kollokatoren.length) {
        koll = fresh.runden.kollokatoren
      }
    }
  } catch (err) {
    if (typeof logWarn === 'function') logWarn(err, lemma.lemma)
  }

  if (!koll.length) {
    const stored = lemma.runden?.kollokatoren
    koll = Array.isArray(stored) ? stored : []
  }

  return shuffleArr(koll)
}
