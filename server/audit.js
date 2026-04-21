/**
 * audit.js – Audit Logging für Admin-Changes
 *
 * Neue Einträge werden in SQLite gespeichert.
 * Bestehende JSONL-Einträge aus server/data/audit.log werden einmalig, idempotent importiert.
 */

import { createHash } from 'crypto'
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

importLegacyAuditLog()

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

export function getAuditLog(limit = 100) {
  return stmts.latest.all(limit).map(parseRow)
}
