/**
 * Fetch with exponential backoff retry.
 * Retries only on network errors (fetch throws), NOT on HTTP error responses (4xx/5xx).
 * Callers must check r.ok themselves.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [retries=2]   max retry attempts after first failure
 * @param {number} [baseDelay=400] initial delay in ms; doubles each retry
 */
export async function fetchWithRetry(url, options, retries = 2, baseDelay = 400) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, baseDelay * 2 ** (attempt - 1)))
    }
    try {
      const r = await fetch(url, options)
      return r
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}
