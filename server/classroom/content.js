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
 * `runden.kollokatoren`-Feld ist teils leer/veraltet (z. B. „Barrikade“: im
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

/**
 * Zeitenwende-Wörter für den Klassenraum.
 *
 * Vereinheitlichung (Plan „Datenarchitektur-Vereinheitlichung“, Option A):
 * analog zu resolveKollokatoren wird Zeitenwende IMMER live aus wortprofil.db
 * generiert (fetchZeitenwende → pre/post-distinktive Wörter), mit Fallback auf
 * das gespeicherte runden.zeitenwende-Feld. So ist jedes korpusgeeignete Wort
 * im Klassenraum spielbar, konsistent mit Kollokationen.
 *
 * fetchZeitenwende mischt die Wörter bereits (pre/post gemischt) → hier KEIN
 * zusätzliches Mischen. `periode` bleibt im Objekt (server-autoritatives
 * Scoring); die Whitelist (buildSafePrompt) entfernt sie für die Schüler-Sicht.
 *
 * @param {object} lemma  geparstes Lemma ({ lemma, runden })
 * @param {object} deps
 * @param {Function} deps.fetchZeitenwende  async (lemma) → { words: [{wort, periode}] } | null
 * @param {Function} [deps.logWarn]
 * @returns {Promise<Array<{wort:string, periode:string}>>}
 */
export async function resolveZeitenwende(lemma, { fetchZeitenwende, logWarn } = {}) {
  let words = []
  try {
    if (typeof fetchZeitenwende === 'function') {
      const fresh = await fetchZeitenwende(lemma.lemma)
      if (Array.isArray(fresh?.words) && fresh.words.length) words = fresh.words
    }
  } catch (err) {
    if (typeof logWarn === 'function') logWarn(err, lemma.lemma)
  }

  if (!words.length) {
    const r = lemma.runden || {}
    const zw = r.zeitenwende || r
    words = Array.isArray(zw?.words) ? zw.words : []
  }

  return words
}

/**
 * Lückenfüller-Runden für den Klassenraum — IMMER live (buildLueckenfueller:
 * Sätze aus belege.db, Kollokatoren aus wortprofil.db, identische Game-Logik
 * wie das Tagesspiel). Fallback aufs gespeicherte lemma.lueckenfueller.rounds.
 *
 * Eignung restriktiv (≥6 Kollokatoren mit logDice≥5 + ≥4 belegbare Sätze) →
 * buildLueckenfueller liefert sonst null; dann greift der Fallback bzw. leer.
 * KEIN zusätzliches Mischen (die Runden tragen eine bewusste Schwierigkeits-
 * progression R1→R6).
 *
 * @param {object} lemma  geparstes Lemma ({ lemma, pos, lueckenfueller })
 * @param {object} deps
 * @param {Function} deps.buildLueckenfueller  async (lemma,pos) → rounds[] | null
 * @param {Function} [deps.logWarn]
 * @returns {Promise<Array>}
 */
export async function resolveLueckenfueller(lemma, { buildLueckenfueller, logWarn } = {}) {
  let rounds = []
  try {
    if (typeof buildLueckenfueller === 'function') {
      const fresh = await buildLueckenfueller(lemma.lemma, lemma.pos || 'Substantiv')
      if (Array.isArray(fresh) && fresh.length) rounds = fresh
    }
  } catch (err) {
    if (typeof logWarn === 'function') logWarn(err, lemma.lemma)
  }

  if (!rounds.length) {
    const stored = lemma.lueckenfueller?.rounds
    rounds = Array.isArray(stored) ? stored : []
  }

  return rounds
}

// ── Wort-Zwilling: Paar-basiert (kein Lemma) ─────────────────────────
//
// Ein Wort-Zwilling ist ein PAAR (wortA, wortB), das live aus zwei Wort-
// profilen generiert wird (fetchWortZwilling). Es passt nicht ins Lemma-ID-
// Modell des Pickers. Damit die Assignment-Pipeline (lemma_ids: string[])
// unveraendert bleibt, kodieren wir das Paar als synthetische „wz:“-ID.

const WZ_PREFIX = 'wz:'

/** Kodiert ein Paar als synthetische Assignment-ID. */
export function makeWzId(wortA, wortB, pos = 'Substantiv') {
  return `${WZ_PREFIX}${encodeURIComponent(wortA)}:${encodeURIComponent(wortB)}:${encodeURIComponent(pos)}`
}

/** Parst eine „wz:“-ID zurueck → { wortA, wortB, pos } oder null. */
export function parseWzId(id) {
  if (typeof id !== 'string' || !id.startsWith(WZ_PREFIX)) return null
  const parts = id.slice(WZ_PREFIX.length).split(':')
  if (parts.length < 2) return null
  const wortA = decodeURIComponent(parts[0] || '').trim()
  const wortB = decodeURIComponent(parts[1] || '').trim()
  const pos   = parts[2] ? decodeURIComponent(parts[2]).trim() : 'Substantiv'
  if (!wortA || !wortB) return null
  return { wortA, wortB, pos }
}

/**
 * Wort-Zwilling-Kollokatoren für den Klassenraum — IMMER live aus wortprofil.db
 * (fetchWortZwilling → unterscheidende Kollokatoren mit zuordnung A/B).
 * Kein Fallback (Paare existieren nicht als gespeichertes Lemma). Liefert leer,
 * wenn das Paar nicht genug Distinktion hat → Frontend/Preview zeigt das.
 * Gemischt, damit A/B nicht blockweise erscheinen; `zuordnung` bleibt (Scoring).
 *
 * @param {{wortA:string, wortB:string, pos?:string}} pair
 * @param {object} deps
 * @param {Function} deps.fetchWortZwilling  async (a,b,pos) → { kollokatoren:[{wort,zuordnung}] } | null
 * @param {Function} [deps.logWarn]
 * @returns {Promise<Array<{wort:string, zuordnung:string}>>}
 */
export async function resolveWortzwilling(pair, { fetchWortZwilling, logWarn } = {}) {
  if (!pair?.wortA || !pair?.wortB) return []
  try {
    if (typeof fetchWortZwilling === 'function') {
      const fresh = await fetchWortZwilling(pair.wortA, pair.wortB, pair.pos || 'Substantiv')
      if (Array.isArray(fresh?.kollokatoren) && fresh.kollokatoren.length) {
        return shuffleArr(fresh.kollokatoren)
      }
    }
  } catch (err) {
    if (typeof logWarn === 'function') logWarn(err, `${pair.wortA}/${pair.wortB}`)
  }
  return []
}
