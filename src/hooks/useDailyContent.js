import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'
import { lsGet, lsParse } from '../utils/storage'
import { fetchWithRetry } from '../utils/fetchWithRetry'

const CACHE_KEY = 'sig_cache_heute'

function saveHeuteCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, cachedAt: new Date().toISOString() }))
  } catch (_) {}
}

function loadHeuteCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY))
  } catch (_) {
    return null
  }
}

function getWZToday(key) {
  return lsParse(lsGet(key), null)
}

export function useDailyContent() {
  const [lemmata, setLemmata] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)
  const [serverDatum, setServerDatum] = useState(null)
  const [thema, setThema] = useState('')
  const [themaKurz, setThemaKurz] = useState('')
  const [themaQuelle, setThemaQuelle] = useState('')

  const [lueckenfuellerLemma, setLueckenfuellerLemma] = useState(null)
  const [wortzwilling, setWortzwilling] = useState(null)
  const [wortzwillingError, setWortzwillingError] = useState(false)
  const [wortzwillingRetry, setWortzwillingRetry] = useState(0)

  const [zeitenwende, setZeitenwende] = useState(null)
  const [zeitenwendeStatus, setZeitenwendeStatus] = useState('idle')
  const [zeitenwendeRetry, setZeitenwendeRetry] = useState(0)

  const [wzPlayed, setWzPlayed] = useState(null)
  const [zwPlayed, setZwPlayed] = useState(null)
  const [lfPlayed, setLfPlayed] = useState(null)
  const [contentRequestId, setContentRequestId] = useState(0)

  const [spezialwoche, setSpezialwoche] = useState(null)
  const [swKollPlayed, setSwKollPlayed] = useState(null)   // gespielt: { total, medal, ... }
  const [swWzPlayed,  setSwWzPlayed]  = useState(null)
  const [swZwPlayed,  setSwZwPlayed]  = useState(null)
  const [swLfPlayed,  setSwLfPlayed]  = useState(null)

  const triggerContentReload = useCallback(() => {
    setContentRequestId((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    fetchWithRetry(`${API}/heute`, { signal: controller.signal })
      .then((r) => r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then(({ datum, lemmata, thema, thema_kurz, thema_quelle, lueckenfuellerLemma: lfLemma }) => {
        if (cancelled) return
        setIsOfflineFallback(false)
        setServerDatum(datum)
        setLemmata(lemmata)
        setThema(thema || '')
        setThemaKurz(thema_kurz || '')
        setThemaQuelle(thema_quelle || '')
        setLueckenfuellerLemma(lfLemma ?? null)
        setWzPlayed(getWZToday(`sig_wz_${datum}`))
        setZwPlayed(lsParse(lsGet(`sig_zw_${datum}`), null))
        setLfPlayed(lsParse(lsGet(`sig_lf_${datum}`), null))
        saveHeuteCache({ datum, lemmata, thema, thema_kurz, thema_quelle, lueckenfuellerLemma: lfLemma })
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        const cached = loadHeuteCache()
        if (cached?.datum && cached?.lemmata) {
          setIsOfflineFallback(true)
          setServerDatum(cached.datum)
          setLemmata(cached.lemmata)
          setThema(cached.thema || '')
          setThemaKurz(cached.thema_kurz || '')
          setThemaQuelle(cached.thema_quelle || '')
          setLueckenfuellerLemma(cached.lueckenfuellerLemma ?? null)
          setWzPlayed(getWZToday(`sig_wz_${cached.datum}`))
          setZwPlayed(lsParse(lsGet(`sig_zw_${cached.datum}`), null))
          setLfPlayed(lsParse(lsGet(`sig_lf_${cached.datum}`), null))
        } else {
          setApiError(err.message)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [contentRequestId])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setWortzwillingError(false)
    setWortzwilling(null)
    fetchWithRetry(`${API}/wortzwilling`, { signal: controller.signal })
      .then((r) => {
        if (r.ok) return r.json()
        if (r.status === 404) return null
        return Promise.reject(new Error(`HTTP ${r.status}`))
      })
      .then((data) => {
        if (cancelled) return
        if (data) setWortzwilling(data)
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        setWortzwillingError(true)
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [wortzwillingRetry])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    setZeitenwendeStatus('loading')
    setZeitenwende(null)
    fetchWithRetry(`${API}/zeitenwende`, { signal: controller.signal })
      .then((r) => {
        if (r.ok) return r.json()
        if (r.status === 404) {
          if (!cancelled) setZeitenwendeStatus('missing')
          return null
        }
        return Promise.reject(new Error(`HTTP ${r.status}`))
      })
      .then((data) => {
        if (cancelled) return
        if (data) {
          setZeitenwende(data)
          setZeitenwendeStatus('ready')
        } else {
          setZeitenwende(null)
        }
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return
        setZeitenwendeStatus('error')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [zeitenwendeRetry])

  // ── Spezialwoche (Wort der Woche) ────────────────────────────
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    fetchWithRetry(`${API}/spezialwoche`, { signal: controller.signal })
      .then((r) => {
        if (r.ok) return r.json()
        return null
      })
      .then((data) => {
        if (cancelled) return
        setSpezialwoche(data ?? null)
        if (data?.woche) {
          const w = data.woche
          // Gelesene Played-States aus localStorage
          setSwKollPlayed(lsParse(lsGet(`sig_sw_koll_${w}`), null))
          setSwWzPlayed(lsParse(lsGet(`sig_sw_wz_${w}`), null))
          setSwZwPlayed(lsParse(lsGet(`sig_sw_zw_${w}`), null))
          setSwLfPlayed(lsParse(lsGet(`sig_sw_lf_${w}`), null))
        }
      })
      .catch(() => {
        if (!cancelled) setSpezialwoche(null)
      })

    return () => { cancelled = true; controller.abort() }
  }, [contentRequestId])

  const retryWortzwilling = useCallback(() => {
    setWortzwillingRetry((n) => n + 1)
  }, [])

  const retryZeitenwende = useCallback(() => {
    setZeitenwendeRetry((n) => n + 1)
  }, [])

  const retryDailyContent = useCallback(() => {
    setApiError(null)
    triggerContentReload()
  }, [triggerContentReload])

  return {
    lemmata,
    apiError,
    isOfflineFallback,
    serverDatum,
    thema,
    themaKurz,
    themaQuelle,
    lueckenfuellerLemma,
    wortzwilling,
    wortzwillingError,
    retryWortzwilling,
    zeitenwende,
    zeitenwendeError: zeitenwendeStatus === 'error',
    zeitenwendeMissing: zeitenwendeStatus === 'missing',
    retryZeitenwende,
    retryDailyContent,
    wzPlayed,
    setWzPlayed,
    zwPlayed,
    setZwPlayed,
    lfPlayed,
    setLfPlayed,
    // Spezialwoche (Wort der Woche)
    spezialwoche,
    swKollPlayed,
    setSwKollPlayed,
    swWzPlayed,
    setSwWzPlayed,
    swZwPlayed,
    setSwZwPlayed,
    swLfPlayed,
    setSwLfPlayed,
  }
}
