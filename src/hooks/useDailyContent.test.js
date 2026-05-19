// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// fetchWithRetry mocken damit Retry-Delays die Tests nicht verlangsamen
vi.mock('../utils/fetchWithRetry', () => ({
  fetchWithRetry: vi.fn(),
}))

import { fetchWithRetry } from '../utils/fetchWithRetry'
import { useDailyContent } from './useDailyContent'

const HEUTE_OK = {
  datum: '2099-03-15',
  lemmata: [{ id: 'test', lemma: 'Test', pos: 'Substantiv' }],
  thema: 'Natur',
  thema_kurz: 'N',
  thema_quelle: '',
  lueckenfuellerLemma: null,
}

const WZ_OK = {
  wortA: 'Tag', wortB: 'Nacht', pos: 'Substantiv',
  kollokatoren: [{ wort: 'hell', zuordnung: 'A' }],
  notiz: '', link: '',
}

const ZW_OK = {
  lemma: 'Wandel', words: [{ word: 'Klimawandel', freq: 10 }],
  ipa: 'ˈvan.dl̩', definitionen: ['Veränderung'], notiz: '', link: '',
}

function makeResponse(data, { status = 200 } = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  })
}

function mockAllEndpoints({ heute = HEUTE_OK, wz = WZ_OK, zw = ZW_OK } = {}) {
  fetchWithRetry.mockImplementation((url) => {
    if (url.includes('/heute')) {
      return heute ? makeResponse(heute) : makeResponse({ error: 'Kein Eintrag' }, { status: 404 })
    }
    if (url.includes('/wortzwilling')) {
      if (wz === null) return makeResponse(null, { status: 404 })
      if (wz === 'error') return makeResponse(null, { status: 500 })
      return makeResponse(wz)
    }
    if (url.includes('/zeitenwende')) {
      if (zw === null) return makeResponse(null, { status: 404 })
      if (zw === 'error') return makeResponse(null, { status: 500 })
      return makeResponse(zw)
    }
    if (url.includes('/spezialwoche')) {
      return makeResponse(null)
    }
    return makeResponse(null, { status: 500 })
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('useDailyContent – /heute', () => {
  it('setzt lemmata und serverDatum nach erfolgreicher API-Antwort', async () => {
    mockAllEndpoints()
    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.lemmata).not.toBeNull())

    expect(result.current.serverDatum).toBe('2099-03-15')
    expect(result.current.lemmata).toHaveLength(1)
    expect(result.current.lemmata[0].lemma).toBe('Test')
    expect(result.current.thema).toBe('Natur')
    expect(result.current.themaKurz).toBe('N')
    expect(result.current.isOfflineFallback).toBe(false)
    expect(result.current.apiError).toBeNull()
  })

  it('setzt thema auf leer wenn API leer zurückgibt', async () => {
    mockAllEndpoints({ heute: { ...HEUTE_OK, thema: '', thema_kurz: '', thema_quelle: '' } })
    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.lemmata).not.toBeNull())

    expect(result.current.thema).toBe('')
    expect(result.current.themaKurz).toBe('')
  })

  it('fällt bei Netzwerkfehler auf localStorage-Cache zurück', async () => {
    const d = new Date()
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    localStorage.setItem('sig_cache_heute', JSON.stringify({
      ...HEUTE_OK,
      datum: todayStr,
      cachedAt: new Date().toISOString(),
    }))

    fetchWithRetry.mockImplementation((url) => {
      if (url.includes('/heute')) return Promise.reject(new Error('Network'))
      if (url.includes('/wortzwilling')) return makeResponse(WZ_OK)
      if (url.includes('/zeitenwende')) return makeResponse(ZW_OK)
      return makeResponse(null)
    })

    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.isOfflineFallback).toBe(true))

    expect(result.current.serverDatum).toBe(todayStr)
    expect(result.current.lemmata).toHaveLength(1)
    expect(result.current.apiError).toBeNull()
  })

  it('setzt apiError wenn kein Cache und Netzwerkfehler', async () => {
    fetchWithRetry.mockImplementation((url) => {
      if (url.includes('/heute')) return Promise.reject(new Error('Network'))
      return makeResponse(null)
    })

    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.apiError).not.toBeNull())

    expect(result.current.lemmata).toBeNull()
    expect(result.current.isOfflineFallback).toBe(false)
  })

  it('ignoriert veralteten Cache (datum von gestern) bei Netzwerkfehler', async () => {
    localStorage.setItem('sig_cache_heute', JSON.stringify({
      ...HEUTE_OK,
      datum: '2000-01-01',
      cachedAt: '2000-01-01T10:00:00.000Z',
    }))

    fetchWithRetry.mockImplementation((url) => {
      if (url.includes('/heute')) return Promise.reject(new Error('Network'))
      return makeResponse(null)
    })

    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.apiError).not.toBeNull())

    expect(result.current.lemmata).toBeNull()
    expect(result.current.isOfflineFallback).toBe(false)
  })
})

describe('useDailyContent – /wortzwilling', () => {
  it('setzt wortzwilling bei erfolgreicher Antwort', async () => {
    mockAllEndpoints()
    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.wortzwilling).not.toBeNull())

    expect(result.current.wortzwilling.wortA).toBe('Tag')
    expect(result.current.wortzwillingError).toBe(false)
  })

  it('setzt wortzwilling=null ohne Fehler bei 404', async () => {
    mockAllEndpoints({ wz: null })
    const { result } = renderHook(() => useDailyContent())

    // Warten bis heute geladen ist, dann ist WZ auch verarbeitet
    await waitFor(() => expect(result.current.lemmata).not.toBeNull())

    expect(result.current.wortzwilling).toBeNull()
    expect(result.current.wortzwillingError).toBe(false)
  })

  it('setzt wortzwillingError=true bei Server-Fehler', async () => {
    mockAllEndpoints({ wz: 'error' })
    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.wortzwillingError).toBe(true))

    expect(result.current.wortzwilling).toBeNull()
  })
})

describe('useDailyContent – /zeitenwende', () => {
  it('setzt zeitenwende bei erfolgreicher Antwort', async () => {
    mockAllEndpoints()
    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.zeitenwende).not.toBeNull())

    expect(result.current.zeitenwende.lemma).toBe('Wandel')
    expect(result.current.zeitenwendeError).toBe(false)
    expect(result.current.zeitenwendeMissing).toBe(false)
  })

  it('setzt zeitenwendeMissing=true bei 404', async () => {
    mockAllEndpoints({ zw: null })
    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.zeitenwendeMissing).toBe(true))

    expect(result.current.zeitenwende).toBeNull()
    expect(result.current.zeitenwendeError).toBe(false)
  })

  it('setzt zeitenwendeError=true bei Server-Fehler', async () => {
    mockAllEndpoints({ zw: 'error' })
    const { result } = renderHook(() => useDailyContent())

    await waitFor(() => expect(result.current.zeitenwendeError).toBe(true))

    expect(result.current.zeitenwende).toBeNull()
    expect(result.current.zeitenwendeMissing).toBe(false)
  })
})
