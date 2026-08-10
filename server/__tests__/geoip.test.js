// server/geoip.js -- Mollie-Deutschland-Beschränkung, Stufe 2.
// Jede describe-Gruppe zeigt per GEOIP_CSV auf eine eigene Fixture-Datei und
// importiert das Modul frisch (vi.resetModules), weil GEOIP_CSV_PATH beim
// Modul-Load einmalig aus process.env gelesen wird (gleiches Muster wie
// APP_DB in migrations.smoke.test.js).

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'signifikation-geoip-'))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

async function loadGeoipWithCsv(content) {
  const path = join(dir, `${Date.now()}-${Math.random().toString(16).slice(2)}.csv`)
  if (content !== null) writeFileSync(path, content)
  vi.stubEnv('GEOIP_CSV', path)
  vi.resetModules()
  return import('../geoip.js')
}

describe('lookupCountry mit Fixture-Datenbank', () => {
  const FIXTURE = [
    '1.1.1.0,1.1.1.255,DE',
    '2.2.2.0,2.2.2.255,FR',
    '', // Leerzeile muss übersprungen werden
    '3.3.3.0,3.3.3.255', // fehlender Ländercode -> übersprungen
  ].join('\n')

  it('findet den Ländercode für eine IP im Range', async () => {
    const { lookupCountry } = await loadGeoipWithCsv(FIXTURE)
    expect(lookupCountry('1.1.1.5')).toBe('DE')
    expect(lookupCountry('2.2.2.200')).toBe('FR')
  })

  it('liefert null außerhalb aller Ranges (kein falscher Block)', async () => {
    const { lookupCountry } = await loadGeoipWithCsv(FIXTURE)
    expect(lookupCountry('9.9.9.9')).toBeNull()
  })

  it('überspringt fehlerhafte Zeilen statt abzustürzen', async () => {
    const { lookupCountry } = await loadGeoipWithCsv(FIXTURE)
    expect(lookupCountry('3.3.3.5')).toBeNull()
  })

  it('normalisiert IPv4-mapped IPv6 (::ffff:1.1.1.5)', async () => {
    const { lookupCountry } = await loadGeoipWithCsv(FIXTURE)
    expect(lookupCountry('::ffff:1.1.1.5')).toBe('DE')
  })

  it('liefert null für reines IPv6 (dokumentierte Lücke, fail-open)', async () => {
    const { lookupCountry } = await loadGeoipWithCsv(FIXTURE)
    expect(lookupCountry('2001:db8::1')).toBeNull()
  })

  it('liefert null für ungültige/leere Eingaben statt zu werfen', async () => {
    const { lookupCountry } = await loadGeoipWithCsv(FIXTURE)
    expect(lookupCountry('')).toBeNull()
    expect(lookupCountry(undefined)).toBeNull()
    expect(lookupCountry('nicht-ip')).toBeNull()
    expect(lookupCountry('999.999.999.999')).toBeNull()
  })

  it('Grenzen eines Ranges liegen noch/nicht mehr im Treffer', async () => {
    const { lookupCountry } = await loadGeoipWithCsv(FIXTURE)
    expect(lookupCountry('1.1.1.0')).toBe('DE')
    expect(lookupCountry('1.1.1.255')).toBe('DE')
    expect(lookupCountry('1.1.2.0')).toBeNull()
  })
})

describe('lookupCountry ohne Datenbank (fail-open)', () => {
  it('liefert immer null, wenn die CSV-Datei fehlt', async () => {
    const path = join(dir, 'nicht-vorhanden.csv')
    vi.stubEnv('GEOIP_CSV', path)
    vi.resetModules()
    const { lookupCountry } = await import('../geoip.js')
    expect(lookupCountry('1.1.1.1')).toBeNull()
  })
})
