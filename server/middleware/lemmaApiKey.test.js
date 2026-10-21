import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashLemmaApiKey, requireLemmaApiKey } from './lemmaApiKey.js'

function fakeRes() {
  const res = { statusCode: 200, body: null }
  res.status = vi.fn((code) => { res.statusCode = code; return res })
  res.json = vi.fn((body) => { res.body = body; return res })
  return res
}

const req = (authorization) => ({ headers: authorization ? { authorization } : {}, ip: '198.51.100.9' })

describe('requireLemmaApiKey', () => {
  const vorher = process.env.LEMMA_API_KEY_SHA256
  beforeEach(() => { process.env.LEMMA_API_KEY_SHA256 = hashLemmaApiKey('richtiger-schluessel') })
  afterEach(() => { process.env.LEMMA_API_KEY_SHA256 = vorher })

  it('ist ohne eingerichteten Hash aus (fail closed)', () => {
    delete process.env.LEMMA_API_KEY_SHA256
    const res = fakeRes()
    const next = vi.fn()
    requireLemmaApiKey(req('Bearer richtiger-schluessel'), res, next)
    expect(res.statusCode).toBe(503)
    expect(next).not.toHaveBeenCalled()
  })

  it('lehnt einen ungültigen Hash in der Konfiguration ab', () => {
    process.env.LEMMA_API_KEY_SHA256 = 'kein-hash'
    const res = fakeRes()
    requireLemmaApiKey(req('Bearer richtiger-schluessel'), res, vi.fn())
    expect(res.statusCode).toBe(503)
  })

  it('lehnt Anfragen ohne Schlüssel ab', () => {
    const res = fakeRes()
    const next = vi.fn()
    requireLemmaApiKey(req(), res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('lehnt einen falschen Schlüssel ab', () => {
    const res = fakeRes()
    const next = vi.fn()
    requireLemmaApiKey(req('Bearer falscher-schluessel'), res, next)
    expect(res.statusCode).toBe(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('akzeptiert den Schlüssel nur im Bearer-Format', () => {
    const res = fakeRes()
    requireLemmaApiKey(req('richtiger-schluessel'), res, vi.fn())
    expect(res.statusCode).toBe(401)
  })

  it('lässt den richtigen Schlüssel durch, auch bei Großbuchstaben im Hash', () => {
    process.env.LEMMA_API_KEY_SHA256 = hashLemmaApiKey('richtiger-schluessel').toUpperCase()
    const res = fakeRes()
    const next = vi.fn()
    requireLemmaApiKey(req('Bearer richtiger-schluessel'), res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })
})
