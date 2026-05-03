// ── Kalender ──────────────────────────────────────────────────────
// Shape: { [datum]: { ids: string[], thema: string, thema_kurz: string, thema_quelle: string } }

export function loadKalenderRows(rows) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = {
      ids: JSON.parse(row.ids),
      thema: row.thema ?? '',
      thema_kurz: row.thema_kurz ?? '',
      thema_quelle: row.thema_quelle ?? '',
    }
  }
  return result
}

export function getKalenderEntries(obj) {
  return Object.entries(obj || {})
}

/** Normalisiert alte Backups (datum→array) auf neue Shape */
export function normalizeKalenderShape(raw) {
  const result = {}
  for (const [datum, value] of Object.entries(raw || {})) {
    if (Array.isArray(value)) {
      result[datum] = { ids: value, thema: '', thema_kurz: '', thema_quelle: '' }
    } else if (value && typeof value === 'object' && Array.isArray(value.ids)) {
      result[datum] = {
        ids: value.ids,
        thema: value.thema ?? '',
        thema_kurz: value.thema_kurz ?? '',
        thema_quelle: value.thema_quelle ?? '',
      }
    }
  }
  return result
}

// ── Wort-Zwilling ────────────────────────────────────────────────

export function normalizeWortzwillingEntry(row) {
  return {
    wortA:       row.wortA,
    wortB:       row.wortB,
    pos:         row.pos,
    kollokatoren: JSON.parse(row.kollokatoren),
    notiz:       row.notiz ?? '',
    link:        row.link  ?? '',
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
    wortA:       value.wortA        ?? '',
    wortB:       value.wortB        ?? '',
    pos:         value.pos          ?? 'Substantiv',
    kollokatoren: JSON.stringify(value.kollokatoren ?? []),
    notiz:       value.notiz        ?? '',
    link:        value.link         ?? '',
  }
}

// ── Zeitenwende ──────────────────────────────────────────────────
// notiz/link werden im JSON-blob (data) gespeichert

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

// ── Factory ──────────────────────────────────────────────────────

export function createDailyContentStore({ db, stmts }) {
  const replaceKalender = db.transaction((obj) => {
    stmts.deleteAllKalender.run()
    for (const [datum, entry] of getKalenderEntries(obj)) {
      const ids         = Array.isArray(entry) ? entry : (entry.ids ?? [])
      const thema       = Array.isArray(entry) ? '' : (entry.thema ?? '')
      const thema_kurz  = Array.isArray(entry) ? '' : (entry.thema_kurz ?? '')
      const thema_quelle = Array.isArray(entry) ? '' : (entry.thema_quelle ?? '')
      stmts.upsertKalender.run({ datum, ids: JSON.stringify(ids), thema, thema_kurz, thema_quelle })
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
    loadKalender()    { return loadKalenderRows(stmts.getAllKalender.all()) },
    loadWortzwilling(){ return loadWortzwillingRows(stmts.getAllWortzwilling.all()) },
    loadZeitenwende() { return loadZeitenwendeRows(stmts.getAllZeitenwende.all()) },
    replaceKalender,
    replaceWortzwilling,
    replaceZeitenwende,
  }
}
