/**
 * audit.js – Audit Logging für Admin-Changes
 *
 * Protokolliert alle Admin-Operationen (Erstellen, Aktualisieren, Löschen)
 * mit Timestamp, User-Identifikation und Change-Details.
 * Erforderlich für Compliance und Forensics.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, 'data')
const AUDIT_LOG_FILE = join(DATA, 'audit.log')

/**
 * Audit Log Entry Format:
 * {
 *   timestamp: ISO 8601,
 *   action: 'CREATE' | 'UPDATE' | 'DELETE',
 *   resource: 'lemmata' | 'kalender' | 'zeitreise' | etc,
 *   resourceId: string (z.B. lemma ID),
 *   changes: { before: any, after: any },
 *   adminKey: string (last 4 chars only, für Sicherheit),
 *   ip: string,
 *   status: 'SUCCESS' | 'FAILED',
 *   error: string (optional, nur bei FAILED),
 * }
 */

/**
 * Schreibt einen Audit-Log-Eintrag.
 * @param {Object} entry – Audit-Eintrag
 */
export function auditLog(entry) {
  const sanitizedEntry = {
    timestamp: new Date().toISOString(),
    action: entry.action,      // CREATE, UPDATE, DELETE
    resource: entry.resource,  // Ressourcentyp (lemmata, kalender, etc)
    resourceId: entry.resourceId,
    changes: entry.changes,    // { before?, after? }
    adminKeyLast4: entry.adminKey ? entry.adminKey.slice(-4) : 'unknown',
    ip: entry.ip,
    status: entry.status || 'SUCCESS',
    error: entry.error || undefined,
  }

  // Nur bei Fehlern Details loggen
  if (sanitizedEntry.error) {
    logger.warn(sanitizedEntry, `AUDIT FAILED: ${entry.action} on ${entry.resource}`)
  } else {
    logger.info(sanitizedEntry, `AUDIT: ${entry.action} on ${entry.resource}/${entry.resourceId}`)
  }

  // Schreibe in Audit-Log (Append-only, JSONL-Format)
  try {
    const line = JSON.stringify(sanitizedEntry) + '\n'
    writeFileSync(AUDIT_LOG_FILE, line, { flag: 'a' })
  } catch (err) {
    logger.error({ err }, 'Audit log write failed')
    // Audit-Fehler sind nicht kritisch, aber loggen
  }
}

/**
 * Kurz-Wrapper für CREATE-Operationen.
 */
export function auditCreate(resource, resourceId, data, { adminKey, ip }) {
  auditLog({
    action: 'CREATE',
    resource,
    resourceId,
    changes: { after: data },
    adminKey,
    ip,
  })
}

/**
 * Kurz-Wrapper für UPDATE-Operationen.
 */
export function auditUpdate(resource, resourceId, before, after, { adminKey, ip }) {
  auditLog({
    action: 'UPDATE',
    resource,
    resourceId,
    changes: { before, after },
    adminKey,
    ip,
  })
}

/**
 * Kurz-Wrapper für DELETE-Operationen.
 */
export function auditDelete(resource, resourceId, data, { adminKey, ip }) {
  auditLog({
    action: 'DELETE',
    resource,
    resourceId,
    changes: { before: data },
    adminKey,
    ip,
  })
}

/**
 * Liest die letzten N Audit-Log-Einträge (für Admin-Dashboard).
 * @param {number} limit – Anzahl Einträge (default 100)
 * @returns {Array} – Audit-Log-Einträge (neueste zuerst)
 */
export function getAuditLog(limit = 100) {
  try {
    const content = readFileSync(AUDIT_LOG_FILE, 'utf8')
    const lines = content.trim().split('\n')
    const entries = lines
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
      .reverse() // neueste zuerst
      .slice(0, limit)
    return entries
  } catch (err) {
    if (err.code === 'ENOENT') return [] // Datei existiert noch nicht
    logger.warn({ err }, 'Audit log read failed')
    return []
  }
}

/**
 * Filter-Funktion für Audit-Log-Abfragen (z.B. nach Resource oder Admin).
 * @param {string} resource – Filter nach Ressourcentyp
 * @returns {Array}
 */
export function getAuditLogByResource(resource, limit = 50) {
  return getAuditLog(200).filter(e => e.resource === resource).slice(0, limit)
}
