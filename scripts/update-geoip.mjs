// CLI: laedt die freie IP→Land-Datenbank (DB-IP Lite, CC BY 4.0) fuer die
// Mollie-Deutschland-Beschraenkung (Stufe 2, server/geoip.js).
//
//   node scripts/update-geoip.mjs
//
// Nur IPv4 (bewusste Vereinfachung, siehe server/geoip.js) -- Quelle ist der
// taeglich aktualisierte Re-Export von sapics/ip-location-db, nicht DB-IP
// direkt, weil DB-IP selbst keine anonymen CSV-Downloads mehr anbietet.
// Nicht Teil von npm run build/verify: laeuft nur bei Bedarf manuell (analog
// pdf:beamer/pdf:course). Ohne diese Datei bleibt server/geoip.js inaktiv
// (fail-open) -- Stufe 1 (Checkbox-Selbstauskunft) greift trotzdem weiter.

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../server/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(__dirname, '..', 'server', 'data', 'geoip')
const CSV_URL = 'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/dbip-country-ipv4.csv'
const LICENSE_URL = 'https://raw.githubusercontent.com/sapics/ip-location-db/main/dbip-country/DBIP-LICENSE'

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return res.text()
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  logger.info({ url: CSV_URL }, 'GeoIP: lade DB-IP-Lite-Länderdaten (IPv4)')
  const csv = await fetchText(CSV_URL)
  const lines = csv.trim().split('\n').length
  writeFileSync(resolve(OUT_DIR, 'dbip-country-ipv4.csv'), csv)

  const license = await fetchText(LICENSE_URL)
  writeFileSync(resolve(OUT_DIR, 'DBIP-LICENSE'), license)

  logger.info({ lines, outDir: OUT_DIR }, 'GeoIP-Daten aktualisiert')
}

main().catch((err) => {
  logger.error({ err }, 'GeoIP-Update fehlgeschlagen')
  process.exitCode = 1
})
