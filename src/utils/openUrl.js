import { Capacitor } from '@capacitor/core'

// Nur Webadressen: Links stammen aus den Spieldaten (Admin, Sicherungsdateien). Ein javascript:- oder
// intent:-Link darf weder im Browser noch im In-App-Browser landen (Security-Audit run-1).
const WEB_LINK = /^https?:\/\//i

export function istWebLink(url) {
  return typeof url === 'string' && WEB_LINK.test(url.trim())
}

/**
 * Öffnet eine URL plattformübergreifend korrekt:
 * - Native App (iOS/Android): über Capacitor Browser-Plugin (öffnet in-app Browser)
 * - Web: normales window.open
 */
export async function openUrl(url) {
  if (!istWebLink(url)) return
  if (Capacitor.isNativePlatform()) {
    // Dynamischer Import – Browser-Plugin nur in nativer Umgebung laden
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
