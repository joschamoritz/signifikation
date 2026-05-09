import { Capacitor } from '@capacitor/core'

/**
 * Öffnet eine URL plattformübergreifend korrekt:
 * - Native App (iOS/Android): über Capacitor Browser-Plugin (öffnet in-app Browser)
 * - Web: normales window.open
 */
export async function openUrl(url) {
  if (!url) return
  if (Capacitor.isNativePlatform()) {
    // Dynamischer Import – Browser-Plugin nur in nativer Umgebung laden
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
