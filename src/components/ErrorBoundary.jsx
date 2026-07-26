import { Component } from 'react'
import { Capacitor } from '@capacitor/core'
import { logError } from '../utils/logError'

// In der nativen App gibt es keine „Seite“, die man neu laden koennte — dort
// heisst dieselbe Aktion fuer den Nutzer „App neu starten“.
const IS_NATIVE = Capacitor.isNativePlatform()

// Erkennt Lazy-Chunk-Lade-Fehler. Treten typischerweise auf, wenn nach einem
// Deployment die alten gehashten Bundle-Dateien nicht mehr existieren und der
// Service Worker einen veralteten Eintrag im Cache hat.
function isChunkLoadError(error) {
  if (!error) return false
  if (error.name === 'ChunkLoadError') return true
  const msg = String(error.message || '')
  return /Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg)
}

// Verhindert eine Endlos-Reload-Schleife, falls auch nach Cache-Clearing
// noch ein ChunkLoadError fliegt.
const RELOAD_FLAG = 'sig_chunk_reload_attempt'

async function clearCachesAndReload() {
  try {
    // Service-Worker-Caches leeren, falls vorhanden.
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    // Service Worker selbst abmelden, damit beim Reload die neuen Bundle-
    // Hashes von server geholt werden (kein gecachter index.html).
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch (err) {
    logError('[ErrorBoundary] Cache-Clearing fehlgeschlagen', err)
  } finally {
    window.location.reload()
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    logError('[ErrorBoundary]', error, info)

    // Bei ChunkLoadError genau einmal automatisch SW-Caches leeren und reloaden.
    // Wenn das schon versucht wurde, fällt es auf die manuelle Fallback-UI zurück.
    if (isChunkLoadError(error)) {
      const alreadyTried = sessionStorage.getItem(RELOAD_FLAG)
      if (!alreadyTried) {
        sessionStorage.setItem(RELOAD_FLAG, '1')
        clearCachesAndReload()
      }
    }
  }

  render() {
    if (this.state.error) {
      const chunkError = isChunkLoadError(this.state.error)
      // Granulare Nutzung: ein eigener `fallback` (z. B. pro Tab) ersetzt nur
      // diesen Bereich, nicht die ganze App — andere Tabs bleiben bedienbar.
      // Bei ChunkLoadError bleibt bewusst die globale Reload-UI, weil ein
      // veraltetes Bundle die gesamte App betrifft (Auto-Reload greift dann).
      if (this.props.fallback && !chunkError) {
        return this.props.fallback
      }
      return (
        <div role="alert" className="screen" style={{ justifyContent: 'center', alignItems: 'center', gap: 16, padding: '32px 24px', textAlign: 'center' }}>
          <p aria-hidden="true" style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', color: 'var(--accent)', letterSpacing: '0.3em', lineHeight: 1 }}>· · ·</p>
          <p style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', fontWeight: 700 }}>
            {chunkError ? 'Neue Version verfügbar' : 'Etwas ist schiefgelaufen'}
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted)', maxWidth: 320 }}>
            {chunkError
              ? `Die App wurde aktualisiert. Bitte ${IS_NATIVE ? 'starte die App neu' : 'lade die Seite neu'}, damit die neueste Version geladen wird.`
              : `Ein unerwarteter Fehler ist aufgetreten. Bitte ${IS_NATIVE ? 'starte die App neu' : 'lade die Seite neu'}.`}
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              sessionStorage.removeItem(RELOAD_FLAG)
              clearCachesAndReload()
            }}
          >
            {IS_NATIVE ? 'App neu starten' : 'Seite neu laden'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
