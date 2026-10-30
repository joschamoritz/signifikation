// verifyAppleJWS mit einer Test-PKI (fixtures/apple-pki, erzeugt per erzeugen.sh):
// Nur eine Kette mit Apple-OIDs am Leaf und Intermediate, ES256 und P-256-Leaf ist gültig
// (Security-Audit 2026-10-30: vorher reichte jedes Zertifikat unter Apple Root CA - G3).
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { X509Certificate, createSign } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../mailer.js', () => ({
  isMailConfigured: vi.fn(() => false),
  sendPurchaseConfirmation: vi.fn(),
  sendPasswordResetMail: vi.fn(),
  sendWelcomeMail: vi.fn(),
}))

const { verifyAppleJWS } = await import('../routes/iap.js')

const PKI = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'apple-pki')
const lies = (name) => readFileSync(join(PKI, name), 'utf8')
const der = (name) => new X509Certificate(lies(`${name}.pem`)).raw.toString('base64')
const ROOT = new Set([new X509Certificate(lies('root.pem')).fingerprint256.replace(/:/g, '').toLowerCase()])
const PAYLOAD = { productId: 'de.signifikation.gesamtausgabe.korpus', transactionId: 'tx-test-1' }

function jws({ leaf = 'leaf', inter = 'inter', alg = 'ES256', kette } = {}) {
  const header = { alg, x5c: kette ?? [der(leaf), der(inter), der('root')] }
  const kopf = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(PAYLOAD)).toString('base64url')}`
  const signer = createSign('SHA256')
  signer.update(kopf)
  const sig = signer.sign({ key: lies(`${leaf}.key`), dsaEncoding: 'ieee-p1363' })
  return `${kopf}.${sig.toString('base64url')}`
}

describe('verifyAppleJWS (Test-PKI)', () => {
  it('akzeptiert eine Kette mit Apple-OIDs, ES256 und P-256-Leaf', () => {
    expect(verifyAppleJWS(jws(), { rootFingerprints: ROOT })).toEqual(PAYLOAD)
  })

  it('lehnt die Kette mit der echten Root-Allowlist ab', () => {
    expect(() => verifyAppleJWS(jws())).toThrow(/Unbekannte Root-CA/)
  })

  it('lehnt ein Leaf ohne App-Store-OID ab', () => {
    expect(() => verifyAppleJWS(jws({ leaf: 'leaf-ohne-oid' }), { rootFingerprints: ROOT })).toThrow(/kein App-Store-Signaturzertifikat/)
  })

  it('lehnt ein Intermediate ohne WWDR-OID ab', () => {
    expect(() => verifyAppleJWS(jws({ leaf: 'leaf-unter-ohne', inter: 'inter-ohne-oid' }), { rootFingerprints: ROOT }))
      .toThrow(/kein Apple-WWDR-Zertifikat/)
  })

  it('lehnt ein RSA-Leaf ab', () => {
    expect(() => verifyAppleJWS(jws({ leaf: 'leaf-rsa' }), { rootFingerprints: ROOT })).toThrow(/kein P-256/)
  })

  it('lehnt einen anderen Algorithmus im Header ab', () => {
    expect(() => verifyAppleJWS(jws({ alg: 'RS256' }), { rootFingerprints: ROOT })).toThrow(/Algorithmus/)
  })

  it('lehnt eine Kette ab, deren Intermediate nicht der Aussteller des Leafs ist', () => {
    // Leaf stammt von „inter“, die Kette nennt das ebenfalls gültige „inter2“
    const kette = [der('leaf'), der('inter2'), der('root')]
    expect(() => verifyAppleJWS(jws({ kette }), { rootFingerprints: ROOT })).toThrow(/Zertifikatskette ungültig/)
  })

  it('lehnt eine Kette mit nur zwei Zertifikaten ab', () => {
    expect(() => verifyAppleJWS(jws({ kette: [der('leaf'), der('root')] }), { rootFingerprints: ROOT })).toThrow(/Zertifikatskette/)
  })
})
