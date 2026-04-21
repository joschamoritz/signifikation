export function loadKalenderRows(rows) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = JSON.parse(row.ids)
  }
  return result
}

export function getKalenderEntries(obj) {
  return Object.entries(obj || {})
}

export function normalizeZeitreiseEntry(row) {
  return {
    lemma: row.lemma,
    paare: JSON.parse(row.paare),
    perioden: JSON.parse(row.perioden),
    wortart: row.wortart,
  }
}

export function loadZeitreiseRows(rows) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = normalizeZeitreiseEntry(row)
  }
  return result
}

export function toZeitreiseRow(datum, value) {
  return {
    datum,
    lemma: value.lemma ?? '',
    paare: JSON.stringify(value.paare ?? []),
    perioden: JSON.stringify(value.perioden ?? []),
    wortart: value.wortart ?? 'Substantiv',
  }
}

export function normalizeWortzwillingEntry(row) {
  return {
    wortA: row.wortA,
    wortB: row.wortB,
    pos: row.pos,
    kollokatoren: JSON.parse(row.kollokatoren),
  }
}

export function loadWortzwillingRows(rows) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = normalizeWortzwillingEntry(row)
  }
  return result
}

export function toWortzwillingRow(datum, value) {
  return {
    datum,
    wortA: value.wortA ?? '',
    wortB: value.wortB ?? '',
    pos: value.pos ?? 'Substantiv',
    kollokatoren: JSON.stringify(value.kollokatoren ?? []),
  }
}

export function loadZeitenwendeRows(rows) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = JSON.parse(row.data)
  }
  return result
}

export function toZeitenwendeRow(datum, value) {
  return {
    datum,
    data: JSON.stringify(value),
  }
}

export function createDailyContentStore({ db, stmts }) {
  const replaceKalender = db.transaction((obj) => {
    stmts.deleteAllKalender.run()
    for (const [datum, ids] of getKalenderEntries(obj)) {
      stmts.upsertKalender.run({ datum, ids: JSON.stringify(ids) })
    }
  })

  const replaceZeitreise = db.transaction((obj) => {
    stmts.deleteAllZeitreise.run()
    for (const [datum, value] of Object.entries(obj)) {
      stmts.upsertZeitreise.run(toZeitreiseRow(datum, value))
    }
  })

  const replaceWortzwilling = db.transaction((obj) => {
    stmts.deleteAllWortzwilling.run()
    for (const [datum, value] of Object.entries(obj)) {
      stmts.upsertWortzwilling.run(toWortzwillingRow(datum, value))
    }
  })

  const replaceZeitenwende = db.transaction((obj) => {
    stmts.deleteAllZeitenwende.run()
    for (const [datum, value] of Object.entries(obj)) {
      stmts.upsertZeitenwende.run(toZeitenwendeRow(datum, value))
    }
  })

  return {
    loadKalender() {
      return loadKalenderRows(stmts.getAllKalender.all())
    },
    loadZeitreise() {
      return loadZeitreiseRows(stmts.getAllZeitreise.all())
    },
    loadWortzwilling() {
      return loadWortzwillingRows(stmts.getAllWortzwilling.all())
    },
    loadZeitenwende() {
      return loadZeitenwendeRows(stmts.getAllZeitenwende.all())
    },
    replaceKalender,
    replaceZeitreise,
    replaceWortzwilling,
    replaceZeitenwende,
  }
}
