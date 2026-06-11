import { useEffect, useRef } from 'react'

// Erkennt erfolgreiche Rückkehr von Mollie (?payment=success),
// bereinigt die URL und lädt Entitlements neu.
// Weil die eigentliche Freischaltung per Webhook asynchron passiert,
// wird nach einem initialen Refresh einmalig nach 4 s nochmals geprüft.
export function usePaywall({ refreshEntitlements }) {
  // Ref auf den aktuellen Callback: Effect läuft nur einmal beim Mount
  // (URL-Parameter prüfen), greift aber zur Ausführungszeit auf die
  // jeweils aktuelle refreshEntitlements-Closure zu. Ohne Ref würde
  // ein neuer Callback-Identity zwischen Mount und Timer-Fire dazu
  // führen, dass die alte (potentiell stale) Closure läuft.
  const refreshRef = useRef(refreshEntitlements)
  refreshRef.current = refreshEntitlements

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') !== 'success') return

    params.delete('payment')
    const nextSearch = params.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    )

    let timer
    let cancelled = false
    refreshRef.current().then(({ ok, payload } = {}) => {
      // Promise kann nach Unmount aufloesen: dann keinen Timer mehr setzen,
      // sonst liefe er nach der (bereits gelaufenen) Cleanup ungehindert weiter.
      if (cancelled) return
      if (ok && payload?.gesamtausgabe?.unlocked) return
      // Webhook noch nicht verarbeitet – einmalig nach kurzer Verzögerung nochmals prüfen
      timer = setTimeout(() => refreshRef.current(), 4000)
    })
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])
}
