/**
 * Einheitlicher API-Client (Review 2026-06-11, F-M4).
 *
 * Vorher existierten vier parallele Wege (apiFetch, fetchWithRetry, rohe
 * fetch()-Aufrufe, kioskFetch) mit inkonsistentem Auth-/Retry-Verhalten:
 * rohe Aufrufe liefen nativ OHNE Bearer und ohne Retry — sobald ein
 * Endpoint auth-pflichtig wird, bricht so etwas still.
 *
 * apiGet() kombiniert:
 *   - apiFetch: setzt nativ den Bearer aus dem Keychain-Cache
 *   - fetchWithRetry: Backoff bei NETZWERK-Fehlern (nie bei 4xx/5xx)
 *   - Fehlernormalisierung: wirft ApiError mit status + code
 *
 * kioskFetch (Classroom-Participant-Token) bleibt bewusst getrennt —
 * anderes Auth-Modell, eigene Fehlerklasse.
 */
import { apiFetch } from '../utils/apiFetch'
import { FETCH_TIMEOUT_MS } from '../utils/fetchWithRetry'

export class ApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// fetchWithRetry mit apiFetch als Transport verheiraten: fetchWithRetry
// ruft global fetch — wir reichen stattdessen eine Options-Ebene tiefer
// durch, indem wir den Retry-Loop hier nachbilden.
async function retryingApiFetch(url, options = {}, retries = 2, baseDelay = 400, timeoutMs = FETCH_TIMEOUT_MS) {
  const outerSignal = options.signal
  let lastErr

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** (attempt - 1)))
    }
    if (outerSignal?.aborted) {
      throw outerSignal.reason ?? new DOMException('Aborted', 'AbortError')
    }

    // Gleiches Zeitlimit-Muster wie in fetchWithRetry — siehe Begruendung dort.
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    const forwardAbort = () => controller.abort()
    outerSignal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      return await apiFetch(url, { ...options, signal: controller.signal })
    } catch (err) {
      if (outerSignal?.aborted) throw err
      if (!timedOut && (err?.name === 'AbortError' || err?.code === 'ABORT_ERR')) throw err
      lastErr = timedOut
        ? new Error(`Zeitüberschreitung nach ${timeoutMs} ms`)
        : err
    } finally {
      clearTimeout(timer)
      outerSignal?.removeEventListener('abort', forwardAbort)
    }
  }

  throw lastErr
}

/**
 * GET mit Bearer (nativ), Retry und normalisierten Fehlern.
 * @returns {Promise<any>} geparstes JSON
 * @throws {ApiError} bei HTTP-Fehlern, Original-Error bei Abort
 */
export async function apiGet(url, { signal, retries = 2 } = {}) {
  const res = await retryingApiFetch(url, { signal, credentials: 'include' }, retries)
  if (!res.ok) {
    let body = null
    try { body = await res.json() } catch { /* kein JSON-Body */ }
    throw new ApiError(body?.error || `HTTP ${res.status}`, {
      status: res.status,
      code: body?.code ?? null,
    })
  }
  return res.json()
}
