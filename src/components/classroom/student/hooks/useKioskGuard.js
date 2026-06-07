// T-5.9 — Kiosk-Guard.
//
// Zwei Schutzmechanismen:
//   1. Multi-Tab-Sperre via BroadcastChannel mit Holder-Election.
//      Jeder Tab hat eine (t, id)-Signatur (Mount-Zeit + Zufalls-ID). Der
//      Tab mit der KLEINSTEN Signatur ist der „Holder" und darf spielen;
//      alle spaeteren Tabs sperren sich.
//
//      Ablauf beim Oeffnen eines zweiten Tabs:
//        - Neuer Tab postet 'hello'. Der bereits offene (aeltere) Holder
//          antwortet 'occupied' an die ID des neuen Tabs → neuer Tab sperrt.
//        - Hoert ein Tab umgekehrt ein 'hello' eines AELTEREN Tabs, sperrt
//          er sich sofort selbst (deckt gleichzeitiges Mounten ab).
//      Damit sperrt sich immer der NEUE Tab, der erste bleibt spielbar.
//
//   2. beforeunload-Warning, solange state ∈ {playing, submitted}.
//      Browser zeigt seinen generischen „Wirklich verlassen?"-Dialog —
//      verhindert versehentliches Reload mitten im Spiel.
//
// Browser ohne BroadcastChannel (sehr alt) bekommen keine Multi-Tab-
// Sperre — beforeunload greift trotzdem.

import { useEffect, useRef, useState } from 'react'

const CHANNEL_NAME = 'classroom-v2-kiosk'

function hasBroadcastChannel() {
  return typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function'
}

// Vergleicht zwei (t, id)-Signaturen. < 0 ⇒ a ist „aelter" (Holder-Vorrang).
function olderThan(a, b) {
  if (a.t !== b.t) return a.t - b.t
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function useKioskGuard({ code, currentState }) {
  const [locked, setLocked] = useState(false)
  // Stabile Signatur dieses Tabs ueber die gesamte Lebenszeit.
  const selfRef = useRef(null)
  if (selfRef.current === null) {
    selfRef.current = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      t: Date.now(),
    }
  }
  const lockedRef = useRef(false)
  useEffect(() => { lockedRef.current = locked }, [locked])

  // ── Multi-Tab-Sperre ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasBroadcastChannel() || !code) return undefined
    let ch
    try { ch = new BroadcastChannel(CHANNEL_NAME) } catch { return undefined }
    const self = selfRef.current

    function onMessage(ev) {
      const msg = ev?.data
      if (!msg || msg.code !== code || msg.from === self.id) return

      if (msg.type === 'hello') {
        const other = { t: msg.t, id: msg.from }
        if (olderThan(other, self) < 0) {
          // Es existiert ein aelterer Tab → wir sind nicht der Holder.
          setLocked(true)
        } else if (!lockedRef.current) {
          // Wir sind der aeltere (Holder) → den neuen Tab zur Sperre auffordern.
          try { ch.postMessage({ type: 'occupied', code, from: self.id, target: msg.from }) } catch {}
        }
      } else if (msg.type === 'occupied' && msg.target === self.id) {
        setLocked(true)
      }
    }

    ch.addEventListener('message', onMessage)
    // Anmelden — bereits offene Holder antworten mit 'occupied'.
    try { ch.postMessage({ type: 'hello', code, from: self.id, t: self.t }) } catch {}

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
