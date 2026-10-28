// @vitest-environment happy-dom
// Android-Pfad des Push-Hooks: FCM-Token als fcm_token, Kanal vor register(),
// Hinweis auf die Android-Einstellungen. iOS-Pfad: usePushNotifications.test.js.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const { listeners, push, order } = vi.hoisted(() => {
  const listeners = {}
  const order = []
  const push = {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    createChannel: vi.fn(async () => { order.push('createChannel') }),
    register: vi.fn(() => { order.push('register'); listeners.registration?.({ value: 'fcm-token' }) }),
    unregister: vi.fn(),
    addListener: vi.fn((name, cb) => {
      listeners[name] = cb
      return Promise.resolve({ remove: vi.fn(async () => { delete listeners[name] }) })
    }),
  }
  return { listeners, push, order }
})

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: push }))
vi.mock('../utils/apiFetch', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '../utils/apiFetch'
import { usePushNotifications } from './usePushNotifications'

const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) })
const subscribeCalls = () => apiFetch.mock.calls.filter(([url]) => url.endsWith('/push/subscribe'))

beforeEach(() => {
  localStorage.clear()
  order.length = 0
  apiFetch.mockImplementation((url) => (url.endsWith('/push/status') ? json({ subscribed: false, platform: null }) : json({ ok: true }, 201)))
})

afterEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(listeners)) delete listeners[k]
})

describe('usePushNotifications (Android)', () => {
  it('ist auf Android verfügbar', () => {
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.supported).toBe(true)
  })

  it('legt den Kanal vor register() an und meldet das Token als fcm_token', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'granted' })
    const { result } = renderHook(() => usePushNotifications())

    await result.current.subscribe()
    await waitFor(() => expect(subscribeCalls()).toHaveLength(1))
    expect(JSON.parse(subscribeCalls()[0][1].body)).toEqual({ platform: 'android', fcm_token: 'fcm-token' })
    expect(push.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 'erinnerungen' }))
    expect(order).toEqual(['createChannel', 'register'])
    await waitFor(() => expect(result.current.subscribed).toBe(true))
  })

  it('verweist bei verweigerter Berechtigung auf die Android-Einstellungen', async () => {
    push.checkPermissions.mockResolvedValue({ receive: 'prompt' })
    push.requestPermissions.mockResolvedValue({ receive: 'denied' })
    const { result } = renderHook(() => usePushNotifications())

    await result.current.subscribe()
    await waitFor(() => expect(result.current.error).toMatch(/Android-Einstellungen/))
    expect(push.register).not.toHaveBeenCalled()
  })
})
