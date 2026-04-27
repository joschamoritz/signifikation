import { useCallback, useState } from 'react'
import { API } from '../config'
import { lsGet, lsSet } from '../utils/storage'

export function useEntitlements() {
  const [gesamtausgabeUnlocked, setGesamtausgabeUnlocked] = useState(() => !!lsGet('sig_gesamtausgabe'))
  const [freeAccessToday, setFreeAccessToday] = useState(false)
  const [freeAccessLabel, setFreeAccessLabel] = useState(null)

  const syncEntitlementsFromResponse = useCallback((payload) => {
    // Permanenter Unlock (bezahlt oder lokal gecacht)
    const serverUnlocked = !!payload?.gesamtausgabe?.unlocked
    const localUnlocked = !!lsGet('sig_gesamtausgabe')
    const unlocked = serverUnlocked || localUnlocked
    if (unlocked) lsSet('sig_gesamtausgabe', '1')
    setGesamtausgabeUnlocked(unlocked)

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
      setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
    }
  }, [syncEntitlementsFromResponse])

  const unlockGesamtausgabe = useCallback(async () => {
    lsSet('sig_gesamtausgabe', '1')
    setGesamtausgabeUnlocked(true)

    try {
      const res = await fetch(`${API}/account/entitlements/gesamtausgabe/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      if (!res.ok) return
      const payload = await res.json()
      syncEntitlementsFromResponse(payload)
    } catch {
      // Lokaler Sofort-Unlock bleibt aktiv, auch wenn kein Konto/Netzwerk verfügbar ist.
    }
  }, [syncEntitlementsFromResponse])

  return {
    gesamtausgabeUnlocked: gesamtausgabeUnlocked || freeAccessToday,
    gesamtausgabePermanent: gesamtausgabeUnlocked,
    freeAccessToday,
    freeAccessLabel,
    refreshEntitlements,
    unlockGesamtausgabe,
  }
}
