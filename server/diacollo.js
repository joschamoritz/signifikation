// ── DiaCollo API (DTA-Korpus, öffentlich) ────────────────────
// Korpus: Deutsches Textarchiv, ca. 1460–1900
// Endpoint: https://kaskade.dwds.de/dstar/dta/diacollo/

const DIACOLLO_BASE = 'https://kaskade.dwds.de/dstar/dta/diacollo/'

/**
 * Holt 5 Kollokat-Periode-Paare für ein Lemma aus dem DTA-Korpus.
 * Wählt 5 gleichmäßig über die Zeitspanne verteilte Perioden (je 50 Jahre).
 * Pro Periode den top-1 Kollokator (log Dice), der in keiner anderen Periode
 * bereits vergeben ist.
 *
 * Gibt null zurück, wenn nicht genügend Daten vorhanden sind.
 */
export async function fetchZeitreise(lemma) {
  const url = `${DIACOLLO_BASE}?${new URLSearchParams({
    q:      lemma,
    slice:  '50',
    kbest:  '20',
    format: 'json',
  })}`

  const r = await fetch(url)
  if (!r.ok) throw new Error(`DiaCollo HTTP ${r.status}`)
  const data = await r.json()

  return extractPaare(lemma, data)
}

function extractPaare(lemma, data) {
  // Perioden mit ausreichend Belegen, chronologisch sortiert
  const profiles = (data.profiles || [])
    .filter(p => p.f1 >= 5 && p.ld && Object.keys(p.ld).length >= 3)
    .sort((a, b) => Number(a.label) - Number(b.label))

  if (profiles.length < 5) return null

  // 5 gleichmäßig verteilte Perioden auswählen
  const step     = (profiles.length - 1) / 4
  const selected = [0, 1, 2, 3, 4].map(i => profiles[Math.round(i * step)])

  const lemmaLower = lemma.toLowerCase()
  const usedWords  = new Set()
  const paare      = []

  for (const profile of selected) {
    // Kollokatoren nach log Dice absteigend, Lemma selbst und Mehrwörter ausschließen
    const allValid = Object.entries(profile.ld)
      .map(([key, score]) => ({
        wort:  key.split('\t')[0],
        score: Number(score),
      }))
      .filter(c =>
        c.wort.toLowerCase() !== lemmaLower &&
        !c.wort.includes(' ') &&
        c.wort.length > 2
      )
      .sort((a, b) => b.score - a.score)

    if (!allValid.length) {
      console.warn(`  DiaCollo: Keine gültigen Kollokatoren für Periode ${profile.label}`)
      return null
    }

    // Einzigartigen Kollokator bevorzugen, Fallback auf besten verfügbaren
    const unique = allValid.filter(c => !usedWords.has(c.wort.toLowerCase()))
    const best   = unique.length ? unique[0] : allValid[0]

    usedWords.add(best.wort.toLowerCase())
    paare.push({ jahrzehnt: profile.label, kollokat: best.wort })
  }

  if (paare.length < 5) return null
  return { lemma, paare }
}
