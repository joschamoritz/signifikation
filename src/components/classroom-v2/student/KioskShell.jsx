// T-5.1 — KioskShell: eigener Wrapper für die Schüler-Route.
//
// Bewusst minimaler Header:
//   - kein BottomTabBar
//   - kein Konto-Icon, kein Login-Link
//   - Logo klein + (wenn vorhanden) Code/Sessionname
//   - Verlassen-Button mit Bestätigung
//
// Die Tab-Bar des Haupt-App-Layouts wird in App.jsx bereits umgangen, weil
// /c/:code seinen eigenen Renderzweig hat. KioskShell ist also der gesamte
// Viewport. AuthBanner (§7 Spezialfall „eingeloggter User") sitzt am Ende.

import { useState } from 'react'
import { navigate } from '../routing'
import './KioskShell.css'

function ExitConfirmModal({ open, onClose, onConfirm }) {
  if (!open) return null
  return (
    <div
      className="cr2-kiosk__modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cr2-kiosk-exit-title"
      onClick={onClose}
    >
      <div className="cr2-kiosk__modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="cr2-kiosk-exit-title">Klassenraum verlassen?</h2>
        <p>Dein Fortschritt geht verloren. Sicher?</p>
        <div className="cr2-kiosk__modal-actions">
          <button
            type="button"
            className="cr2-kiosk__btn cr2-kiosk__btn--primary"
            onClick={onConfirm}
            data-testid="cr2-kiosk-exit-confirm"
          >
            Verlassen
          </button>
          <button
            type="button"
            className="cr2-kiosk__btn"
            style={{ background: 'transparent', color: 'inherit', border: '1px solid var(--k-rule)' }}
            onClick={onClose}
          >
            Bleiben
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * KioskShell rendert die Header-/Outer-Strukur + Modal + (optionalen)
 * Auth-Banner. children sind die jeweiligen State-Komponenten.
 *
 * Props:
 *   code              — der Join-Code (für Anzeige im Header)
 *   onLeave           — callback nach bestätigtem Verlassen
 *   loggedInUserLabel — wenn gesetzt: zeigt unten den Auth-Banner
 *   confirmExit       — wenn false, kein Modal (z. B. beim S5 'ended'-State)
 *   toast             — kurzer Hinweis-Text (Submit-Fehler), 3s sichtbar
 */
export default function KioskShell({
  code,
  onLeave,
  loggedInUserLabel = null,
  confirmExit = true,
  toast = null,
  children,
}) {
  const [showExitModal, setShowExitModal] = useState(false)

  function handleExitClick() {
    if (confirmExit) {
      setShowExitModal(true)
    } else {
      doLeave()
    }
  }

  function doLeave() {
    setShowExitModal(false)
    if (typeof onLeave === 'function') {
      try { onLeave() } catch {}
    }
    // Aus /c/* heraus. Wir landen auf der Startseite — Hauptapp uebernimmt.
    navigate('/')
  }

  return (
    <div className="cr2-kiosk" data-testid="cr2-kiosk-shell">
      <header className="cr2-kiosk__header">
        <span className="cr2-kiosk__brand">
          Signifikation
          {code ? <small>· Klassenraum {code}</small> : null}
        </span>
        <button
          type="button"
          className="cr2-kiosk__exit"
          onClick={handleExitClick}
          aria-label="Klassenraum verlassen"
          data-testid="cr2-kiosk-exit"
        >
          Verlassen
        </button>
      </header>

      <main className="cr2-kiosk__main">
        {children}
      </main>

      {loggedInUserLabel && (
        <div className="cr2-kiosk__auth-banner" role="note">
          <span>
            Angemeldet als <strong>{loggedInUserLabel}</strong> — Classroom läuft anonym.
          </span>
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>Zur App</a>
        </div>
      )}

      {toast && (
        <div className="cr2-kiosk__toast" role="status" aria-live="polite" data-testid="cr2-kiosk-toast">
          {toast}
        </div>
      )}

      <ExitConfirmModal
        open={showExitModal}
        onClose={() => setShowExitModal(false)}
        onConfirm={doLeave}
      />
    </div>
  )
}
