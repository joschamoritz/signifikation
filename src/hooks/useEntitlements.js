import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'
import { lsGet, lsSet, lsRemove } from '../utils/storage'
import { apiFetch } from '../utils/apiFetch'

export function useEntitlements() {
  const [gesamtausgabeUnlocked, setGesamtausgabeUnlocked] = useState(() => !!lsGet('sig_gesamtausgabe'))
  const [freeAccessToday, setFreeAccessToday] = useState(false)
  const [freeAccessLabel, setFreeAccessLabel] = useState(null)

  const syncEntitlementsFromResponse = useCallback((payload) => {
    // Server-Antwort ist maßgeblich – localStorage nur als Offline-Fallback (catch-Block)
    const serverUnlocked = !!payload?.gesamtausgabe?.unlocked
    if (serverUnlocked) {
      lsSet('sig_gesamtausgabe', '1')
    } else {
      lsRemove('sig_gesamtausgabe')
    }
    setGesamtausgabeUnlocked(serverUnlocked)

    // Temporärer Free-Access (Sonntag / Freitag) – nicht in localStorage
    const free = !!payload?.freeAccessToday
    setFreeAccessToday(free)
    setFreeAccessLabel(free ? (payload?.freeAccessLabel ?? null) : null)
  }, [])

  const refreshEntitlements = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/account/entitlements`, {
        credentials: 'include',
      })
      if (!res.ok) {
        setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
        return { ok: false, code: 'http_error' }
      }
      const payload = await res.json()
      syncEntitlementsFromResponse(payload)
      return { ok: true, payload }
    } catch {
      // Server nicht erreichbar – gecachten Wert beibehalten
      setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
      return { ok: false, code: 'network_error' }
    }
  }, [syncEntitlementsFromResponse])

  useEffect(() => {
    refreshEntitlements()
  }, [refreshEntitlements])

  return {
    gesamtausgabeUnlocked: gesamtausgabeUnlocked || freeAccessToday,
    gesamtausgabePermanent: gesamtausgabeUnlocked,
    freeAccessToday,
    freeAccessLabel,
    refreshEntitlements,
  }
}
