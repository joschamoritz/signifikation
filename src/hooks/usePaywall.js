import { useCallback, useEffect, useState } from 'react'

export function usePaywall({ refreshEntitlements }) {
  const [isOpen, setIsOpen] = useState(false)

  // Rückkehr von Mollie nach erfolgreicher Zahlung: ?payment=success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') !== 'success') return

    // URL bereinigen
    params.delete('payment')
    const nextSearch = params.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    )

    // Entitlements vom Server neu laden (Mollie-Webhook hat Unlock bereits geschrieben)
    refreshEntitlements()
  }, [refreshEntitlements])

  const openPaywall = useCallback(() => setIsOpen(true), [])
  const closePaywall = useCallback(() => setIsOpen(false), [])

  return { isPaywallOpen: isOpen, openPaywall, closePaywall }
}
