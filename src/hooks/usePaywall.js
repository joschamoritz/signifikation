import { useEffect } from 'react'

// Erkennt erfolgreiche Rückkehr von Mollie (?payment=success),
// bereinigt die URL und lädt Entitlements neu.
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

    refreshEntitlements()
  }, [refreshEntitlements])
}
