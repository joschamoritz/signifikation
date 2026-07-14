// Wiederverwendbarer Bedienhinweis-Hook (↕ Wischen / ☞ Manicula) für Tabs mit
// Snap-Card-Navigation. Zeigt einmal pro App-Sitzung (sessionStorage, nicht
// dauerhaft — erscheint also bei jedem echten App-Start neu), verschwindet
// nach erster Scroll-Interaktion oder spätestens nach 8 s. Kann in den
// Einstellungen dauerhaft abgeschaltet werden (lsGet/lsSet, siehe
// KontoEinstellungenBlock „Bedienhinweise").
import { useState, useRef, useCallback, useEffect } from 'react'
import { lsGet } from '../utils/storage'
import { MOBILE_MEDIA_QUERY } from '../config'

export const HINTS_DISABLED_KEY = 'sig_hints_disabled'
const DURATION_MS = 8000
const FADE_MS = 400

export function useSwipeHint(sessionKey, enabled = true) {
  const [show, setShow] = useState(false)
  const [fade, setFade] = useState(false)
  const showTimer = useRef(null)
  const fadeTimer = useRef(null)

  const dismiss = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null }
    try { sessionStorage.setItem(`sig_hint_seen_${sessionKey}`, '1') } catch { /* egal */ }
    setFade(true)
    fadeTimer.current = setTimeout(() => setShow(false), FADE_MS)
  }, [sessionKey])

  useEffect(() => {
    if (!enabled) return undefined
    if (typeof window === 'undefined' || !window.matchMedia(MOBILE_MEDIA_QUERY).matches) return undefined
    if (lsGet(HINTS_DISABLED_KEY)) return undefined
    let seenThisSession = false
    try { seenThisSession = !!sessionStorage.getItem(`sig_hint_seen_${sessionKey}`) } catch { /* egal */ }
    if (seenThisSession) return undefined
    setShow(true)
    showTimer.current = setTimeout(dismiss, DURATION_MS)
    return () => { if (showTimer.current) clearTimeout(showTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, enabled])

  useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current)
      if (fadeTimer.current) clearTimeout(fadeTimer.current)
    }
  }, [])

  // An onScroll der Snap-Entries binden: erste Interaktion blendet sofort aus.
  const onInteract = useCallback(() => {
    if (show && !fade) dismiss()
  }, [show, fade, dismiss])

  return { show, fade, onInteract }
}
