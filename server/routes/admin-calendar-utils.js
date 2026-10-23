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
