import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'
import { lsGet, lsSet, lsRemove } from '../utils/storage'
import { apiFetch } from '../utils/apiFetch'

export function useEntitlements() {
  const [gesamtausgabeUnlocked, setGesamtausgabeUnlocked] = useState(() => !!lsGet('sig_gesamtausgabe'))
  // Login-Status (für freies Kurs-Üben: Login statt Premium). Eigenes,
  // persistentes Flag: ein eingeloggter Basic-Nutzer (kein Premium) hat kein
  // sig_gesamtausgabe → würde sonst beim App-Start kurz „Anmelden" sehen, bis
  // /entitlements antwortet. sig_logged_in überbrückt das (Premium impliziert
  // ebenfalls eingeloggt, daher als Fallback mit ODER verknüpft).
  const [loggedIn, setLoggedIn] = useState(() => !!lsGet('sig_logged_in') || !!lsGet('sig_gesamtausgabe'))
  const [classroomTeacher, setClassroomTeacher] = useState(false)
  // Eigenes-Lemma-Tageskontingent (Phase 4). Optimistisch aus dem gecachten
  // Premium-Flag vorbelegt, damit ein zurückkehrender Premium-Nutzer sofort
  // „unbegrenzt" sieht; Server-Antwort ist maßgeblich.
  const [customLemma, setCustomLemma] = useState(() => (lsGet('sig_gesamtausgabe') ? { unlimited: true } : null))

  const syncEntitlementsFromResponse = useCallback((payload) => {
    // Server-Antwort ist maßgeblich – localStorage nur als Offline-Fallback (catch-Block)
    const serverUnlocked = !!payload?.gesamtausgabe?.unlocked
    if (serverUnlocked) {
      lsSet('sig_gesamtausgabe', '1')
    } else {
      lsRemove('sig_gesamtausgabe')
    }
    setGesamtausgabeUnlocked(serverUnlocked)
    // loggedIn: explizites Flag bevorzugt, sonst aus Premium ableiten (Premium ⇒ eingeloggt).
    const loggedInNow = payload?.loggedIn ?? serverUnlocked
    if (loggedInNow) lsSet('sig_logged_in', '1')
    else lsRemove('sig_logged_in')
    setLoggedIn(loggedInNow)
    setClassroomTeacher(!!payload?.classroomTeacher)
    setCustomLemma(payload?.customLemma ?? null)
  }, [])

  const refreshEntitlements = useCallback(async () => {
    const attempt = async () => {
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
    }
    try {
      return await attempt()
    } catch {
      // Netzwerk-Glitch beim App-Start (häufig auf Mobile): einmaliger Retry mit
      // kurzem Backoff, sonst bliebe ein eingeloggter Nutzer bei „Anmelden"
      // hängen, ohne dass ihm etwas angezeigt wird. Kein Timing-Hack — echter
      // Retry gegen einen transienten Fehler.
      await new Promise((r) => setTimeout(r, 1500))
      try {
        return await attempt()
      } catch {
        // weiterhin nicht erreichbar – gecachten Wert beibehalten
        setGesamtausgabeUnlocked(!!lsGet('sig_gesamtausgabe'))
        return { ok: false, code: 'network_error' }
      }
    }
  }, [syncEntitlementsFromResponse])

  useEffect(() => {
    refreshEntitlements()
  }, [refreshEntitlements])

  return {
    // Premium-Entitlement steuert nur noch Klassenraum/Kurs + Eigenes Lemma.
    // Alle vier Spielmodi sind dauerhaft frei.
    gesamtausgabeUnlocked,
    gesamtausgabePermanent: gesamtausgabeUnlocked,
    loggedIn,
    classroomTeacher,
    customLemma,
    refreshEntitlements,
  }
}
