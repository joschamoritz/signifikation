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
    // Mit echten Timern arbeiten, damit originalSetTimeout(fn, 0) sofort feuert
    // und vi.runAllTimersAsync() (das intern setTimeout(fn, 1) ruft) nicht
    // gebraucht wird.
    vi.useRealTimers()

    global.fetch = vi.fn().mockRejectedValue(new Error('Network'))
    const delays = []
    const originalSetTimeout = global.setTimeout
    vi.spyOn(global, 'setTimeout').mockImplementation((fn, ms) => {
      delays.push(ms)
      return originalSetTimeout(fn, 0)  // sofort ausfuehren
    })

    await fetchWithRetry('http://example.com', {}, 2, 400).catch(() => {})

    // Vitest-/Node-Interna koennen kleine setTimeout-Aufrufe (1–5ms) einstreuen
    // (z.B. fuer Promise-Scheduling im Worker). Wir filtern nur die echten
    // Backoff-Delays heraus — alles >= 100ms ist garantiert von fetchWithRetry.
    const backoffDelays = delays.filter((d) => d >= 100)
    // Erster Retry: 400ms (400 * 2^0), zweiter: 800ms (400 * 2^1)
    expect(backoffDelays[0]).toBe(400)
    expect(backoffDelays[1]).toBe(800)
  })

  it('übergibt options korrekt an fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('ok'))
    const options = { headers: { Authorization: 'Bearer token' } }

    await fetchWithRetry('http://example.com', options)

    expect(fetch).toHaveBeenCalledWith('http://example.com', options)
  })
})
