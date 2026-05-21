import { useEffect, useState } from 'react'
import { onPwaUpdateAvailable, triggerUpdate } from '../pwa.js'
import './UpdateBanner.css'

export default function UpdateBanner() {
  const [available, setAvailable] = useState(false)
  const [reloading, setReloading] = useState(false)

  useEffect(() => onPwaUpdateAvailable(() => setAvailable(true)), [])

  if (!available) return null

  function handleReload() {
    setReloading(true)
    triggerUpdate()
  }

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-text">
        <span className="update-banner-label">Neue Ausgabe</span>
        <span className="update-banner-message">
          {reloading ? 'Wird geladen …' : 'Eine neuere Version der App ist verfügbar.'}
        </span>
      </div>
      <button
        type="button"
        className="update-banner-action"
        onClick={handleReload}
        disabled={reloading}
      >
        Aktualisieren
      </button>
    </div>
  )
}
