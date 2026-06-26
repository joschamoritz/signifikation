import { useContext, useEffect, useState, useCallback } from 'react'
import { ThemeContext } from '../../hooks/useTheme'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { useGlobalNiveau, NIVEAU_LEVELS, NIVEAU_LABELS } from '../course/useGlobalNiveau'
import { apiFetch } from '../../utils/apiFetch'
import { API } from '../../config'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function isWebPushSupported() {
  return (
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export default function KontoEinstellungenBlock({ gesamtausgabe = false }) {
  const { pref, setTheme } = useContext(ThemeContext)
  const [niveau, setNiveau] = useGlobalNiveau()

  // ── Kurs-Fortschritt zurücksetzen (Premium) ───────────────────────
  // idle → confirm → working → done | error. Setzt alle Aufgaben-Ergebnisse
  // zurück (Station/alles wieder spielbar), QA Station 1 Abschluss.
  const [resetState, setResetState] = useState('idle')

  const resetCourse = useCallback(async () => {
    setResetState('working')
    try {
      const res = await apiFetch(`${API}/course/progress`, {
        method: 'DELETE',
        credentials: 'include',
      })
      setResetState(res.ok ? 'done' : 'error')
    } catch {
      setResetState('error')
    }
  }, [])

  // ── Web Push (Browser) ────────────────────────────────────────────
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushSupported]               = useState(isWebPushSupported)
  const [pushError, setPushError]     = useState(null)

  // ── iOS Push (Capacitor/Native) ───────────────────────────────────
  const { supported: iosPushSupported, subscribed: iosPushSubscribed,
          requesting: iosPushRequesting, error: iosPushError,
          subscribe: iosPushSubscribe,
          unsubscribe: iosPushUnsubscribe } = usePushNotifications()

  useEffect(() => {
    if (!pushSupported) return
    fetch(`${API}/push/status`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.subscribed && data?.platform === 'web') setPushEnabled(true)
      })
      .catch(() => {})
  }, [pushSupported])

  const enablePush = useCallback(async () => {
    setPushError(null)
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setPushError('Benachrichtigungen wurden nicht erlaubt.')
      return
    }
    const vapidRes = await fetch(`${API}/push/vapid-public-key`)
    if (!vapidRes.ok) {
      setPushError('Push-Dienst momentan nicht verfügbar.')
      return
    }
    const { key: vapidPublicKey } = await vapidRes.json()
    const registration = await navigator.serviceWorker.ready
    let webPushSub
    try {
      webPushSub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
    } catch {
      setPushError('Subscription konnte nicht erstellt werden.')
      return
    }
    const subJson = webPushSub.toJSON()
    const res = await fetch(`${API}/push/subscribe`, {
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

  const disablePush = useCallback(async () => {
    setPushError(null)
    const registration = await navigator.serviceWorker.ready
    const webPushSub = await registration.pushManager.getSubscription()
    if (webPushSub) {
      await fetch(`${API}/push/unsubscribe`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: webPushSub.endpoint }),
      }).catch(() => {})
      await webPushSub.unsubscribe().catch(() => {})
    }
    setPushEnabled(false)
  }, [])

  const handlePushToggle = useCallback(async (e) => {
    const checked = e.target.checked
    setPushLoading(true)
    try {
      if (checked) await enablePush()
      else await disablePush()
    } catch {
      setPushError('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setPushLoading(false)
    }
  }, [enablePush, disablePush])

  const handleIosPushToggle = useCallback(async (e) => {
    if (e.target.checked) await iosPushSubscribe()
    else await iosPushUnsubscribe()
  }, [iosPushSubscribe, iosPushUnsubscribe])

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
          <span className="test-pos">Präferenz</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Anpassung</span>
        </div>
        <p className="test-definition">
          Push-Benachrichtigungen, Kurs-Niveau, Erscheinungsbild und Sprache konfigurieren.
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
              <label className="konto-toggle" aria-label="Push-Benachrichtigungen">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  disabled={pushLoading}
                  onChange={handlePushToggle}
                />
                <span className="konto-toggle-slider" aria-hidden="true" />
              </label>
            </div>
          )}

          {iosPushSupported && (
            <div className="konto-setting-item">
              <div className="konto-setting-info">
                <span className="konto-setting-label">Push-Benachrichtigungen</span>
                <span className="konto-setting-desc">
                  {iosPushError ?? 'Tägliche Erinnerung zum Spielen'}
                </span>
              </div>
              <label className="konto-toggle" aria-label="Push-Benachrichtigungen">
                <input
                  type="checkbox"
                  checked={iosPushSubscribed}
                  disabled={iosPushRequesting}
                  onChange={handleIosPushToggle}
                />
                <span className="konto-toggle-slider" aria-hidden="true" />
              </label>
            </div>
          )}

          <div className="konto-setting-item">
            <div className="konto-setting-info">
              <span className="konto-setting-label">Kurs-Niveau</span>
              <span className="konto-setting-desc">Standardstufe für Aufgaben und Material</span>
            </div>
            <select
              className="konto-select"
              value={niveau}
              onChange={e => setNiveau(e.target.value)}
              aria-label="Kurs-Niveau"
            >
              {NIVEAU_LEVELS.map(level => (
                <option key={level} value={level}>{NIVEAU_LABELS[level]}</option>
              ))}
            </select>
          </div>

          {gesamtausgabe && (
            <div className="konto-setting-item">
              <div className="konto-setting-info">
                <span className="konto-setting-label">Kurs-Fortschritt</span>
                <span className="konto-setting-desc">
                  {resetState === 'done'
                    ? 'Zurückgesetzt — alle Stationen wieder spielbar.'
                    : resetState === 'error'
                      ? 'Zurücksetzen fehlgeschlagen. Bitte erneut versuchen.'
                      : 'Aufgaben-Ergebnisse löschen und neu spielen'}
                </span>
              </div>
              {resetState === 'confirm' ? (
                <div className="konto-reset-confirm">
                  <button
                    type="button"
                    className="konto-reset-btn konto-reset-btn--danger"
                    onClick={resetCourse}
                  >
                    Wirklich zurücksetzen
                  </button>
                  <button
                    type="button"
                    className="konto-reset-btn"
                    onClick={() => setResetState('idle')}
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="konto-reset-btn"
                  disabled={resetState === 'working'}
                  onClick={() => setResetState('confirm')}
                >
                  {resetState === 'working' ? 'Setzt zurück …'
                    : resetState === 'done' ? 'Erneut zurücksetzen'
                      : 'Zurücksetzen'}
                </button>
              )}
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
          <span className="test-status">Verfügbar</span>
        </div>
      </div>
    </li>
  )
}
