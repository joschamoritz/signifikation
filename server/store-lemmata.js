export function rowToLemma(row) {
  return {
    id: row.id,
    lemma: row.lemma,
    pos: row.pos,
    wortart: row.wortart,
    runden: JSON.parse(row.runden || '{}'),
    rundenInfo: JSON.parse(row.rundenInfo || '[]'),
    notiz: row.notiz,
    link: row.link,
    definition: row.definition,
    bonusFrage: row.bonusFrage ? JSON.parse(row.bonusFrage) : null,
    ipa: row.ipa,
    definitionen: JSON.parse(row.definitionen || '[]'),
    lueckenfueller: row.lueckenfueller ? JSON.parse(row.lueckenfueller) : null,
  }
}

export function lemmaToRow(lemma) {
  return {
    id: lemma.id,
    lemma: lemma.lemma,
    pos: lemma.pos ?? '',
    wortart: lemma.wortart ?? '',
    runden: JSON.stringify(lemma.runden ?? {}),
    rundenInfo: JSON.stringify(lemma.rundenInfo ?? []),
    notiz: lemma.notiz ?? '',
    link: lemma.link ?? '',
    definition: lemma.definition ?? '',
    bonusFrage: lemma.bonusFrage ? JSON.stringify(lemma.bonusFrage) : null,
    ipa: lemma.ipa ?? '',
    definitionen: JSON.stringify(lemma.definitionen ?? []),
    lueckenfueller: lemma.lueckenfueller ? JSON.stringify(lemma.lueckenfueller) : null,
  }
}

export function buildLemmataIndex(list) {
  return {
    byId: new Map(list.map((lemma) => [lemma.id, lemma])),
    byLemma: new Map(list.map((lemma) => [lemma.lemma, lemma])),
  }
}

export function createLemmataIndexStore(loadLemmata, logger) {
  let byId = null
  let byLemma = null

  return {
    get() {
      if (byId) return { byId, byLemma }
      try {
        const list = loadLemmata()
        if (!Array.isArray(list)) throw new Error('lemmata ist kein Array')
        const index = buildLemmataIndex(list)
        byId = index.byId
        byLemma = index.byLemma
      } catch (err) {
        logger.error({ err }, 'Lemmata-Index konnte nicht aufgebaut werden – leerer Fallback')
        byId = new Map()
        byLemma = new Map()
      }
      return { byId, byLemma }
    },

    invalidate() {
      byId = null
      byLemma = null
    },
  }
}
