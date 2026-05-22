import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import { installCsrfFetch } from './utils/installCsrfFetch.js'
import { initNativeBearerToken } from './utils/apiFetch.js'
import { registerPwa } from './pwa.js'
import App from './App.jsx'

// Capacitor (TestFlight/Play Store): App-Bundle wird vom OS atomar aktualisiert,
// es gibt also weder eine "alte index.html mit kaputten Asset-Hashes" noch
// einen Service-Worker-Update-Pfad. Beide Mechanismen unten würden auf Native
// nur Schaden anrichten:
//   - Asset-Fail-Recovery könnte bei einem beliebigen Plugin-Asset-404 in
//     einen Reload-Loop laufen (sessionStorage ist in WKWebView nicht
//     zuverlässig persistent → Loop-Schutz wirkungslos).
//   - Service Worker funktionieren unter capacitor:// nicht als secure context
//     → registerSW würde nur Fehler werfen.
const IS_NATIVE = Capacitor.isNativePlatform()

// CSRF-Header für alle State-Changing-Requests setzen, bevor App rendert.
installCsrfFetch()

// Asset-Fail-Recovery (Web only): Wenn nach einem Deploy ein gecachter Client
// noch auf eine alte index.html mit nicht mehr existierenden Asset-Hashes
// verweist, schlägt der <script>-Load fehl → weiße Seite. Capture-Phase, weil
// Script-Load-Errors nicht bubblen. sessionStorage-Flag verhindert Loop.
if (!IS_NATIVE && typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const target = event.target
    if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) return
    const src = target.src || target.href || ''
    if (!/\/assets\//.test(src)) return
    try {
      if (sessionStorage.getItem('sig_asset_reload') === '1') return
      sessionStorage.setItem('sig_asset_reload', '1')
    } catch { /* sessionStorage blockiert – Reload-Loop dann selten und harmlos */ }
    window.location.reload()
  }, true)

  const clearFlag = () => { try { sessionStorage.removeItem('sig_asset_reload') } catch {} }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(clearFlag)
  else setTimeout(clearFlag, 2000)
}

// Native-Bearer-Token aus dem Keychain in den In-Memory-Cache ziehen, bevor
// die App rendert – sonst läuft die erste /auth/get-session Anfrage ohne
// Authorization-Header und der Nutzer wird scheinbar abgemeldet.
function renderApp() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

initNativeBearerToken().then(renderApp, renderApp)

// Service Worker nur im Web registrieren. In Capacitor wäre das ein No-Op mit
// Fehlerlog, weil capacitor:// kein secure context für SW ist.
if (!IS_NATIVE) registerPwa()
