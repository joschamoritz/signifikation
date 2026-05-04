export function logError(message, error, context) {
  const details = context ? `${message} ${JSON.stringify(context)}` : message
  const normalizedError = error instanceof Error ? error : new Error(String(error || details))

  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(normalizedError)
    return
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new ErrorEvent('error', { error: normalizedError, message: details }))
  }
}
