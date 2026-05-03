import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'
import { lsGet, lsParse } from '../utils/storage'
import { fetchWithRetry } from '../utils/fetchWithRetry'

function getWZToday(key) {
  return lsParse(lsGet(key), null)
}

export function useDailyContent() {
  const [lemmata, setLemmata] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [serverDatum, setServerDatum] = useState(null)
  const [serverYear, setServerYear] = useState(null)
  const [thema, setThema] = useState('')
  const [themaKurz, setThemaKurz] = useState('')
  const [themaQuelle, setThemaQuelle] = useState('')

  const [wortzwilling, setWortzwilling] = useState(null)
  const [wortzwillingError, setWortzwillingError] = useState(false)
  const [wortzwillingRetry, setWortzwillingRetry] = useState(0)

  const [zeitenwende, setZeitenwende] = useState(null)
  const [zeitenwendeStatus, setZeitenwendeStatus] = useState('idle')
  const [zeitenwendeRetry, setZeitenwendeRetry] = useState(0)

  const [wzPlayed, setWzPlayed] = useState(null)
  const [zwPlayed, setZwPlayed] = useState(null)

  useEffect(() => {
    fetchWithRetry(`${API}/heute`)
      .then((r) => r.ok ? r.json() : r.json().then((d) => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then(({ datum, year, lemmata, thema, thema_kurz, thema_quelle }) => {
        setServerDatum(datum)
        if (year) setServerYear(year)
        setLemmata(lemmata)
        if (thema) setThema(thema)
        if (thema_kurz) setThemaKurz(thema_kurz)
        if (thema_quelle) setThemaQuelle(thema_quelle)
        setWzPlayed(getWZToday(`sig_wz_${datum}`))
        setZwPlayed(lsParse(lsGet(`sig_zw_${datum}`), null))
      })
      .catch((err) => setApiError(err.message))
  }, [])

  useEffect(() => {
    setWortzwillingError(false)
    setWortzwilling(null)
    fetchWithRetry(`${API}/wortzwilling`)
      .then((r) => {
        if (r.ok) return r.json()
        if (r.status === 404) return null
        return Promise.reject(new Error(`HTTP ${r.status}`))
      })
      .then((data) => { if (data) setWortzwilling(data) })
      .catch(() => setWortzwillingError(true))
  }, [wortzwillingRetry])

  useEffect(() => {
    setZeitenwendeStatus('loading')
    setZeitenwende(null)
    fetchWithRetry(`${API}/zeitenwende`)
      .then((r) => {
        if (r.ok) return r.json()
        if (r.status === 404) {
          setZeitenwendeStatus('missing')
          return null
        }
        return Promise.reject(new Error(`HTTP ${r.status}`))
      })
      .then((data) => {
        if (data) {
          setZeitenwende(data)
          setZeitenwendeStatus('ready')
        }
      })
      .catch(() => setZeitenwendeStatus('error'))
  }, [zeitenwendeRetry])

  const retryWortzwilling = useCallback(() => {
    setWortzwillingRetry((n) => n + 1)
  }, [])

  const retryZeitenwende = useCallback(() => {
    setZeitenwendeRetry((n) => n + 1)
  }, [])

  return {
    lemmata,
    apiError,
    serverDatum,
    serverYear,
    thema,
    themaKurz,
    themaQuelle,
    wortzwilling,
    wortzwillingError,
    retryWortzwilling,
    zeitenwende,
    zeitenwendeError: zeitenwendeStatus === 'error',
    zeitenwendeMissing: zeitenwendeStatus === 'missing',
    retryZeitenwende,
    wzPlayed,
    setWzPlayed,
    zwPlayed,
    setZwPlayed,
  }
}
