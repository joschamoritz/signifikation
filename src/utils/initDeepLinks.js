// Universal Links / App Links — Classroom-QR öffnet die App statt des Browsers.
//
// Nur nativ (Capacitor): die App bootet unter capacitor://localhost/, daher
// matched der Pfad-Router /c nie von allein. Wir lauschen auf appUrlOpen
// (https://signifikation.de/c/<code>) und navigieren die SPA in die Kiosk-
// Route. Web bleibt unberührt (dort öffnet der Link ohnehin /c/<code>).
//
// Defensiv: jeder Schritt ist in try/catch — ein fehlendes Plugin oder eine
// kaputte URL darf den App-Start NIE blockieren.

import { Capacitor } from '@capacitor/core'
import { matchClassroomRoute, navigate } from '../components/classroom/routing'

function handleUrl(url) {
  if (!url || typeof url !== 'string') return
  let path
  try { path = new URL(url).pathname } catch { return }
  const route = matchClassroomRoute(path)
  if (route.match) navigate(path)
}

export async function initDeepLinks() {
  try {
    if (!Capacitor?.isNativePlatform?.()) return
  } catch { return }
  try {
    const { App } = await import('@capacitor/app')
    // Kaltstart: evtl. liegt schon eine Launch-URL an (App via Link geöffnet).
    try {
      const launch = await App.getLaunchUrl()
      handleUrl(launch?.url)
    } catch { /* keine Launch-URL */ }
    // Warmstart: App läuft, Link wird getippt.
    App.addListener('appUrlOpen', (event) => handleUrl(event?.url))
  } catch {
    // Plugin nicht verfügbar → ohne Deep-Link-Support normal weiterlaufen.
  }
}
