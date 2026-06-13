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

import { useEffect, useRef, useState } from 'react'
import { navigate } from '../routing'
// Spielscreen-Optik 1:1 aus dem echten Spiel übernehmen (Optionsliste, Header,
// Footer-Button) — Einheitlichkeit des CD, kein eigener Spielscreen-Stil.
import '../../../styles/quiz.css'
import './KioskShell.css'

function ExitConfirmModal({ open, onClose, onConfirm }) {
  const modalRef    = useRef(null)
  const cancelRef   = useRef(null)
  const prevFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    // Fokus merken und in den Dialog setzen (Cancel = ungefährliche Default-Wahl).
    prevFocusRef.current = document.activeElement
    cancelRef.current?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      // Fokus-Trap: Tab zyklisch innerhalb der Dialog-Buttons halten.
      const focusables = modalRef.current?.querySelectorAll('button')
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last  = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Fokus zum auslösenden Element zurückgeben.
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') {
        prevFocusRef.current.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="classroom-kiosk__modal-backdrop"
      onClick={onClose}
    >
      <div
        className="classroom-kiosk__modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="classroom-kiosk-exit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="classroom-kiosk-exit-title">Klassenraum verlassen?</h2>
        <p>Dein Fortschritt geht verloren. Sicher?</p>
        <div className="classroom-kiosk__modal-actions">
          <button
            type="button"
            className="classroom-kiosk__btn classroom-kiosk__btn--primary"
            onClick={onConfirm}
            data-testid="classroom-kiosk-exit-confirm"
          >
            Verlassen
          </button>
          <button
            type="button"
            ref={cancelRef}
            className="classroom-kiosk__btn"
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
 *   reconnecting      — wenn true: dezenter „Verbindung wird wiederhergestellt…"-
 *                       Hinweis (W2-T5). Der Spielscreen bleibt darunter erhalten.
 *   toast             — kurzer Hinweis-Text (Submit-Fehler), 3s sichtbar
 */
export default function KioskShell({
  code,
  onLeave,
  loggedInUserLabel = null,
  confirmExit = true,
  reconnecting = false,
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
    <div className="classroom-kiosk" data-testid="classroom-kiosk-shell">
      <header className="classroom-kiosk__header">
        <span className="classroom-kiosk__brand">
          Signifikation
          {code ? <small>· Klassenraum {code}</small> : null}
        </span>
        <button
          type="button"
          className="classroom-kiosk__exit"
          onClick={handleExitClick}
          aria-label="Klassenraum verlassen"
          data-testid="classroom-kiosk-exit"
        >
          Verlassen
        </button>
      </header>

      {reconnecting && (
        <div
          className="classroom-kiosk__reconnect"
          role="status"
          aria-live="polite"
          data-testid="classroom-kiosk-reconnect"
        >
          <span className="classroom-kiosk__reconnect-dot" aria-hidden="true" />
          Verbindung wird wiederhergestellt …
        </div>
      )}

      <main className="classroom-kiosk__main">
        {children}
      </main>

      {loggedInUserLabel && (
        <div className="classroom-kiosk__auth-banner" role="note">
          <span>
            Angemeldet als <strong>{loggedInUserLabel}</strong> — Classroom läuft anonym.
          </span>
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/') }}>Zur App</a>
        </div>
      )}

      {toast && (
        <div className="classroom-kiosk__toast" role="status" aria-live="polite" data-testid="classroom-kiosk-toast">
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
