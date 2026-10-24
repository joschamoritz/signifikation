export function normalizeDatumToIso(value, fallbackYear = new Date().getFullYear()) {
  const normalized = String(value || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized

  const legacyMatch = normalized.match(/^(\d{2})-(\d{2})$/)
  if (!legacyMatch) return null

  return `${fallbackYear}-${legacyMatch[1]}-${legacyMatch[2]}`
}

export function sortDatumKeys(keys) {
  return [...keys].sort((a, b) => {
    const isoA = normalizeDatumToIso(a) || String(a)
    const isoB = normalizeDatumToIso(b) || String(b)
    return isoA.localeCompare(isoB)
  })
}

/**
 * Montag und Sonntag einer ISO-Woche ("2026-W45" → { von: '2026-11-02', bis: '2026-11-08' }).
 * Null, wenn die Woche es nicht gibt (W00, W54, W53 in einem Jahr mit nur 52 Wochen).
 */
export function isoWocheSpanne(woche) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(woche ?? ''))
  if (!m) return null
  const jahr = Number(m[1])
  const nr = Number(m[2])
  if (nr < 1 || nr > 53) return null
  const iso = (d) => d.toISOString().slice(0, 10)
  // Der 4. Januar liegt immer in Woche 1; deren Montag ist der Anfang der Zählung
  const jan4 = new Date(Date.UTC(jahr, 0, 4))
  const montag1 = new Date(Date.UTC(jahr, 0, 4 - ((jan4.getUTCDay() + 6) % 7)))
  const von = new Date(montag1.getTime() + (nr - 1) * 7 * 864e5)
  // Gibt es Woche 53 nicht, rutscht der Montag in Woche 1 des Folgejahres (dessen 4. Januar)
  const donnerstag = new Date(von.getTime() + 3 * 864e5)
  if (donnerstag.getUTCFullYear() !== jahr) return null
  return { von: iso(von), bis: iso(new Date(von.getTime() + 6 * 864e5)) }
}

// ── Berliner Kalendertage (Auswertung) ─────────────────────────────
// Die Auswertung zählt in Kalendertagen der Berliner Zeit. Reines Rechnen mit
// JJJJ-MM-TT-Texten läuft in UTC (kein Sommerzeit-Sprung); nur der Übergang
// zwischen Zeitpunkt (ms) und Berliner Tag braucht die Zeitzone.

const BERLIN = 'Europe/Berlin'
const berlinTagFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BERLIN, year: 'numeric', month: '2-digit', day: '2-digit' })
const berlinTeileFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: BERLIN, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** Berliner Kalendertag (JJJJ-MM-TT) eines Zeitpunkts (ms oder Date). */
export function berlinTag(zeitpunkt = Date.now()) {
  return berlinTagFormat.format(typeof zeitpunkt === 'number' ? new Date(zeitpunkt) : zeitpunkt)
}

/** Verschiebt einen Kalendertag (JJJJ-MM-TT) um n Tage; negative n gehen zurück. */
export function plusTage(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Abstand zweier Kalendertage in Tagen (bis − von). */
export function tageZwischen(von, bis) {
  const t = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(bis) - t(von)) / 864e5)
}

// Unterschied Berlin − UTC in ms zu einem Zeitpunkt (3.600.000 im Winter, 7.200.000 im Sommer)
function berlinVersatzMs(ms) {
  const teile = Object.fromEntries(berlinTeileFormat.formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
  const alsUtc = Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day), Number(teile.hour), Number(teile.minute), Number(teile.second))
  return alsUtc - Math.floor(ms / 1000) * 1000
}

/** Zeitpunkt (ms) von 00:00 Uhr Berliner Zeit an einem Kalendertag. */
export function berlinMitternachtMs(iso) {
  const [y, m, d] = String(iso).split('-').map(Number)
  const utc0 = Date.UTC(y, m - 1, d)
  // Die Umstellung liegt nachts um 2/3 Uhr, Mitternacht ist nie doppelt oder ausgefallen
  return utc0 - berlinVersatzMs(utc0 - berlinVersatzMs(utc0))
}

/** Kalendertage von `von` bis `bis` einschließlich. */
export function tageVonBis(von, bis) {
  const tage = []
  for (let t = von; t <= bis; t = plusTage(t, 1)) tage.push(t)
  return tage
}
