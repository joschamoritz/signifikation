import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'

export default function PaywallModal({ onClose }) {
  const [agreed, setAgreed] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState(null)

  // ESC-Taste schließt Modal
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  async function handleCheckout() {
    if (!agreed || isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/payments/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setError('Bitte melde dich zuerst an, um die Gesamtausgabe freizuschalten.')
        return
      }
      if (res.status === 409) {
        setError('Die Gesamtausgabe ist bereits freigeschaltet.')
        return
      }
      if (!res.ok) {
        setError(data.error || 'Zahlung konnte nicht gestartet werden.')
        return
      }
      window.location.assign(data.checkoutUrl)
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div
      className="paywall-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      onClick={handleOverlayClick}
    >
      <div className="paywall-modal">
        <button
          className="paywall-close"
          type="button"
          onClick={onClose}
          aria-label="Schließen"
        >
          ×
        </button>

        <header className="paywall-header">
          <span className="paywall-eyebrow">Gesamtausgabe</span>
          <h2 id="paywall-title" className="paywall-title">
            Alle Spielmodi freischalten
          </h2>
        </header>

        <ul className="paywall-features" aria-label="Enthaltene Inhalte">
          <li>Wort-Zwilling – Bedeutungsverwandtschaft entdecken</li>
          <li>Zeitenwende – Semantischen Wandel verstehen</li>
          <li>Lückenfüller – Korpussätze mit Lücken füllen</li>
          <li>Klassenraum – Gemeinsam spielen (für Lehrkräfte)</li>
        </ul>

        <div className="paywall-price" aria-label="Preis: 4 Euro 99, einmalig">
          <span className="paywall-amount">4,99 €</span>
          <span className="paywall-once">Einmalig · kein Abo</span>
        </div>

        <label className="paywall-legal-label">
          <input
            className="paywall-legal-input"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="paywall-legal-text">
            Ich stimme zu, dass die Bereitstellung der digitalen Inhalte sofort beginnt
            und mein <strong>Widerrufsrecht damit erlischt</strong> (§&nbsp;356 Abs.&nbsp;5 BGB).
            Ich habe die{' '}
            <a href="/nutzungsbedingungen.html" target="_blank" rel="noopener noreferrer">
              AGB
            </a>{' '}
            und das{' '}
            <a href="/impressum.html" target="_blank" rel="noopener noreferrer">
              Impressum
            </a>{' '}
            zur Kenntnis genommen.
          </span>
        </label>

        {error && (
          <p className="paywall-error" role="alert">
            {error}
          </p>
        )}

        <button
          className="test-cta paywall-cta"
          type="button"
          onClick={handleCheckout}
          disabled={!agreed || isBusy}
        >
          {isBusy ? 'Weiterleitung …' : 'Jetzt freischalten – 4,99 €'}
          {!isBusy && <span className="test-cta-arrow" aria-hidden="true">→</span>}
        </button>

        <p className="paywall-footnote">
          Zahlung über Mollie · SSL-verschlüsselt ·{' '}
          Gemäß §&nbsp;19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.
        </p>
      </div>
    </div>
  )
}
