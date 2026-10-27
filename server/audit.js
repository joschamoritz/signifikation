/**
 * audit.js – Audit Logging für Admin-Changes
 *
 * Neue Einträge werden in SQLite gespeichert.
 * Bestehende JSONL-Einträge aus server/data/audit.log werden einmalig, idempotent importiert.
 */

import { createHash } from 'crypto'
import { ipKeyGenerator } from 'express-rate-limit'
import { existsSync, openSync, readSync, fstatSync, closeSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import db from './db.js'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const AUDIT_LOG_FILE = join(__dirname, 'data', 'audit.log')

const stmts = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO audit_log (
      timestamp, action, resource, resource_id, changes_json,
      admin_key_last4, ip, status, error, entry_hash
    ) VALUES (
      @timestamp, @action, @resource, @resource_id, @changes_json,
      @admin_key_last4, @ip, @status, @error, @entry_hash
    )
  `),
  latest: db.prepare(`
    SELECT timestamp, action, resource, resource_id AS resourceId, changes_json,
           admin_key_last4 AS adminKeyLast4, ip, status, error
    FROM audit_log
    ORDER BY timestamp DESC, id DESC
    LIMIT ?
  `),
}

function toEntryHash(entry) {
  return createHash('sha256').update(JSON.stringify(entry)).digest('hex')
}

function normalizeRow(entry) {
  const normalized = {
    timestamp: entry.timestamp || new Date().toISOString(),
    action: entry.action,
    resource: entry.resource,
    resource_id: entry.resourceId,
    changes_json: JSON.stringify(entry.changes || {}),
    admin_key_last4: entry.adminKeyLast4 || 'unknown',
    ip: entry.ip || null,
    status: entry.status || 'SUCCESS',
    error: entry.error || null,
  }
  return {
    ...normalized,
    entry_hash: toEntryHash(normalized),
  }
}

function parseRow(row) {
  return {
    timestamp: row.timestamp,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId,
    changes: JSON.parse(row.changes_json || '{}'),
    adminKeyLast4: row.adminKeyLast4,
    ip: row.ip,
    status: row.status,
    error: row.error || undefined,
  }
}

function readLegacyJsonl(limit = Infinity) {
  if (!existsSync(AUDIT_LOG_FILE)) return []
  let fd
  try {
    fd = openSync(AUDIT_LOG_FILE, 'r')
    const { size } = fstatSync(fd)
    if (size === 0) { closeSync(fd); return [] }

    const CHUNK = 64 * 1024
    const buf = Buffer.alloc(CHUNK)
    const entries = []
    let pos = size
    let tail = ''

    while (pos > 0 && entries.length < limit) {
      const readLen = Math.min(CHUNK, pos)
      pos -= readLen
      readSync(fd, buf, 0, readLen, pos)
      const chunk = buf.toString('utf8', 0, readLen)
      const lines = (chunk + tail).split('\n')

      tail = lines[0]
      for (let i = lines.length - 1; i >= 1; i--) {
        const line = lines[i].trim()
        if (!line) continue
        try {
          entries.push(JSON.parse(line))
          if (entries.length >= limit) break
        } catch { /* malformed line, skip */ }
      }
    }

    if (tail && entries.length < limit) {
      const line = tail.trim()
      if (line) {
        try { entries.push(JSON.parse(line)) } catch { /* skip */ }
      }
    }

    closeSync(fd)
    return entries.reverse()
  } catch (err) {
    try { if (fd) closeSync(fd) } catch { /* ignore */ }
    logger.warn({ err }, 'Legacy audit log read failed')
    return []
  }
}

function importLegacyAuditLog() {
  const entries = readLegacyJsonl()
  if (!entries.length) return
  const insertMany = db.transaction((list) => {
    for (const entry of list) {
      stmts.insert.run(normalizeRow({
        timestamp: entry.timestamp,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId,
        changes: entry.changes,
        adminKeyLast4: entry.adminKeyLast4,
        ip: entry.ip,
        status: entry.status,
        error: entry.error,
      }))
    }
  })
  insertMany(entries)
}

try {
  importLegacyAuditLog()
} catch (err) {
  logger.warn({ err }, 'Legacy audit log import fehlgeschlagen – wird übersprungen')
}

function auditLog(entry) {
  const sanitizedEntry = {
    timestamp: new Date().toISOString(),
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    changes: entry.changes,
    adminKeyLast4: entry.adminKey ? entry.adminKey.slice(-4) : 'unknown',
    ip: entry.ip,
    status: entry.status || 'SUCCESS',
    error: entry.error || undefined,
  }

  if (sanitizedEntry.error) {
    logger.warn(sanitizedEntry, `AUDIT FAILED: ${entry.action} on ${entry.resource}`)
  } else {
    logger.info(sanitizedEntry, `AUDIT: ${entry.action} on ${entry.resource}/${entry.resourceId}`)
  }

  try {
    stmts.insert.run(normalizeRow(sanitizedEntry))
  } catch (err) {
    logger.error({ err }, 'Audit log write failed')
  }
}

export function auditCreate(resource, resourceId, data, { adminKey, ip }) {
  auditLog({ action: 'CREATE', resource, resourceId, changes: { after: data }, adminKey, ip })
}

export function auditUpdate(resource, resourceId, before, after, { adminKey, ip }) {
  auditLog({ action: 'UPDATE', resource, resourceId, changes: { before, after }, adminKey, ip })
}

export function auditDelete(resource, resourceId, data, { adminKey, ip }) {
  auditLog({ action: 'DELETE', resource, resourceId, changes: { before: data }, adminKey, ip })
}

/** Längster Text je Wert in den Einzelheiten eines Sicherheitsereignisses (Eingaben von außen sind unbegrenzt lang). */
export const AUDIT_DETAIL_MAX = 200

function kuerzeDetails(details) {
  const out = {}
  for (const [k, v] of Object.entries(details || {})) {
    out[k] = typeof v === 'string' && v.length > AUDIT_DETAIL_MAX ? `${v.slice(0, AUDIT_DETAIL_MAX)}…` : v
  }
  return out
}

/** Sicherheitsrelevante Events (Login/Logout/Role-Change/Payment-Reject/etc.)
 *  ohne Admin-Key. resource = 'security', resourceId = z. B. 'admin-login'.
 *  Textwerte in details werden auf AUDIT_DETAIL_MAX Zeichen gekürzt: Ereignisse wie ein abgewiesener Webhook
 *  entstehen durch Anfragen von außen, ihr Inhalt darf das Protokoll nicht aufblähen. */
export function auditSecurity(event, details = {}, { ip, status = 'SUCCESS' } = {}) {
  const sicher = kuerzeDetails(details)
  auditLog({
    action: event,           // 'LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGOUT', 'PAYMENT_REJECT', ...
    resource: 'security',
    resourceId: sicher.userId || sicher.subject || 'anonymous',
    changes: { details: sicher },
    adminKey: null,
    ip,
    status,
  })
}

// Gedrosselte Ereignisse: höchstens ein Eintrag je Schlüssel und Zeitfenster, der Rest wird gezählt
// und beim nächsten Eintrag als `unterdrueckt` mitgeschrieben. Zusätzlich gilt ein Budget über alle
// Schlüssel; was darüber hinausgeht (oder nicht mehr in die Tabelle passt), wird gezählt und am Ende des
// Fensters als ein Sammeleintrag geschrieben. Nichts wird still verworfen.
const drosselStand = new Map()
const DROSSEL_STANDARD = Object.freeze({ fensterMs: 60_000, budgetMax: 20, mapMax: 2000 })
const budget = { start: 0, belegt: 0 }
const ueberlauf = { n: 0, event: '', timer: null }

/**
 * Schlüssel für die Drosselung: Ereignis + Absender. IPv6-Adressen werden wie im Rate-Limiter auf ihr
 * Präfix gekürzt (ipKeyGenerator), sonst ließe sich die Drosselung durch Adresswechsel innerhalb eines
 * /56-Netzes umgehen.
 */
export function drosselSchluessel(event, ip) {
  return `${event}:${ipKeyGenerator(String(ip || 'unbekannt'))}`
}

function zaehleUeberlauf(event, fensterMs) {
  ueberlauf.n += 1
  if (ueberlauf.timer) return
  ueberlauf.event = event
  ueberlauf.timer = setTimeout(() => {
    const n = ueberlauf.n
    ueberlauf.n = 0
    ueberlauf.timer = null
    if (n > 0) auditSecurity(ueberlauf.event, { subject: 'sammeleintrag', ueberlauf: n }, { status: 'FAIL' })
  }, fensterMs)
  ueberlauf.timer.unref()
}

/**
 * Wie auditSecurity, aber höchstens ein Eintrag je `schluessel` (z. B. drosselSchluessel) und Zeitfenster und
 * höchstens `budgetMax` Einträge je Fenster über alle Schlüssel. Für Ablehnungen, die jeder von außen auslösen
 * kann (Webhook von fremder Adresse): Das Protokoll bleibt lesbar und wächst weder mit der Zahl der Anfragen noch
 * mit der Zahl der Absender. Die Anfrage selbst wird dadurch nicht verändert.
 * @returns {boolean} true: eingetragen, false: nur gezählt
 */
export function auditSecurityGedrosselt(schluessel, event, details = {}, optionen = {}, einstellungen = {}) {
  const { fensterMs, budgetMax, mapMax } = { ...DROSSEL_STANDARD, ...einstellungen }
  const jetzt = Date.now()
  if (jetzt - budget.start >= fensterMs) {
    budget.start = jetzt
    budget.belegt = 0
  }
  const alt = drosselStand.get(schluessel)
  if (alt && jetzt - alt.start < fensterMs) {
    alt.unterdrueckt += 1
    return false
  }
  if (drosselStand.size >= mapMax) {
    for (const [k, v] of drosselStand) if (jetzt - v.start >= fensterMs) drosselStand.delete(k)
    // Immer noch voll (sehr viele verschiedene Absender): zählen statt still verwerfen
    if (drosselStand.size >= mapMax) {
      zaehleUeberlauf(event, fensterMs)
      return false
    }
  }
  if (budget.belegt >= budgetMax) {
    zaehleUeberlauf(event, fensterMs)
    return false
  }
  budget.belegt += 1
  const zusatz = alt?.unterdrueckt ? { unterdrueckt: alt.unterdrueckt } : {}
  drosselStand.set(schluessel, { start: jetzt, unterdrueckt: 0 })
  auditSecurity(event, { ...details, ...zusatz }, optionen)
  return true
}

/** Nur für Tests: Stand der Drosselung leeren. */
export function resetAuditDrosselung() {
  drosselStand.clear()
  budget.start = 0
  budget.belegt = 0
  if (ueberlauf.timer) clearTimeout(ueberlauf.timer)
  ueberlauf.timer = null
  ueberlauf.n = 0
}

export function getAuditLog(limit = 100) {
  return stmts.latest.all(limit).map(parseRow)
}

// ── Gefilterte Abfrage für das Änderungsprotokoll im Admin-Bereich ────────────

/**
 * So viele (neueste) Zeilen werden bei einer Textsuche höchstens durchsucht; darüber meldet die Abfrage `begrenzt`.
 * Ohne Suche entscheidet SQL über Index und Zeitraum, dort gibt es keine Grenze.
 */
export const AUDIT_SCAN_MAX = 5000

// Ein Formatierer für alle Aufrufe: new Intl.DateTimeFormat je Zeile kostete bei 20 000 Zeilen 1,5 s.
const BERLIN_TAG = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// JJJJ-MM-TT + n Tage (rechnet in UTC, ohne Sommerzeit-Effekte)
function tagPlus(tag, n) {
  const [y, m, t] = tag.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, t + n)).toISOString().slice(0, 10)
}

/**
 * Beginn eines Berliner Kalendertags als UTC-Zeitstempel (ISO, wie in audit_log gespeichert).
 * Mitternacht in Berlin liegt 1 h (Winterzeit) oder 2 h (Sommerzeit) vor Mitternacht UTC; die Umstellung
 * geschieht nachts um 2/3 Uhr, nie um Mitternacht – genau einer der beiden Kandidaten zeigt 00:00 des Tages.
 */
export function berlinTagBeginn(tag) {
  const mitternachtUtc = Date.parse(`${tag}T00:00:00.000Z`)
  for (const stunden of [2, 1]) {
    const kandidat = new Date(mitternachtUtc - stunden * 3_600_000)
    if (BERLIN_TAG.format(kandidat) === `${tag} 00:00`) return kandidat.toISOString()
  }
  return new Date(mitternachtUtc - 2 * 3_600_000).toISOString()
}

const auditSelectCols = `id, timestamp, action, resource, resource_id AS resourceId, changes_json,
  admin_key_last4 AS adminKeyLast4, ip, status, error`

// Der Suchtext darf in SQL vorgefiltert werden, wenn lower() dort dasselbe tut wie toLowerCase() in JS (nur ASCII).
const nurAscii = (text) => [...text].every((zeichen) => zeichen.codePointAt(0) < 128)

/**
 * Filtert das Protokoll für den Admin-Bereich.
 *
 * - Vorgang, Bereich (gespeichert wird klein geschrieben, der Index bleibt nutzbar), Ergebnis und Zeitraum
 *   entscheidet SQL. from/to sind Berliner Kalendertage (JJJJ-MM-TT), beide eingeschlossen; die Grenzen
 *   werden einmal in UTC umgerechnet (berlinTagBeginn), nicht je Zeile.
 * - status 'FAIL' (und das ältere 'FAILED') trifft fehlgeschlagene Einträge; 'SUCCESS' alle übrigen
 *   (ältere Einträge tragen teils 'OK').
 * - q: Teilstring in Vorgang, Bereich, Kennung, Ergebnis oder den protokollierten Änderungen, ohne Rücksicht
 *   auf Groß-/Kleinschreibung. Bei reinem ASCII-Suchtext filtert SQL vor (instr/lower), JS prüft danach genau;
 *   enthält der Suchtext Umlaute o. Ä., prüft nur JS. Durchsucht werden höchstens die neuesten AUDIT_SCAN_MAX Zeilen.
 *
 * @returns {{ entries: object[], totalMatches: number, begrenzt: boolean }}
 *   begrenzt = true: Es gab mehr als AUDIT_SCAN_MAX Zeilen im Zeitraum, ältere wurden bei der Suche nicht durchsucht.
 */
export function queryAuditLog({ action, resource, status, q, from, to, limit = 100 } = {}) {
  const where = []
  const params = {}
  if (action) { where.push('action = @action'); params.action = action }
  if (resource) { where.push('resource = @resource'); params.resource = String(resource).toLowerCase() }
  if (status === 'SUCCESS') where.push(`status NOT IN ('FAIL', 'FAILED')`)
  else if (status) where.push(`status IN ('FAIL', 'FAILED')`)
  if (from) { where.push('timestamp >= @von'); params.von = berlinTagBeginn(from) }
  if (to) { where.push('timestamp < @bis'); params.bis = berlinTagBeginn(tagPlus(to, 1)) }
  const wo = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const reihenfolge = 'ORDER BY timestamp DESC, id DESC'

  const needle = q ? String(q).toLowerCase() : ''
  if (!needle) {
    const totalMatches = db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${wo}`).get(params).n
    const rows = db.prepare(`SELECT ${auditSelectCols} FROM audit_log ${wo} ${reihenfolge} LIMIT @limit`).all({ ...params, limit })
    return { entries: rows.map(parseRow), totalMatches, begrenzt: false }
  }

  const begrenzt = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM audit_log ${wo} LIMIT ${AUDIT_SCAN_MAX + 1})`).get(params).n > AUDIT_SCAN_MAX
  const vorfilter = nurAscii(needle)
    ? `WHERE instr(lower(ifnull(action, '') || ' ' || ifnull(resource, '') || ' ' || ifnull(resourceId, '') || ' ' || ifnull(status, '') || ' ' || ifnull(changes_json, '')), @q) > 0`
    : ''
  const rows = db.prepare(`
    SELECT * FROM (SELECT ${auditSelectCols} FROM audit_log ${wo} ${reihenfolge} LIMIT ${AUDIT_SCAN_MAX})
    ${vorfilter}
    ORDER BY timestamp DESC, id DESC
  `).all(vorfilter ? { ...params, q: needle } : params)

  const treffer = rows.filter((row) => [row.action, row.resource, row.resourceId, row.status, row.changes_json].join(' ').toLowerCase().includes(needle))
  return { entries: treffer.slice(0, limit).map(parseRow), totalMatches: treffer.length, begrenzt }
}
