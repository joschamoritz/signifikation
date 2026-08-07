// Heartbeat 1: vor allen Modul-Imports. Wenn dieser Log nicht im Server-Log
// erscheint, kommt die App nicht mal bis zum main.jsx-Eval.
if (typeof window !== 'undefined' && window.__sigDebugPost) {
  window.__sigDebugPost('info', 'main.jsx', 'main.jsx eval start')
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import { installCsrfFetch } from './utils/installCsrfFetch.js'
import { initNativeBearerToken } from './utils/apiFetch.js'
import { applyStoredThemeEarly } from './hooks/useTheme.js'
import App from './App.jsx'

// Direkt nach den Imports, noch vor jedem Render: sonst blitzt bei
// Dark-Mode-Nutzern das helle Pergament auf, bis useTheme() im Effect greift.
applyStoredThemeEarly()

if (typeof window !== 'undefined' && window.__sigDebugPost) {
  window.__sigDebugPost('info', 'main.jsx', 'imports done, platform=' + (Capacitor?.getPlatform?.() || 'unknown'))
}

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

// Plattform-Marker auf <html> setzen, damit CSS gezielt iOS-/Android-spezifische
// Akzente setzen kann (z.B. Glass-Hintergründe nur in der Native-App, im Web
// bleibt die Wörterbuch-Ästhetik nackt).
try {
  const platform = Capacitor.getPlatform?.() || 'web'
  document.documentElement.setAttribute('data-platform', platform)
} catch { /* ignore – nicht kritisch */ }

// Capacitor-Plugin-Proxies werfen mit Code 'UNIMPLEMENTED', wenn eine Methode
// auf der aktuellen Plattform nicht implementiert ist (z. B. wenn ein Plugin
// im Package.swift fehlt oder eine optionale Methode nur auf Android existiert).
// Solche Promises sind oft "fire-and-forget" – wenn der Aufrufer nicht .catch()
// macht, landet die Rejection als 'unhandledrejection' und reißt die App in
// TestFlight komplett ab (weiße Seite, weil das Safety-Net feuert). Wir
// swallowen sie hier global, loggen aber den betroffenen Plugin-Namen, damit
// der Bug-Verursacher diagnostizierbar bleibt.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const code = reason?.code || reason?.errorMessage || ''
    const msg = reason?.message || String(reason || '')
    const isCapacitorUnimplemented =
      code === 'UNIMPLEMENTED' ||
      /is not implemented on (ios|android|web)/i.test(msg) ||
      /plugin.+not implemented/i.test(msg)
    if (isCapacitorUnimplemented) {
      event.preventDefault()
      // eslint-disable-next-line no-console
      console.warn('[Capacitor] Plugin-Methode nicht implementiert (ignoriert):', msg)
      if (window.__sigDebugPost) {
        window.__sigDebugPost('warn', 'capacitor-unimplemented', msg, reason?.stack)
      }
    }
  })
}

// CSRF-Header für alle State-Changing-Requests setzen, bevor App rendert.
installCsrfFetch()

// Service Worker nur im Web-Build registrieren (vite.config.js setzt
// injectRegister:null, damit cap sync keine Registrierung in die Native-Apps
// kopiert). PROD-Guard: im Vite-Dev-Server existiert /sw.js nicht.
if (!IS_NATIVE && import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      if (window.__sigDebugPost) {
        window.__sigDebugPost('warn', 'sw-register', 'SW-Registrierung fehlgeschlagen: ' + (err?.message || err))
      }
    })
  })
}

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
  if (typeof window !== 'undefined' && window.__sigDebugPost) {
    window.__sigDebugPost('info', 'main.jsx', 'renderApp() called')
  }
  try {
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    if (typeof window !== 'undefined' && window.__sigDebugPost) {
      window.__sigDebugPost('info', 'main.jsx', 'createRoot.render returned')
    }
    // Universal Links (Classroom-QR öffnet die App) — fire-and-forget, nativ-only.
    import('./utils/initDeepLinks.js').then((m) => m.initDeepLinks()).catch(() => {})
    // StoreKit-Transaktionen (Ask-to-Buy, abgebrochene Käufe) müssen ab dem
    // App-Start beobachtet werden — nicht erst beim Öffnen des Konto-Tabs.
    import('./utils/iapTransactionListener.js')
      .then((m) => m.initIapTransactionListener())
      .catch(() => {})
  } catch (err) {
    if (typeof window !== 'undefined' && window.__sigDebugPost) {
      window.__sigDebugPost('error', 'main.jsx', 'renderApp threw: ' + (err?.message || err), err?.stack)
    }
    throw err
  }
}

if (typeof window !== 'undefined' && window.__sigDebugPost) {
  window.__sigDebugPost('info', 'main.jsx', 'calling initNativeBearerToken')
}
initNativeBearerToken().then(renderApp, (err) => {
  if (typeof window !== 'undefined' && window.__sigDebugPost) {
    window.__sigDebugPost('error', 'main.jsx', 'initNativeBearerToken rejected: ' + (err?.message || err), err?.stack)
  }
  renderApp()
})
