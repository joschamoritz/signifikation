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
