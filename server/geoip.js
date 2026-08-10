/**
 * server/geoip.js
 *
 * Mollie-Deutschland-Beschränkung, Stufe 2 (Backlog 2026-08-10): serverseitige
 * IP-Land-Prüfung als technischer Backstop zur Selbstauskunfts-Checkbox
 * (Stufe 1, CheckoutModal.jsx). Nur IPv4 -- IPv6-Adressen liefern null
 * (fail-open, siehe unten); Stufe 1 deckt diese Lücke vertraglich weiter ab.
 *
 * Datenquelle: DB-IP Lite (CC BY 4.0) via sapics/ip-location-db,
 * server/data/geoip/dbip-country-ipv4.csv -- gitignored, wird per
 * `npm run geoip:update` geladen (scripts/update-geoip.mjs). Fehlt die Datei
 * (frischer Checkout ohne Update-Lauf, oder CI), ist die Prüfung inaktiv:
 * lookupCountry() liefert immer null, blockiert also nie fälschlich.
 *
 * Format der CSV: `start_ip,end_ip,country_code`, sortiert nach start_ip.
 * Binärsuche über ein vorab in 32-Bit-Integer umgerechnetes Array -- bei
 * ~360.000 Zeilen sind das ~19 Vergleiche pro Lookup.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from './logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const GEOIP_CSV_PATH = process.env.GEOIP_CSV
  || resolve(__dirname, 'data', 'geoip', 'dbip-country-ipv4.csv')

function ipv4ToInt(ip) {
  if (typeof ip !== 'string') return null
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = (n << 8) | v
  }
  return n >>> 0
}

// IPv4-mapped IPv6 (::ffff:1.2.3.4) normalisieren -- gleiches Muster wie
// normalizeIp in routes/payments.js für die Mollie-Webhook-IP-Whitelist.
function normalizeIp(ip) {
  if (!ip) return ''
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

// null = noch nicht geladen, [] = Datei fehlt/leer (Prüfung inaktiv),
// sonst sortiertes Array [startInt, endInt, countryCode].
let ranges = null

function loadRanges() {
  if (!existsSync(GEOIP_CSV_PATH)) {
    logger.warn({ path: GEOIP_CSV_PATH },
      'GeoIP: Länderdatenbank fehlt -- Mollie-Länderprüfung (Stufe 2) inaktiv, ' +
      '`npm run geoip:update` ausführen. Stufe 1 (Checkbox) bleibt aktiv.')
    return []
  }
  const csv = readFileSync(GEOIP_CSV_PATH, 'utf8')
  const rows = []
  for (const line of csv.split('\n')) {
    if (!line) continue
    const [startStr, endStr, country] = line.split(',')
    const start = ipv4ToInt(startStr)
    const end = ipv4ToInt(endStr)
    if (start === null || end === null || !country) continue
    rows.push([start, end, country.trim()])
  }
  logger.info({ ranges: rows.length, path: GEOIP_CSV_PATH }, 'GeoIP: Länderdatenbank geladen')
  return rows
}

// Binärsuche: findet den Range-Eintrag, dessen [start,end] die IP enthält.
function findRange(ip) {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const [start, end] = ranges[mid]
    if (ip < start) hi = mid - 1
    else if (ip > end) lo = mid + 1
    else return ranges[mid]
  }
  return null
}

/**
 * Liefert den zweistelligen ISO-Ländercode für eine IPv4-Adresse, oder
 * `null` bei IPv6, unbekannter/fehlender Datenbank oder keinem Treffer.
 * Bewusst fail-open: null heißt "keine Aussage", nie "verboten".
 */
export function lookupCountry(ip) {
  if (ranges === null) ranges = loadRanges()
  if (ranges.length === 0) return null

  const n = ipv4ToInt(normalizeIp(ip))
  if (n === null) return null

  const hit = findRange(n)
  return hit ? hit[2] : null
}

// Nur für Tests: erzwingt einen Neu-Load bei der nächsten lookupCountry().
export function __resetGeoipCache() {
  ranges = null
}
