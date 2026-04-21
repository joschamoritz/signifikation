import { flushSync } from 'react-dom'

export function startVT(callback) {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    callback()
    return
  }

  document.startViewTransition(() => flushSync(callback))
}
