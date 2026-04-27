import { useState, useEffect } from 'react'
import { API } from '../../config'

function parseUserAgent(ua) {
  if (!ua || ua === 'unknown') return 'Unbekanntes Gerät'
  
  // Mobile
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'Android-Smartphone'
  if (/Android/i.test(ua)) return 'Android-Tablet'
  
  // Desktop
  if (/Windows/i.test(ua)) return 'Windows-PC'
  if (/Macintosh/i.test(ua)) return 'Mac'
  if (/Linux/i.test(ua)) return 'Linux-PC'
  
  return 'Unbekanntes Gerät'
}

function formatDate(timestamp) {
  if (!timestamp) return 'Unbekannt'
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  if (diffMins < 1) return 'Gerade eben'
  if (diffMins < 60) return `Vor ${diffMins} Min.`
  if (diffHours < 24) return `Vor ${diffHours} Std.`
  if (diffDays < 7) return `Vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`
  
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function KontoGeraeteBlock({ isLoggedIn, gesamtausgabePermanent }) {
  const [devices, setDevices] = useState([])
  const [maxDevices, setMaxDevices] = useState(3)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [removing, setRemoving] = useState(null)

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false)
      return
    }

    fetchDevices()
  }, [isLoggedIn])

  async function fetchDevices() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/account/devices`, {
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('Geräte konnten nicht geladen werden')
      }
      const data = await res.json()
      setDevices(data.devices || [])
      setMaxDevices(data.maxDevices || 3)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveDevice(deviceId) {
    if (!confirm('Möchtest du dieses Gerät wirklich entfernen?')) return
    
    setRemoving(deviceId)
    try {
      const res = await fetch(`${API}/account/devices/${deviceId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        throw new Error('Gerät konnte nicht entfernt werden')
      }
      setDevices(devices.filter(d => d.id !== deviceId))
    } catch (err) {
      alert(err.message)
    } finally {
      setRemoving(null)
    }
  }

  if (!isLoggedIn) return null

  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">②</span>
        <span className="test-entry-marginalia">GERÄTE</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Registrierte Geräte</h2>
          <span className="test-ipa">[ɡəˈʁɛːtə]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Verwaltung</span>
        </div>
        <p className="test-definition">
          {gesamtausgabePermanent
            ? `Du kannst die Gesamtausgabe auf bis zu ${maxDevices} Geräten nutzen. Entferne alte Geräte, um neue hinzuzufügen.`
            : 'Geräte werden registriert, sobald die Gesamtausgabe freigeschaltet ist.'}
        </p>

        {loading ? (
          <p className="konto-devices-loading">Lade Geräte …</p>
        ) : error ? (
          <p className="konto-devices-error" role="alert">{error}</p>
        ) : devices.length === 0 ? (
          <p className="konto-devices-empty">Noch keine Geräte registriert.</p>
        ) : (
          <ul className="konto-device-list">
            {devices.map(device => (
              <li key={device.id} className="konto-device-item">
                <div className="konto-device-info">
                  <strong className="konto-device-name">
                    {parseUserAgent(device.user_agent)}
                  </strong>
                  <span className="konto-device-date">
                    Zuletzt aktiv: {formatDate(device.last_seen)}
                  </span>
                </div>
                <button
                  className="konto-device-remove"
                  type="button"
                  onClick={() => handleRemoveDevice(device.id)}
                  disabled={removing === device.id}
                  aria-label={`${parseUserAgent(device.user_agent)} entfernen`}
                >
                  {removing === device.id ? '…' : 'Entfernen'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="test-entry-footer">
          <span className="test-status">
            {devices.length} von {maxDevices} Geräten registriert
          </span>
        </div>
      </div>
    </li>
  )
}
