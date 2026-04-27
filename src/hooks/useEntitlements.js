import { useCallback, useState } from 'react'
import { API } from '../config'
import { lsGet, lsSet, lsRemove } from '../utils/storage'

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
      const res = await fetch(`${API}/account/entitlements`, {
        credentials: 'include',
      })
      if (!res.ok) {
        setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
        return
      }
      const payload = await res.json()
      syncEntitlementsFromResponse(payload)
    } catch {
      // Server nicht erreichbar – gecachten Wert beibehalten
      setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
    }
  }, [syncEntitlementsFromResponse])

  return {
    gesamtausgabeUnlocked: gesamtausgabeUnlocked || freeAccessToday,
    gesamtausgabePermanent: gesamtausgabeUnlocked,
    freeAccessToday,
    freeAccessLabel,
    refreshEntitlements,
  }
}
