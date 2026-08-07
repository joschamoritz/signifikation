import { useCallback, useEffect, useReducer, useState } from 'react'
import { API } from '../config'
import { lsGet, lsParse } from '../utils/storage'
import { loadHeuteCache, saveHeuteCache } from '../utils/heuteCache'
import { useApiResource } from './useApiResource'

const initialState = {
  lemmata: null, apiError: null, apiErrorKind: null,
  isOfflineFallback: false, serverDatum: null,
  thema: '', themaKurz: '', themaQuelle: '', lueckenfuellerLemma: null,
  wortzwilling: null, wortzwillingError: false,
  zeitenwende: null, zeitenwendeStatus: 'idle',
  spezialwoche: null,
}

function heuteFields(payload, offline) {
  return {
    isOfflineFallback: offline, apiError: null, apiErrorKind: null,
    serverDatum: payload.datum, lemmata: payload.lemmata,
    thema: payload.thema || '', themaKurz: payload.thema_kurz || '',
    themaQuelle: payload.thema_quelle || '',
    lueckenfuellerLemma: payload.lueckenfuellerLemma ?? null,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'HEUTE_LOADED':         return { ...state, ...heuteFields(action.payload, false) }
    case 'OFFLINE_FALLBACK':     return { ...state, ...heuteFields(action.payload, true) }
    case 'HEUTE_ERROR':          return { ...state, apiError: action.payload.message, apiErrorKind: action.payload.kind }
    case 'HEUTE_RESET_ERROR':    return { ...state, apiError: null, apiErrorKind: null }
    case 'WORTZWILLING_LOADING': return { ...state, wortzwilling: null, wortzwillingError: false }
    case 'WORTZWILLING_LOADED':  return { ...state, wortzwilling: action.payload, wortzwillingError: false }
    case 'WORTZWILLING_ERROR':   return { ...state, wortzwillingError: true }
    case 'ZEITENWENDE_LOADING':  return { ...state, zeitenwende: null, zeitenwendeStatus: 'loading' }
    case 'ZEITENWENDE_LOADED':   return { ...state, zeitenwende: action.payload, zeitenwendeStatus: 'ready' }
    case 'ZEITENWENDE_MISSING':  return { ...state, zeitenwende: null, zeitenwendeStatus: 'missing' }
    case 'ZEITENWENDE_ERROR':    return { ...state, zeitenwendeStatus: 'error' }
    case 'SPEZIALWOCHE_LOADED':  return { ...state, spezialwoche: action.payload }
    default: return state
  }
}

const MISSING = Symbol('missing')

