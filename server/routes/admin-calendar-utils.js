import { normalizeDatumToIso } from '../date-utils.js'

export function parseCalendarBulkImport(csv) {
  const lines = String(csv || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    throw new Error('CSV enthält keine Daten')
  }

  const entries = []
  for (const [index, line] of lines.entries()) {
    if (index === 0 && /^date[,;\t]/i.test(line)) continue

    const parts = line.split(/[;,\t]/).map((part) => part.trim())
    if (parts.length < 2) {
      throw new Error(`CSV-Zeile ${index + 1} ist unvollständig`)
    }

    const rawDate = parts[0]
    const words = parts.slice(1).filter(Boolean)
    if (words.length !== 3) {
      throw new Error(`CSV-Zeile ${index + 1} benötigt genau 3 Lemmata`)
    }

    const datum = normalizeDatumToIso(rawDate)
    if (!datum) {
      throw new Error(`CSV-Zeile ${index + 1} enthält ein ungültiges Datum`)
    }

    entries.push({ datum, woerter: words })
  }

  return entries
}

function uniqueLabels(items) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const label = String(item || '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(label)
  }
  return result
}

export function buildModeGroups({ lemmata = [], wortzwillingEntry = null, zeitenwendeEntry = null, lueckenfuellerLemma = null }) {
  const groups = []

  const kollokationen = uniqueLabels(lemmata.map((item) => item?.lemma))
  if (kollokationen.length) {
    groups.push({ key: 'kollokationen', label: 'Kollokationen', items: kollokationen })
  }

  const wortzwillingItems = uniqueLabels([
    wortzwillingEntry?.wortA,
    wortzwillingEntry?.wortB,
  ])
  if (wortzwillingItems.length) {
    groups.push({ key: 'wortzwilling', label: 'Wort-Zwilling', items: wortzwillingItems })
  }

  const zeitenwendeItems = uniqueLabels([
    zeitenwendeEntry?.lemma,
  ])
  if (zeitenwendeItems.length) {
    groups.push({ key: 'zeitenwende', label: 'Zeitenwende', items: zeitenwendeItems })
  }

  // Lückenfüller ist in einem Lemma eingebettet; lueckenfuellerLemma ist der Lemma-Name (string) oder null
  const lueckenfuellerItems = uniqueLabels([
    typeof lueckenfuellerLemma === 'string' ? lueckenfuellerLemma : lueckenfuellerLemma?.lemma,
  ])
  if (lueckenfuellerItems.length) {
    groups.push({ key: 'lueckenfueller', label: 'Lückenfüller', items: lueckenfuellerItems })
  }

  return groups
}
