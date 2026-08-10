import { parseJsonSafe } from './json-safe.js'

// ── Kalender ──────────────────────────────────────────────────────
// Shape: { [datum]: { ids: string[], thema: string, thema_kurz: string, thema_quelle: string } }

export function loadKalenderRows(rows, logger) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = {
      ids: parseJsonSafe(row.ids, [], logger, { datum: row.datum, field: 'kalender.ids' }),
      thema: row.thema ?? '',
      thema_kurz: row.thema_kurz ?? '',
      thema_quelle: row.thema_quelle ?? '',
      lueckenfueller_id: row.lueckenfueller_id ?? '',
    }
  }
  return result
}

function getKalenderEntries(obj) {
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
        lueckenfueller_id: value.lueckenfueller_id ?? '',
      }
    }
  }
  return result
}

// ── Wort-Zwilling ────────────────────────────────────────────────

function normalizeWortzwillingEntry(row, logger) {
  return {
    wortA:       row.wortA,
    wortB:       row.wortB,
    pos:         row.pos,
    kollokatoren: parseJsonSafe(row.kollokatoren, [], logger, { datum: row.datum, field: 'wortzwilling.kollokatoren' }),
    notiz:       row.notiz ?? '',
    link:        row.link  ?? '',
  }
}

export function loadWortzwillingRows(rows, logger) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = normalizeWortzwillingEntry(row, logger)
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

export function loadZeitenwendeRows(rows, logger) {
  const result = {}
  for (const row of rows) {
    result[row.datum] = parseJsonSafe(row.data, null, logger, { datum: row.datum, field: 'zeitenwende.data' })
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

export function createDailyContentStore({ db, stmts, logger }) {
  const replaceKalender = db.transaction((obj) => {
    stmts.deleteAllKalender.run()
    for (const [datum, entry] of getKalenderEntries(obj)) {
      const ids              = Array.isArray(entry) ? entry : (entry.ids ?? [])
      const thema            = Array.isArray(entry) ? '' : (entry.thema ?? '')
      const thema_kurz       = Array.isArray(entry) ? '' : (entry.thema_kurz ?? '')
      const thema_quelle     = Array.isArray(entry) ? '' : (entry.thema_quelle ?? '')
      const lueckenfueller_id = Array.isArray(entry) ? '' : (entry.lueckenfueller_id ?? '')
      stmts.upsertKalender.run({ datum, ids: JSON.stringify(ids), thema, thema_kurz, thema_quelle, lueckenfueller_id })
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
    loadKalender()    { return loadKalenderRows(stmts.getAllKalender.all(), logger) },
    loadWortzwilling(){ return loadWortzwillingRows(stmts.getAllWortzwilling.all(), logger) },
    loadZeitenwende() { return loadZeitenwendeRows(stmts.getAllZeitenwende.all(), logger) },
    loadKalenderEntry(datum) {
      const row = stmts.getKalenderByDatum.get(datum)
      if (!row) return null
      return loadKalenderRows([row], logger)[datum] || null
    },
    loadWortzwillingEntry(datum) {
      const row = stmts.getWortzwillingByDatum.get(datum)
      if (!row) return null
      return normalizeWortzwillingEntry(row, logger)
    },
    loadZeitenwendeEntry(datum) {
      const row = stmts.getZeitenwendeByDatum.get(datum)
      if (!row) return null
      return parseJsonSafe(row.data, null, logger, { datum: row.datum, field: 'zeitenwende.data' })
    },
    replaceKalender,
    replaceWortzwilling,
    replaceZeitenwende,
  }
}
