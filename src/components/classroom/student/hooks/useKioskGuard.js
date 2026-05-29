// T-5.9 — Kiosk-Guard.
//
// Zwei Schutzmechanismen:
//   1. Multi-Tab-Sperre via BroadcastChannel.
//      Beim Mount POST'en wir 'claim' fuer den aktuellen Code. Empfangen wir
//      selbst 'claim' fuer denselben Code von einem anderen Tab, sind WIR
//      der zweite Tab → setLocked(true). Erste Tab erhaelt eigenes 'claim'
//      nicht zurueck (BroadcastChannel verteilt nur an OTHER frames/tabs).
//
//   2. beforeunload-Warning, solange state ∈ {playing, submitted}.
//      Browser zeigt seinen generischen „Wirklich verlassen?"-Dialog —
//      verhindert versehentliches Reload mitten im Spiel.
//
// Browser ohne BroadcastChannel (sehr alt) bekommen keine Multi-Tab-
// Sperre — beforeunload greift trotzdem.

import { useEffect, useState } from 'react'

const CHANNEL_NAME = 'classroom-v2-kiosk'

function hasBroadcastChannel() {
  return typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function'
}

export function useKioskGuard({ code, currentState }) {
  const [locked, setLocked] = useState(false)

  // ── Multi-Tab-Sperre ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasBroadcastChannel() || !code) return undefined
    let ch
    try { ch = new BroadcastChannel(CHANNEL_NAME) } catch { return undefined }

    function onMessage(ev) {
      const msg = ev?.data
      if (!msg || msg.code !== code) return
      if (msg.type === 'claim') {
        // Ein anderer Tab hat fuer denselben Code „claim" gepostet.
        // Wir sind der zweite Tab (BroadcastChannel verteilt nur an OTHER tabs).
        setLocked(true)
      }
    }

    ch.addEventListener('message', onMessage)
    // Unser eigener „claim" — andere Tabs reagieren mit setLocked(true).
    try { ch.postMessage({ type: 'claim', code, t: Date.now() }) } catch {}

    return () => {
      try { ch.removeEventListener('message', onMessage) } catch {}
      try { ch.close() } catch {}
    }
  }, [code])

  // ── beforeunload-Warning ──────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const armed = currentState === 'playing' || currentState === 'submitted'
    if (!armed) return undefined
    function handler(e) {
      e.preventDefault()
      // Browser ignorieren modernen Custom-Text; truthy returnValue reicht.
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [currentState])

  return { locked }
}
