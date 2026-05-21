import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { installCsrfFetch } from './utils/installCsrfFetch.js'
import { initNativeBearerToken } from './utils/apiFetch.js'
import { registerPwa } from './pwa.js'
import App from './App.jsx'

// CSRF-Header für alle State-Changing-Requests setzen, bevor App rendert.
installCsrfFetch()

// Asset-Fail-Recovery: Wenn nach einem Deploy ein gecachter Client noch auf
// eine alte index.html mit nicht mehr existierenden Asset-Hashes verweist,
// schlägt der <script>-Load fehl → weiße Seite. Wir reagieren auf das
// error-Event in der Capture-Phase (Script-Load-Errors bubblen nicht) und
// erzwingen einen einmaligen Reload mit Cache-Bypass. sessionStorage-Flag
// verhindert eine Reload-Schleife, falls der Fehler vom Server kommt.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const target = event.target
    if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) return
    const src = target.src || target.href || ''
    if (!/\/assets\//.test(src)) return
    try {
      if (sessionStorage.getItem('sig_asset_reload') === '1') return
      sessionStorage.setItem('sig_asset_reload', '1')
    } catch { /* sessionStorage blockiert – Reload-Loop dann selten und harmlos */ }
    // location.reload() bypasst HTTP-Cache nicht, ruft aber den SW erneut auf.
    // Das reicht, weil der neue SW (mit clients.claim) nach skipWaiting den
    // frischen Precache liefert. Ohne SW: erneuter GET an Server, der die neue
    // index.html mit neuen Hashes ausliefert.
    window.location.reload()
  }, true)

  // Beim erfolgreichen App-Start (nach dem ersten Render) das Flag löschen.
  // requestIdleCallback statt setTimeout, damit es bei kritischer Last wartet.
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

// Service Worker registrieren (no-op in Dev). Aktiviert den Update-Detection-
// Flow: vite-plugin-pwa pollt regelmäßig auf einen neuen SW; sobald einer in
// `waiting` steht, feuert pwa.js → UpdateBanner wird sichtbar.
registerPwa()
