// NODE_ENV von außen gegen die .env (Security-Audit run-1): env.js wirkt beim Import,
// deshalb je Fall ein eigener Node-Prozess mit einer Wegwerf-.env.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const ENV_JS = pathToFileURL(join(import.meta.dirname, 'env.js')).href
const ordner = mkdtempSync(join(tmpdir(), 'env-test-'))

function starte(nodeEnvAussen, nodeEnvDatei) {
  const datei = join(ordner, `env-${nodeEnvAussen ?? 'leer'}-${nodeEnvDatei}`)
  writeFileSync(datei, `NODE_ENV=${nodeEnvDatei}\n`)
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DOTENV_CONFIG_PATH: datei }
  if (nodeEnvAussen) env.NODE_ENV = nodeEnvAussen
  const r = spawnSync(process.execPath, ['--input-type=module', '-e',
    `await import(${JSON.stringify(ENV_JS)}); process.stdout.write('\\nNODE_ENV=' + process.env.NODE_ENV)`], { env, encoding: 'utf8' })
  // dotenv schreibt selbst eine Zeile nach stdout, deshalb nur die letzte lesen
  return { code: r.status, aus: r.stdout.split('\n').at(-1).replace('NODE_ENV=', ''), fehler: r.stderr }
}

describe('env.js: NODE_ENV', () => {
  afterAll(() => rmSync(ordner, { recursive: true, force: true }))

  it('Dev-.env gegen Produktion von außen: Start bricht ab', () => {
    const r = starte('production', 'development')
    expect(r.code).not.toBe(0)
    expect(r.fehler).toContain('widerspricht NODE_ENV=production')
  })

  it('gleicher Wert in .env und von außen: Start wie bisher', () => {
    expect(starte('production', 'production')).toMatchObject({ code: 0, aus: 'production' })
  })

  it('ohne NODE_ENV von außen gilt die .env (Skripte, lokaler Server)', () => {
    expect(starte(null, 'development')).toMatchObject({ code: 0, aus: 'development' })
  })

  it('test-Modus bleibt test, die .env überschreibt nichts', () => {
    expect(starte('test', 'development')).toMatchObject({ code: 0, aus: 'test' })
  })
})
