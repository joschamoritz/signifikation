/**
 * admin.html bekommt Versionsnummern an den eigenen Assets, damit ein Deploy nicht eine Stunde
 * lang hinter dem Browser-Cache verschwindet (Backlog 28.10.).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { adminHtmlMitVersion } from '../routes/admin-core.js'

let tmp
let html
let assets

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'admin-html-'))
  assets = join(tmp, 'public')
  mkdirSync(assets)
  html = join(tmp, 'admin.html')
  writeFileSync(html, [
    '<link rel="stylesheet" href="/admin-assets/admin.css">',
    '<script src="/admin-assets/admin.js"></script>',
    '<script src="/admin-assets/fehlt.js"></script>',
    '<img src="/fonts/logo.png">',
  ].join('\n'))
  writeFileSync(join(assets, 'admin.css'), 'body{}')
  writeFileSync(join(assets, 'admin.js'), '1')
  utimesSync(join(assets, 'admin.js'), new Date('2026-10-01T10:00:00Z'), new Date('2026-10-01T10:00:00Z'))
})

afterAll(() => {
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* egal */ }
})

describe('adminHtmlMitVersion', () => {
  it('hängt an vorhandene Assets eine Version an, andere Verweise bleiben', () => {
    const out = adminHtmlMitVersion(html, assets)
    expect(out).toMatch(/href="\/admin-assets\/admin\.css\?v=[0-9a-z]+"/)
    expect(out).toMatch(/src="\/admin-assets\/admin\.js\?v=[0-9a-z]+"/)
    expect(out).toContain('src="/admin-assets/fehlt.js"')
    expect(out).toContain('src="/fonts/logo.png"')
  })

  it('ändert die Version, wenn sich die Datei ändert', () => {
    const vorher = adminHtmlMitVersion(html, assets).match(/admin\.js\?v=([0-9a-z]+)/)[1]
    utimesSync(join(assets, 'admin.js'), new Date('2026-10-29T12:00:00Z'), new Date('2026-10-29T12:00:00Z'))
    const nachher = adminHtmlMitVersion(html, assets).match(/admin\.js\?v=([0-9a-z]+)/)[1]
    expect(nachher).not.toBe(vorher)
  })
})
