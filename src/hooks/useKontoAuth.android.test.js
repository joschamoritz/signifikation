// @vitest-environment happy-dom
// Android-Pfad von useKontoAuth: Google nativ über das Capawesome-Plugin,
// ?nativeGoogle=1 an auth-options, Apple bleibt aus, Fehler bei falschem SHA-1.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const { google } = vi.hoisted(() => ({
  google: { initialize: vi.fn(async () => {}), signIn: vi.fn() },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))
vi.mock('@capawesome/capacitor-google-sign-in', () => ({ GoogleSignIn: google }))
vi.mock('../utils/apiFetch', () => ({ apiFetch: vi.fn(), setNativeBearerToken: vi.fn() }))

import { apiFetch, setNativeBearerToken } from '../utils/apiFetch'
import { useKontoAuth } from './useKontoAuth'

const WEB_ID = '123-web.apps.googleusercontent.com'
const res = (body, { status = 200, headers = {} } = {}) => Promise.resolve({
  ok: status < 400, status, json: () => Promise.resolve(body), headers: { get: (k) => headers[k] ?? null },
})

beforeEach(() => {
  global.fetch = vi.fn((url) => (url.includes('auth-options')
    ? res({ googleEnabled: true, googleClientId: WEB_ID, appleEnabled: true, passwordResetEnabled: true })
    : res(null, { status: 404 })))
  apiFetch.mockImplementation((url) => {
    if (url.includes('sign-in/social')) return res({ ok: true }, { headers: { 'set-auth-token': 'bearer-1' } })
    if (url.includes('get-session')) return res(null, { status: 401 })
    return res(null, { status: 404 })
  })
})

afterEach(() => { vi.clearAllMocks() })

async function setup() {
  const hook = renderHook(() => useKontoAuth({ onAuthStateChange: () => {} }))
  await waitFor(() => expect(hook.result.current.authOptions.googleEnabled).toBe(true))
  return hook
}

describe('useKontoAuth (Android)', () => {
  it('fragt auth-options mit nativeGoogle=1 und blendet Apple aus', async () => {
    const { result } = await setup()
    expect(global.fetch.mock.calls[0][0]).toMatch(/auth-options\?nativeGoogle=1$/)
    expect(result.current.authOptions.appleEnabled).toBe(false)
  })

  it('meldet sich nativ an und reicht ID-Token samt Nonce an den Server', async () => {
    google.signIn.mockResolvedValue({ idToken: 'google-jwt' })
    const { result } = await setup()

    await act(() => result.current.handleSocialSignIn('google'))

    expect(google.initialize).toHaveBeenCalledWith({ clientId: WEB_ID })
    const nonce = google.signIn.mock.calls[0][0].nonce
    expect(nonce).toBeTruthy()
    const call = apiFetch.mock.calls.find(([u]) => u.includes('sign-in/social'))
    expect(JSON.parse(call[1].body)).toEqual({ provider: 'google', idToken: { token: 'google-jwt', nonce } })
    expect(setNativeBearerToken).toHaveBeenCalledWith('bearer-1')
    expect(result.current.notice).toEqual({ type: 'success', text: 'Erfolgreich angemeldet.' })
  })

  it('bleibt still, wenn der Nutzer abbricht', async () => {
    google.signIn.mockRejectedValue(Object.assign(new Error('The user canceled the sign-in flow.'), { code: 'SIGN_IN_CANCELED' }))
    const { result } = await setup()
    await act(() => result.current.handleSocialSignIn('google'))
    expect(result.current.notice).toBeNull()
  })

  it('zeigt einen Fehler bei „Account reauth failed“ (fehlender Android-Client)', async () => {
    google.signIn.mockRejectedValue(Object.assign(new Error('Account reauth failed.'), { code: 'SIGN_IN_CANCELED' }))
    const { result } = await setup()
    await act(() => result.current.handleSocialSignIn('google'))
    expect(result.current.notice).toEqual({ type: 'error', text: 'Google-Anmeldung fehlgeschlagen.' })
  })
})
