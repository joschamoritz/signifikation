import { describe, it, expect } from 'vitest'
import { buildAssetLinks } from './appLinks.js'

const FP_A = Array.from({ length: 32 }, () => 'AB').join(':')
const FP_B = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join(':')

describe('buildAssetLinks', () => {
  it('liefert null ohne Konfiguration', () => {
    expect(buildAssetLinks(undefined)).toBeNull()
    expect(buildAssetLinks('')).toBeNull()
  })

  it('baut den Eintrag für das App-Paket', () => {
    const [entry] = buildAssetLinks(FP_A)
    expect(entry.relation).toEqual(['delegate_permission/common.handle_all_urls'])
    expect(entry.target).toEqual({
      namespace: 'android_app',
      package_name: 'de.signifikation.app',
      sha256_cert_fingerprints: [FP_A],
    })
  })

  it('nimmt mehrere Fingerabdrücke, normalisiert Groß-/Kleinschreibung und Leerzeichen', () => {
    const [entry] = buildAssetLinks(` ${FP_A} , ${FP_B.toLowerCase()} `)
    expect(entry.target.sha256_cert_fingerprints).toEqual([FP_A, FP_B.toUpperCase()])
  })

  it('verwirft ungültige Einträge, behält gültige', () => {
    const [entry] = buildAssetLinks(`AB:CD, ${FP_A}`)
    expect(entry.target.sha256_cert_fingerprints).toEqual([FP_A])
    expect(buildAssetLinks('kein-fingerabdruck')).toBeNull()
  })
})
