import { useEffect } from 'react'
import { fetchWithRetry } from '../utils/fetchWithRetry'

async function defaultParse(response) {
  if (response.ok) return response.json()
  throw new Error(`HTTP ${response.status}`)
}

/**
 * Generischer Resource-Hook: fetcht `url`, sobald `deps` sich ändern.
 * Kapselt AbortController, cancelled-Flag und Retry-Logik (via fetchWithRetry).
 *
 * @param {object}   options
 * @param {string}   options.url            Zu fetchender Endpoint.
 * @param {any[]}    [options.deps=[]]      React-Effect-Dependencies.
 * @param {boolean}  [options.enabled=true] Wenn false, läuft kein Fetch.
 * @param {Function} [options.onStart]      Sync-Callback vor dem Fetch.
 * @param {Function} [options.parseResponse] async (response) => data.
 *                                          Wirft, um onError auszulösen.
 *                                          Default: r.ok ? r.json() : throw.
 * @param {Function} [options.onSuccess]    (data) => void; nur wenn nicht cancelled.
 * @param {Function} [options.onError]      (err) => void; ohne AbortError.
 */
export function useApiResource({
  url,
  deps = [],
  enabled = true,
  onStart,
  parseResponse = defaultParse,
  onSuccess,
  onError,
}) {
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const controller = new AbortController()

    onStart?.()

    fetchWithRetry(url, { signal: controller.signal })
      .then((response) => {
        if (cancelled) return undefined
        return parseResponse(response)
      })
      .then((data) => {
        if (cancelled) return
        onSuccess?.(data)
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        onError?.(err)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
