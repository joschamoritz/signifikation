// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const { listeners, push } = vi.hoisted(() => {
  const listeners = {}
  const push = {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(() => listeners.registration?.({ value: 'neues-token' })),
    unregister: vi.fn(),
    addListener: vi.fn((name, cb) => {
      listeners[name] = cb
      return Promise.resolve({ remove: vi.fn(async () => { delete listeners[name] }) })
    }),
  }
  return { listeners, push }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }))
vi.mock('../utils/apiFetch', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '../utils/apiFetch'
import { usePushNotifications } from './usePushNotifications'

const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
const subscribeCalls = () => apiFetch.mock.calls.filter(([url]) => url.endsWith('/push/subscribe'))

beforeEach(() => {
  localStorage.clear()
  apiFetch.mockImplementation((url) => (url.endsWith('/push/status') ? json({ subscribed: true, platform: 'ios' }) : json({ ok: true }, 201)))
})

afterEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(listeners)) delete listeners[k]
})

describe('usePushNotifications', () => {
  it('meldet nach einer Neuinstallation das neue Geräte-Token still an', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'granted' })
    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => expect(subscribeCalls()).toHaveLength(1))
    expect(JSON.parse(subscribeCalls()[0][1].body)).toEqual({ platform: 'ios', apns_token: 'neues-token' })
    expect(result.current.subscribed).toBe(true)
    expect(localStorage.getItem('sig-push-subscribed')).toBe('true')
  })

  it('zeigt „aus", wenn Mitteilungen in den iOS-Einstellungen abgeschaltet sind', async () => {
    localStorage.setItem('sig-push-subscribed', 'true')
    push.checkPermissions.mockResolvedValue({ receive: 'denied' })
    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => expect(result.current.subscribed).toBe(false))
    expect(push.register).not.toHaveBeenCalled()
    expect(localStorage.getItem('sig-push-subscribed')).toBe(null)
  })

  it('registriert nichts, wenn weder Gerät noch Server ein Abo kennen', async () => {
    apiFetch.mockImplementation(() => json({ subscribed: false, platform: null }))
    push.checkPermissions.mockResolvedValue({ receive: 'granted' })
    renderHook(() => usePushNotifications())

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(push.register).not.toHaveBeenCalled()
  })

  it('verweist bei verweigerter Berechtigung auf die iOS-Einstellungen statt auf einen Fehlercode', async () => {
    apiFetch.mockImplementation(() => json({ subscribed: false, platform: null }))
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    push.requestPermissions.mockResolvedValue({ receive: 'denied' })
    const { result } = renderHook(() => usePushNotifications())

    await result.current.subscribe()
    await waitFor(() => expect(result.current.error).toMatch(/iOS-Einstellungen/))
    expect(result.current.requesting).toBe(false)
  })
})
