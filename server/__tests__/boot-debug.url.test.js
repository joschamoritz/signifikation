// public/boot-debug.js meldet Startfehler an den Server – ohne Query und Hash der Adresse,
// dort kann das Reset-Token stehen (Security-Audit run-1).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const quelltext = readFileSync(join(import.meta.dirname, '../../public/boot-debug.js'), 'utf8')

describe('boot-debug.js', () => {
  it('schickt die Adresse ohne Query und Hash', () => {
    const gesendet = []
    const location = {
      protocol: 'https:', origin: 'https://signifikation.de', pathname: '/',
      href: 'https://signifikation.de/?tab=konto&token=GEHEIM#x',
    }
    const window = { location, addEventListener: () => {} }
    vm.runInNewContext(quelltext, {
      window, location,
      localStorage: { getItem: () => null },
      navigator: { userAgent: 'test' },
      fetch: (_url, init) => { gesendet.push(JSON.parse(init.body)); return Promise.resolve() },
    })
    window.__sigDebugPost('error', 'test', 'kaputt', null)
    expect(gesendet).toHaveLength(1)
    expect(gesendet[0].url).toBe('https://signifikation.de/')
    expect(JSON.stringify(gesendet[0])).not.toContain('GEHEIM')
  })
})
