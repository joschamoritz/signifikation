/**
 * server/__tests__/static-pages-csp.test.js
 *
 * Die CSP setzt `styleSrc: ['self']` (server/index.js). Ein <style>-Block in
 * einer statischen Seite wird vom Browser deshalb kommentarlos verworfen –
 * lokal ueber den Vite-Dev-Server faellt das nicht auf, weil der keine CSP
 * setzt. Genau so lag ueber.html von Mai bis Juli 2026 in Produktion ohne
 * sein halbes Layout. Dieser Test faengt den Rueckfall.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')
const htmlFiles = readdirSync(publicDir).filter(f => f.endsWith('.html'))

describe('Statische Seiten unter CSP style-src self', () => {
  it('findet ueberhaupt statische Seiten', () => {
    expect(htmlFiles.length).toBeGreaterThan(0)
  })

  it.each(htmlFiles)('%s enthaelt keinen <style>-Block', file => {
    const html = readFileSync(join(publicDir, file), 'utf8')
    expect(html).not.toMatch(/<style[\s>]/i)
  })

  it('ueber.html verlinkt sein ausgelagertes Stylesheet', () => {
    const html = readFileSync(join(publicDir, 'ueber.html'), 'utf8')
    expect(html).toContain('/static.css')
    expect(html).toContain('/ueber.css')
  })
})
