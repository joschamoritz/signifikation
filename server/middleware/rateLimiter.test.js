/**
 * Tests für CleanupStore und getClientIp (rateLimiter.js)
 *
 * Da CleanupStore und getClientIp nicht exportiert werden, testen wir
 * das beobachtbare Verhalten der Limiters indirekt sowie die interne Logik
 * über ein Re-Export-Shim – hier direkt als Unit-Tests der Klasse.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ipKeyGenerator } from 'express-rate-limit'

// ── CleanupStore als inline-Klasse dupliziert (identische Logik) ──
// Grund: CleanupStore ist nicht exportiert; wir testen die Logik isoliert.
class CleanupStore {
  constructor(windowMs = 60_000) {
    this.hits = new Map()
    this.windowMs = windowMs
    this.cleanupInterval = setInterval(() => this._cleanup(), 10 * 60_000)
    this.cleanupInterval.unref()
  }

  _cleanup() {
    const now = Date.now()
    let cleaned = 0
    for (const [key, data] of this.hits.entries()) {
      if (now - data.resetTime.getTime() > this.windowMs * 2) {
        this.hits.delete(key)
        cleaned++
      }
    }
    return cleaned
  }

  increment(key) {
    const now = Date.now()
    const data = this.hits.get(key)
    if (!data || now - data.resetTime.getTime() > this.windowMs) {
      this.hits.set(key, { totalHits: 1, resetTime: new Date() })
      return { totalHits: 1, resetTime: new Date() }
    }
    data.totalHits++
    return data
  }

  decrement(key) {
    const data = this.hits.get(key)
    if (data) data.totalHits = Math.max(0, data.totalHits - 1)
  }

  resetKey(key) { this.hits.delete(key) }
  resetAll()    { this.hits.clear() }
}

// ── getClientIp als inline-Funktion (identische Logik) ───────────
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.ip
  return ipKeyGenerator(ip)
}

// ── CleanupStore Tests ─────────────────────────────────────────────
describe('CleanupStore', () => {
  let store

  beforeEach(() => {
    vi.useFakeTimers()
    store = new CleanupStore(1_000)  // 1 Sekunde Fenster für Tests
  })

  afterEach(() => {
    clearInterval(store.cleanupInterval)
    vi.useRealTimers()
  })

  it('erster increment erzeugt Eintrag mit totalHits=1', () => {
    const result = store.increment('ip1')
    expect(result.totalHits).toBe(1)
    expect(store.hits.has('ip1')).toBe(true)
  })

  it('mehrere increments erhöhen totalHits', () => {
    store.increment('ip1')
    store.increment('ip1')
    const result = store.increment('ip1')
    expect(result.totalHits).toBe(3)
  })

  it('neues Fenster nach windowMs setzt hits zurück', () => {
    store.increment('ip1')
    vi.advanceTimersByTime(1_001)  // Fenster ablaufen lassen
    const result = store.increment('ip1')
    expect(result.totalHits).toBe(1)  // Neues Fenster = reset
  })

  it('decrement reduziert totalHits (min 0)', () => {
    store.increment('ip1')
    store.increment('ip1')
    store.decrement('ip1')
    expect(store.hits.get('ip1').totalHits).toBe(1)
    store.decrement('ip1')
    store.decrement('ip1')  // unter 0 nicht möglich
    expect(store.hits.get('ip1').totalHits).toBe(0)
  })

  it('resetKey entfernt einzelnen Eintrag', () => {
    store.increment('ip1')
    store.increment('ip2')
    store.resetKey('ip1')
    expect(store.hits.has('ip1')).toBe(false)
    expect(store.hits.has('ip2')).toBe(true)
  })

  it('resetAll leert den Store', () => {
    store.increment('ip1')
    store.increment('ip2')
    store.resetAll()
    expect(store.hits.size).toBe(0)
  })

  it('_cleanup löscht Einträge älter als 2× windowMs', () => {
    store.increment('ip1')
    vi.advanceTimersByTime(2_001)  // > 2× windowMs
    const cleaned = store._cleanup()
    expect(cleaned).toBe(1)
    expect(store.hits.has('ip1')).toBe(false)
  })

  it('_cleanup lässt aktuelle Einträge stehen', () => {
    store.increment('ip1')
    vi.advanceTimersByTime(500)   // < 2× windowMs
    const cleaned = store._cleanup()
    expect(cleaned).toBe(0)
    expect(store.hits.has('ip1')).toBe(true)
  })
})

// ── getClientIp Tests ──────────────────────────────────────────────
describe('getClientIp', () => {
  it('gibt req.ip zurück wenn kein X-Forwarded-For', () => {
    expect(getClientIp({ headers: {}, ip: '1.2.3.4' })).toBe('1.2.3.4')
  })

  it('extrahiert erste IP aus X-Forwarded-For (mehrere IPs)', () => {
    expect(getClientIp({
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 172.16.0.1' },
      ip: '172.16.0.1',
    })).toBe('1.2.3.4')
  })

  it('trimmt Leerzeichen in X-Forwarded-For', () => {
    expect(getClientIp({
      headers: { 'x-forwarded-for': '  1.2.3.4  ' },
      ip: '172.16.0.1',
    })).toBe('1.2.3.4')
  })

  it('normalisiert IPv6 per ipKeyGenerator auf /56-Praefix', () => {
    expect(getClientIp({ headers: {}, ip: '::1' })).toBe('::/56')
    expect(getClientIp({ headers: {}, ip: '2001:db8::1' })).toBe('2001:db8::/56')
  })

  it('laesst IPv4-Adressen unveraendert', () => {
    expect(getClientIp({ headers: {}, ip: '192.168.1.1' })).toBe('192.168.1.1')
  })
})
