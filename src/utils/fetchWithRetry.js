/**
 * Fetch with exponential backoff retry.
 * Retries only on network errors (fetch throws), NOT on HTTP error responses (4xx/5xx).
 * Callers must check r.ok themselves.
 *
 * Jeder Versuch bekommt ein eigenes Zeitlimit. Ohne das haengt ein Request in
 * einem schlechten Netz am NSURLSession-Default von 60 s — mal drei Versuchen.
 * Apple testet routinemaessig mit dem Network Link Conditioner; der Nutzer sah
 * dort minutenlang „Lade …“. Der Service Worker hatte diesen Schutz bereits
 * (`networkTimeoutSeconds: 3`), er laeuft in der nativen App aber bewusst nicht.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [retries=2]     max retry attempts after first failure
 * @param {number} [baseDelay=400] initial delay in ms; doubles each retry
 * @param {number} [timeoutMs=8000] Zeitlimit pro Versuch
 */
export const FETCH_TIMEOUT_MS = 8000

export async function fetchWithRetry(url, options = {}, retries = 2, baseDelay = 400, timeoutMs = FETCH_TIMEOUT_MS) {
  const outerSignal = options.signal
  let lastErr

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, baseDelay * 2 ** (attempt - 1)))
    }
    if (outerSignal?.aborted) {
      throw outerSignal.reason ?? new DOMException('Aborted', 'AbortError')
    }

    // Eigener Controller pro Versuch: er buendelt das Zeitlimit mit einem
    // moeglichen Abbruch des Aufrufers. Bewusst nicht `AbortSignal.any` —
    // das gibt es erst ab Safari 17.4, das Deployment-Target ist iOS 17.0.
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
    const forwardAbort = () => controller.abort()
    outerSignal?.addEventListener('abort', forwardAbort, { once: true })

    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } catch (err) {
      // Abbruch durch den Aufrufer (z. B. Unmount) unveraendert durchreichen —
      // useApiResource erkennt AbortError und unterdrueckt dann onError.
      if (outerSignal?.aborted) throw err
      // Ein Zeitlimit ist dagegen ein echter Fehlschlag: als normalen Fehler
      // weiterreichen, damit Retry und Fehleranzeige greifen.
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