export function useDailyContent() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [contentRequestId, setContentRequestId] = useState(0)
  const [wortzwillingRetry, setWortzwillingRetry] = useState(0)
  const [zeitenwendeRetry, setZeitenwendeRetry] = useState(0)

  const [wzPlayed, setWzPlayed] = useState(null)
  const [zwPlayed, setZwPlayed] = useState(null)
  const [lfPlayed, setLfPlayed] = useState(null)
  const [swKollPlayed, setSwKollPlayed] = useState(null)
  const [swWzPlayed, setSwWzPlayed] = useState(null)
  const [swZwPlayed, setSwZwPlayed] = useState(null)
  const [swLfPlayed, setSwLfPlayed] = useState(null)

  const seedPlayed = useCallback((datum) => {
    setWzPlayed(lsParse(lsGet(`sig_wz_${datum}`), null))
    setZwPlayed(lsParse(lsGet(`sig_zw_${datum}`), null))
    setLfPlayed(lsParse(lsGet(`sig_lf_${datum}`), null))
  }, [])

  useApiResource({
    url: `${API}/heute`, deps: [contentRequestId],
    parseResponse: async (r) => {
      if (r.ok) return r.json()
      const body = await r.json().catch(() => ({}))
      // Status mitführen: der Aufrufer muss "heute ist nichts eingeplant" (404)
      // von "Server nicht erreichbar" unterscheiden können. Ein Netzwerkfehler
      // lässt fetch selbst verwerfen — dort gibt es kein err.status.
      const err = new Error(body?.error || `HTTP ${r.status}`)
      err.status = r.status
      throw err
    },
    onSuccess: (payload) => {
      dispatch({ type: 'HEUTE_LOADED', payload })
      seedPlayed(payload.datum)
      saveHeuteCache(payload)
    },
    onError: (err) => {
      const cached = loadHeuteCache()
      if (cached?.datum && cached?.lemmata) {
        dispatch({ type: 'OFFLINE_FALLBACK', payload: cached })
        seedPlayed(cached.datum)
      } else {
        const kind = err?.status === 404 ? 'missing'
          : err?.status ? 'server'
          : 'offline'
        dispatch({ type: 'HEUTE_ERROR', payload: { message: err.message, kind } })
      }
    },
  })

  useApiResource({
    url: `${API}/wortzwilling`, deps: [wortzwillingRetry],
    onStart: () => dispatch({ type: 'WORTZWILLING_LOADING' }),
    parseResponse: async (r) => {
      if (r.ok) return r.json()
      if (r.status === 404) return null
      throw new Error(`HTTP ${r.status}`)
    },
    onSuccess: (data) => { if (data) dispatch({ type: 'WORTZWILLING_LOADED', payload: data }) },
    onError: () => dispatch({ type: 'WORTZWILLING_ERROR' }),
  })

  useApiResource({
    url: `${API}/zeitenwende`, deps: [zeitenwendeRetry],
    onStart: () => dispatch({ type: 'ZEITENWENDE_LOADING' }),
    parseResponse: async (r) => {
      if (r.ok) return r.json()
      if (r.status === 404) return MISSING
      throw new Error(`HTTP ${r.status}`)
    },
    onSuccess: (data) => dispatch(
      data === MISSING
        ? { type: 'ZEITENWENDE_MISSING' }
        : { type: 'ZEITENWENDE_LOADED', payload: data }
    ),
    onError: () => dispatch({ type: 'ZEITENWENDE_ERROR' }),
  })

  useApiResource({
    url: `${API}/spezialwoche`, deps: [contentRequestId],
    parseResponse: async (r) => (r.ok ? r.json() : null),
    onSuccess: (data) => {
      dispatch({ type: 'SPEZIALWOCHE_LOADED', payload: data ?? null })
      const w = data?.woche
      if (w) {
        setSwKollPlayed(lsParse(lsGet(`sig_sw_koll_${w}`), null))
        setSwWzPlayed(lsParse(lsGet(`sig_sw_wz_${w}`), null))
        setSwZwPlayed(lsParse(lsGet(`sig_sw_zw_${w}`), null))
        setSwLfPlayed(lsParse(lsGet(`sig_sw_lf_${w}`), null))
      }
    },
    onError: () => dispatch({ type: 'SPEZIALWOCHE_LOADED', payload: null }),
  })

  const retryWortzwilling = useCallback(() => setWortzwillingRetry((n) => n + 1), [])
  const retryZeitenwende = useCallback(() => setZeitenwendeRetry((n) => n + 1), [])
  const retryDailyContent = useCallback(() => {
    dispatch({ type: 'HEUTE_RESET_ERROR' })
    setContentRequestId((n) => n + 1)
  }, [])

  // Kommt das Netz zurueck, den Tagesinhalt automatisch nachladen. Ohne das
  // bleibt der Fehlerzustand bis zum App-Neustart stehen — der CTA ist
  // solange deaktiviert, es gaebe also keinen Weg zurueck.
  useEffect(() => {
    if (state.apiErrorKind !== 'offline') return undefined
    const onOnline = () => retryDailyContent()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [state.apiErrorKind, retryDailyContent])

  return {
    ...state,
    zeitenwendeError: state.zeitenwendeStatus === 'error',
    zeitenwendeMissing: state.zeitenwendeStatus === 'missing',
    retryWortzwilling, retryZeitenwende, retryDailyContent,
    wzPlayed, setWzPlayed, zwPlayed, setZwPlayed, lfPlayed, setLfPlayed,
    swKollPlayed, setSwKollPlayed, swWzPlayed, setSwWzPlayed,
    swZwPlayed, setSwZwPlayed, swLfPlayed, setSwLfPlayed,
  }
}
