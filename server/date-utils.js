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
