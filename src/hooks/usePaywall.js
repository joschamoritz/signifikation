import { useEffect } from 'react'

// Erkennt erfolgreiche Rückkehr von Mollie (?payment=success),
// bereinigt die URL und lädt Entitlements neu.
// Weil die eigentliche Freischaltung per Webhook asynchron passiert,
// wird nach einem initialen Refresh einmalig nach 4 s nochmals geprüft.
export function usePaywall({ refreshEntitlements }) {
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
    refreshEntitlements().then(({ ok, payload } = {}) => {
      if (ok && payload?.gesamtausgabe?.unlocked) return
      // Webhook noch nicht verarbeitet – einmalig nach kurzer Verzögerung nochmals prüfen
      timer = setTimeout(() => refreshEntitlements(), 4000)
    })
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
