import { useState, useEffect, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { API } from '../../config'
import { apiFetch } from '../../utils/apiFetch'
import { IAP } from '../../plugins/iap.js'
import { restoreIapPurchases } from '../../utils/iapRestore'
import { logError } from '../../utils/logError'
import { useGlobalNiveau, NIVEAU_LEVELS, NIVEAU_LABELS } from '../course/useGlobalNiveau'
import CheckoutModal from './CheckoutModal'

const IS_NATIVE = Capacitor.isNativePlatform()

const FEATURES = [
  { label: 'Eigenes Lemma',  desc: 'Jeden Modus – auch im Kurs – mit selbst gewählten Wörtern, unbegrenzt' },
  { label: 'Klassenraum',    desc: 'Live-Sessions für den Unterricht' },
  { label: 'Kurs-Material',  desc: 'Arbeitsblätter, Lösungen & Unterrichtsentwürfe zu jeder Station' },
]

export default function KontoPremiumBlock({ auth, gesamtausgabePermanent }) {
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [loginHint, setLoginHint] = useState(false)
  const [restoreStatus, setRestoreStatus] = useState(null) // 'busy' | 'none' | 'not-found' | 'error' | null
  const [restoreMessage, setRestoreMessage] = useState(null)

  // ── Kurs-Niveau + Kurs-Fortschritt ─────────────────────────────────
  // Kurs-Üben ist seit 25.06. für jeden eingeloggten Account gratis (nicht an
  // die Gesamtausgabe gekoppelt) — sitzt trotzdem hier, weil es die einzige
  // „Kurs"-Rubrik im Konto-Tab ist. Läuft daher in BEIDEN Zweigen unten
  // (gekauft/nicht gekauft) identisch, mit eigener Zwischenüberschrift.
  const [niveau, setNiveau] = useGlobalNiveau()
  const [resetState, setResetState] = useState('idle')

  const resetCourse = useCallback(async () => {
    setResetState('working')
    try {
      const res = await apiFetch(`${API}/course/progress`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      setResetState(res.ok ? 'done' : 'error')
    } catch {
      setResetState('error')
    }
  }, [])

  function handleBuyClick() {
    if (!auth.isLoggedIn) {
      setLoginHint(true)
      return
    }
    setLoginHint(false)
    setCheckoutOpen(true)
  }

  // Permanent zugänglich – Apple verlangt einen sichtbaren Restore-Pfad, ohne
  // dass der Nutzer erst den Kauf-Dialog öffnen muss.
  async function handleRestoreClick() {
    if (restoreStatus === 'busy') return
    setRestoreStatus('busy')
    setRestoreMessage(null)
    const result = await restoreIapPurchases()
    if (result.ok) {
      await auth.loadSession?.()
      setRestoreStatus(null)
      return
    }
    if (result.reason === 'none')           { setRestoreStatus('none');      setRestoreMessage('Keine früheren Käufe gefunden.') }
    else if (result.reason === 'not-found') { setRestoreStatus('not-found'); setRestoreMessage('Kein gültiger Kauf gefunden.') }
    else                                    { setRestoreStatus('error');     setRestoreMessage(result.message || 'Netzwerkfehler.') }
  }

  const { loadSession } = auth
  useEffect(() => {
    if (!IS_NATIVE) return
    let listener = null
    const setup = async () => {
      listener = await IAP.addListener('transactionUpdate', async (data) => {
        try {
          const res = await apiFetch(`${API}/iap/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              jwsRepresentation: data.jwsRepresentation,
              productId: data.productId,
            }),
          })
          if (res.ok) {
            await IAP.finishTransaction({ transactionId: data.transactionId }).catch((err) => {
              logError('KontoPremiumBlock.finishTransaction', err)
            })
            loadSession?.()
          }
        } catch (err) {
          logError('KontoPremiumBlock.iapVerify', err)
        }
      })
    }
    setup()
    return () => { listener?.remove() }
  }, [loadSession])

  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">②</span>
        <span className="test-entry-marginalia">PREMIUM</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Gesamtausgabe</h2>
          <span className="test-ipa">[ɡəˈzamtˌʔaʊ̯sɡaːbə]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Lizenz</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Premium</span>
        </div>

        <div className="konto-settings-content">
          <p className="konto-settings-subheading">Kurs — gratis für jeden eingeloggten Account</p>

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
        </div>

        {gesamtausgabePermanent ? (
          <>
            <p className="test-definition">
              Unbegrenzt eigene Lemmata, Klassenraum und Kurs-Material.
            </p>
            <ul className="konto-premium-features konto-premium-features--active" aria-label="Enthaltene Funktionen">
              {FEATURES.map(f => (
                <li key={f.label} className="konto-premium-feature">
                  <span className="konto-premium-feature-marker" aria-hidden="true">✓</span>
                  <div className="konto-premium-feature-content">
                    <span className="konto-premium-feature-label">{f.label}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="konto-teacher-note" role="status">
              <p className="konto-teacher-note-title">
                <span className="konto-teacher-note-symbol" aria-hidden="true">§</span>
                Klassenraum aktiv
              </p>
              <p className="konto-teacher-note-text">
                Sitzungen erstellen, starten und live verfolgen.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="test-definition">
              Alle vier Spielmodi sind frei. Mit der Gesamtausgabe spielst du
              jeden Modus mit selbst gewählten Wörtern – unbegrenzt – plus Klassenraum &amp; Kurs-Material.
            </p>

            <ul className="konto-premium-features" aria-label="Enthaltene Funktionen">
              {FEATURES.map(f => (
                <li key={f.label} className="konto-premium-feature">
                  <span className="konto-premium-feature-marker" aria-hidden="true">—</span>
                  <div className="konto-premium-feature-content">
                    <span className="konto-premium-feature-label">{f.label}</span>
                    <span className="konto-premium-feature-desc">{f.desc}</span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="konto-subscription-unlock">
              <button className="konto-iap-cta" type="button" onClick={handleBuyClick}>
                <span>Gesamtausgabe freischalten</span>
                <span className="konto-iap-cta-price">ab 6,99 €</span>
              </button>
              {loginHint && (
                <p className="konto-login-hint" role="alert">
                  Bitte oben anmelden, um den Kauf abzuschließen.
                </p>
              )}
              {IS_NATIVE && (
                <>
                  <button
                    className="konto-restore-link"
                    type="button"
                    onClick={handleRestoreClick}
                    disabled={restoreStatus === 'busy'}
                  >
                    {restoreStatus === 'busy' ? 'Wird geprüft …' : 'Bereits gekauft? Kauf wiederherstellen'}
                  </button>
                  {restoreMessage && (
                    <p className="konto-restore-note" role="status">{restoreMessage}</p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onSuccess={auth.loadSession}
      />
    </li>
  )
}
