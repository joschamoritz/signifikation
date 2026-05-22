// @vitest-environment happy-dom
/**
 * Regression-Tests für apiFetch.js – speziell für den TestFlight-Bug
 * (Commit af21a02): Der Capacitor-Plugin-Proxy hat einen generischen
 * Property-Getter, der für JEDEN Property-Access (auch `.then`) eine
 * Funktion zurückliefert. Wenn `getSecureStorage()` den Proxy direkt
 * aus einer async function returned, macht JavaScript einen
 * Thenable-Check (`proxy.then(resolve, reject)`), der Proxy wirft
 * UNIMPLEMENTED, die Promise rejected, und die App startet nie.
 *
 * Dieser Test simuliert den Plugin-Proxy mit genau dem Verhalten und
 * stellt sicher, dass `initNativeBearerToken()` resolved – nicht
 * rejected oder hängt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hilfsfunktion: baut einen Capacitor-Plugin-Proxy-ähnlichen Mock. Für
// JEDEN Property-Access (auch `.then`) liefert er eine Funktion, die mit
// 'is not implemented on ios' rejected – exakt das echte Plugin-Verhalten.
function makeCapacitorProxyMock(implementedMethods = {}) {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop in implementedMethods) return implementedMethods[prop]
      // Symbol-Props (z. B. Symbol.toPrimitive) muss man ausnehmen, sonst
      // bricht der Mock bei String-Coercion / instanceof. Echter Capacitor
      // -Proxy unterscheidet ebenfalls Symbol-Keys.
      if (typeof prop === 'symbol') return undefined
      return (..._args) => Promise.reject(
        Object.assign(new Error(`"${String(prop)}() is not implemented on ios"`), {
          code: 'UNIMPLEMENTED',
        })
      )
    },
  })
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('apiFetch.initNativeBearerToken – Capacitor-Plugin-Proxy-Robustheit', () => {
  it('crasht NICHT, wenn SecureStorage ein generischer Plugin-Proxy ist (Regression af21a02)', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
      },
    }))
    // Plugin-Proxy mit funktionierenden get/set/remove, aber generischem
    // `then`-Getter (genau das Verhalten, das den Bootstrap killte).
    const storedValues = { 'sig_native_bearer': 'cached-token-123' }
    vi.doMock('@aparajita/capacitor-secure-storage', () => ({
      SecureStorage: makeCapacitorProxyMock({
        get: async (key) => storedValues[key] ?? null,
        set: async (key, value) => { storedValues[key] = value },
        remove: async (key) => { delete storedValues[key] },
      }),
    }))

    const apiFetchModule = await import('./apiFetch.js')

    // KERN-ASSERTION: initNativeBearerToken muss resolved werden, nicht
    // rejected oder hängen. Mit einer Timeout-Race fangen wir auch den
    // Hang-Fall (dangling Promise im Plugin-Proxy).
    const initWithTimeout = Promise.race([
      apiFetchModule.initNativeBearerToken(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000)),
    ])
    await expect(initWithTimeout).resolves.toBeUndefined()
  })

  it('rendert die App auch dann, wenn das Plugin-Modul gar nicht ladbar ist', async () => {
    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
      },
    }))
    vi.doMock('@aparajita/capacitor-secure-storage', () => {
      throw new Error('Module not found')
    })

    const apiFetchModule = await import('./apiFetch.js')
    await expect(apiFetchModule.initNativeBearerToken()).resolves.toBeUndefined()
  })

  it('verbraucht den Proxy nicht als Thenable beim async-return (Spec-Falle)', async () => {
    // Direkter Smoke-Test für den Thenable-Falle: Wenn jemand künftig
    // wieder versucht, einen Capacitor-Proxy aus einer async function
    // zurückzugeben, würde JavaScript proxy.then(...) aufrufen. Wir
    // tracken das mit einem Spion.
    const thenAccess = vi.fn()
    const proxy = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          thenAccess()
          return (resolve, reject) => reject(
            Object.assign(new Error('"then() is not implemented on ios"'), { code: 'UNIMPLEMENTED' })
          )
        }
        if (typeof prop === 'symbol') return undefined
        return async () => null
      },
    })

    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
    }))
    vi.doMock('@aparajita/capacitor-secure-storage', () => ({ SecureStorage: proxy }))

    const { initNativeBearerToken } = await import('./apiFetch.js')

    const result = Promise.race([
      initNativeBearerToken(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 2000)),
    ])
    await expect(result).resolves.toBeUndefined()
    // thenAccess darf bei null Aufrufen feuern – wir reichen den Proxy
    // nicht mehr direkt durch, sondern wrappen ihn in { get, set, remove }.
    expect(thenAccess).not.toHaveBeenCalled()
  })
})
