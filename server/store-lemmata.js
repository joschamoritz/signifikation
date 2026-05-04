function parseJsonSafe(value, fallback, logger, context) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (err) {
    logger?.warn?.({ err, context }, 'Ungueltiges JSON in Lemma-Datensatz – Fallback verwendet')
    return fallback
  }
}

export function rowToLemma(row, logger) {
  return {
    id: row.id,
    lemma: row.lemma,
    pos: row.pos,
    wortart: row.wortart,
    runden: parseJsonSafe(row.runden, {}, logger, { lemmaId: row.id, field: 'runden' }),
    rundenInfo: parseJsonSafe(row.rundenInfo, [], logger, { lemmaId: row.id, field: 'rundenInfo' }),
    notiz: row.notiz,
    link: row.link,
    definition: row.definition,
    bonusFrage: parseJsonSafe(row.bonusFrage, null, logger, { lemmaId: row.id, field: 'bonusFrage' }),
    ipa: row.ipa,
    definitionen: parseJsonSafe(row.definitionen, [], logger, { lemmaId: row.id, field: 'definitionen' }),
    lueckenfueller: parseJsonSafe(row.lueckenfueller, null, logger, { lemmaId: row.id, field: 'lueckenfueller' }),
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
