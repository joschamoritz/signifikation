/**
 * Tests für fetchWithRetry (exponential backoff)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from './fetchWithRetry'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('fetchWithRetry', () => {
  it('gibt erfolgreiche Antwort direkt zurück (kein Retry)', async () => {
    const mockRes = new Response('ok', { status: 200 })
    global.fetch = vi.fn().mockResolvedValue(mockRes)

    const result = await fetchWithRetry('http://example.com')

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retried bei Netzwerkfehler und gibt erfolgreiche Antwort zurück', async () => {
    const mockRes = new Response('ok', { status: 200 })
    global.fetch = vi.fn()
      .mockRejectedValueOnce(new Error('Network'))
      .mockResolvedValueOnce(mockRes)

    const promise = fetchWithRetry('http://example.com', {}, 2, 400)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('wirft Fehler nach Ausschöpfen aller Retries', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network'))

    const promise = fetchWithRetry('http://example.com', {}, 2, 400)
    // Gleichzeitig: Timers vorantreiben UND auf Rejection warten
    await Promise.all([
      vi.runAllTimersAsync(),
      expect(promise).rejects.toThrow('Network'),
    ])
    expect(fetch).toHaveBeenCalledTimes(3)  // initial + 2 retries
  })

  it('retried NICHT bei HTTP-Fehlern (4xx/5xx)', async () => {
    const mockRes = new Response('Not Found', { status: 404 })
    global.fetch = vi.fn().mockResolvedValue(mockRes)

    const result = await fetchWithRetry('http://example.com', {}, 2, 400)

    // HTTP-Fehler → kein Retry, direkte Rückgabe
    expect(result.status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries=0 → kein Retry, Fehler wird sofort geworfen', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network'))

    await expect(fetchWithRetry('http://example.com', {}, 0, 400)).rejects.toThrow('Network')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('verdoppelt Delay bei jedem Retry (exponential backoff)', async () => {
    // Echte Timer verwenden: vi.runAllTimersAsync() ruft intern setTimeout(fn, 1)
    // auf, das wuerde durch den Spy erfasst und delays[1] korrumpieren.
    // Mit echten Timern + originalSetTimeout(fn, 0) laufen die Callbacks sofort,
    // ohne dass Vitest-Interna in die delays-Liste einfliessen.
    vi.useRealTimers()

    global.fetch = vi.fn().mockRejectedValue(new Error('Network'))
    const delays = []
    const originalSetTimeout = global.setTimeout
    vi.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
      delays.push(ms)
      return originalSetTimeout(fn, 0)  // sofort ausfuehren
    })

    // Kein vi.runAllTimersAsync() noetig: originalSetTimeout(fn, 0) loest sofort auf
    await fetchWithRetry('http://example.com', {}, 2, 400).catch(() => {})

    // Erster Retry: 400ms (400 * 2^0), zweiter: 800ms (400 * 2^1)
    expect(delays[0]).toBe(400)
    expect(delays[1]).toBe(800)
  })

  it('übergibt options korrekt an fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('ok'))
    const options = { headers: { Authorization: 'Bearer token' } }

    await fetchWithRetry('http://example.com', options)

    expect(fetch).toHaveBeenCalledWith('http://example.com', options)
  })
})
