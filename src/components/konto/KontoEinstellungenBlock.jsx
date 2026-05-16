import { useContext, useEffect, useState, useCallback } from 'react'
import { ThemeContext } from '../../hooks/useTheme'

/**
 * Konvertiert einen Base64url-String in ein Uint8Array (für applicationServerKey).
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

/**
 * Gibt true zurück, wenn Web Push im aktuellen Kontext unterstützt wird.
 * Im Capacitor-Kontext (iOS-App) läuft Push über APNs – dort den Toggle ausblenden.
 */
function isWebPushSupported() {
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export default function KontoEinstellungenBlock() {
  const { pref, setTheme } = useContext(ThemeContext)

  const [pushEnabled, setPushEnabled]     = useState(false)
  const [pushLoading, setPushLoading]     = useState(false)
  const [pushSupported]                   = useState(isWebPushSupported)
  const [pushError, setPushError]         = useState(null)

  // ── Initialer Status vom Server laden ────────────────────────────
  useEffect(() => {
    if (!pushSupported) return

    fetch('/api/v1/push/status', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.subscribed && data?.platform === 'web') {
          setPushEnabled(true)
        }
      })
      .catch(() => {
        // Fehler beim Status-Abruf: Toggle bleibt deaktiviert
      })
  }, [pushSupported])

  // ── Einschalten ───────────────────────────────────────────────────
  const enablePush = useCallback(async () => {
    setPushError(null)

    // 1. Browser-Permission anfragen
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setPushError('Benachrichtigungen wurden nicht erlaubt.')
      return
    }

    // 2. VAPID Public Key laden
    const vapidRes = await fetch('/api/v1/push/vapid-public-key')
    if (!vapidRes.ok) {
      setPushError('Push-Dienst momentan nicht verfügbar.')
      return
    }
    const { key: vapidPublicKey } = await vapidRes.json()

    // 3. Service Worker und PushManager-Subscription holen
    const registration = await navigator.serviceWorker.ready
    let webPushSub
    try {
      webPushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    } catch (err) {
      setPushError('Subscription konnte nicht erstellt werden.')
      return
    }

    // 4. Subscription an Server senden
    const subJson = webPushSub.toJSON()
    const res = await fetch('/api/v1/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: 'web',
        endpoint: subJson.endpoint,
        p256dh:   subJson.keys.p256dh,
        auth:     subJson.keys.auth,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setPushError(err.error ?? 'Registrierung fehlgeschlagen.')
      return
    }

    setPushEnabled(true)
  }, [])

  // ── Ausschalten ───────────────────────────────────────────────────
  const disablePush = useCallback(async () => {
    setPushError(null)

    // 1. Aktive PushManager-Subscription holen
    const registration = await navigator.serviceWorker.ready
    const webPushSub = await registration.pushManager.getSubscription()

    if (webPushSub) {
      // 2. Server-seitig löschen
      await fetch('/api/v1/push/unsubscribe', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: webPushSub.endpoint }),
      }).catch(() => {
        // Fehler beim Server-Löschen: lokal trotzdem deaktivieren
      })

      // 3. Browser-Subscription aufheben
      await webPushSub.unsubscribe().catch(() => {})
    }

    setPushEnabled(false)
  }, [])

  // ── Toggle-Handler ────────────────────────────────────────────────
  const handlePushToggle = useCallback(async (e) => {
    const checked = e.target.checked
    setPushLoading(true)
    try {
      if (checked) {
        await enablePush()
      } else {
        await disablePush()
      }
    } catch (err) {
      setPushError('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setPushLoading(false)
    }
  }, [enablePush, disablePush])

  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">④</span>
        <span className="test-entry-marginalia">EINST.</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Einstellungen</h2>
          <span className="test-ipa">[ˈaɪ̯nˌʃtɛlʊŋən]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Anpassung</span>
        </div>
        <p className="test-definition">
          Push-Benachrichtigungen, Erscheinungsbild und Sprache konfigurieren.
        </p>

        <div className="konto-settings-content">
          {pushSupported && (
            <div className="konto-setting-item">
              <div className="konto-setting-info">
                <span className="konto-setting-label">Push-Benachrichtigungen</span>
                <span className="konto-setting-desc">
                  {pushError ?? 'Tägliche Erinnerung zum Spielen'}
                </span>
              </div>
              <label className="konto-toggle">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  disabled={pushLoading}
                  onChange={handlePushToggle}
                />
                <span className="konto-toggle-slider" />
              </label>
            </div>
          )}

          <div className="konto-setting-item">
            <div className="konto-setting-info">
              <span className="konto-setting-label">Erscheinungsbild</span>
              <span className="konto-setting-desc">Hell, Dunkel oder Automatisch</span>
            </div>
            <select
              className="konto-select"
              value={pref}
              onChange={e => setTheme(e.target.value)}
            >
              <option value="light">Hell</option>
              <option value="dark">Dunkel</option>
              <option value="auto">Automatisch</option>
            </select>
          </div>

          <div className="konto-setting-item">
            <div className="konto-setting-info">
              <span className="konto-setting-label">Sprache</span>
              <span className="konto-setting-desc">Oberflächensprache der App</span>
            </div>
            <select className="konto-select" disabled>
              <option>Deutsch</option>
              <option>English</option>
            </select>
          </div>
        </div>

        <div className="test-entry-footer">
          <span className="test-status">Teilweise verfügbar</span>
        </div>
      </div>
    </li>
  )
}
