import { useCallback, useState } from 'react'
import { API } from '../config'
import { lsGet, lsSet } from '../utils/storage'

export function useEntitlements() {
  const [gesamtausgabeUnlocked, setGesamtausgabeUnlocked] = useState(() => !!lsGet('sig_gesamtausgabe'))

  const syncEntitlementsFromResponse = useCallback((payload) => {
    const serverUnlocked = !!payload?.gesamtausgabe?.unlocked
    const localUnlocked = !!lsGet('sig_gesamtausgabe')
    const unlocked = serverUnlocked || localUnlocked
    if (unlocked) lsSet('sig_gesamtausgabe', '1')
    setGesamtausgabeUnlocked(unlocked)
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
    gesamtausgabeUnlocked,
    refreshEntitlements,
    unlockGesamtausgabe,
  }
}
