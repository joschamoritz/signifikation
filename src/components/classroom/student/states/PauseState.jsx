// W2-T3 — Pause-Overlay.
//
// Wird gerendert, solange state.paused gesetzt ist (Lehrer hat pausiert).
// Ruhiges Wartebild im Woerterbuch-Stil. WICHTIG: Diese Komponente
// ersetzt den Spielscreen nur visuell — der currentState (playing/
// submitted) im Reducer bleibt unberuehrt, sodass nach Resume exakt der
// vorige Zustand wieder erscheint. Da das Mini-Spiel unmountet, laeuft
// auch kein Timer weiter.

import { useStudentKiosk } from '../StudentKioskContext'

export default function PauseState() {
  const { state } = useStudentKiosk()

  return (
    <>
      {state.displayName && (
        <div style={{ textAlign: 'right', marginBottom: 18 }}>
          <span className="cr2-kiosk__name-chip" data-testid="cr2-kiosk-name-chip">
            <strong>{state.displayName}</strong>
          </span>
        </div>
      )}

      <p className="cr2-kiosk__dropcap">P</p>
      <h1 className="cr2-kiosk__title" data-testid="cr2-kiosk-pause">Kurze Pause.</h1>

      <p className="cr2-kiosk__lead" style={{ marginTop: 22, marginBottom: 0 }}>
        <span className="cr2-kiosk__pulse" aria-hidden="true" />
        Deine Lehrkraft hat das Spiel pausiert. Es geht gleich weiter.
      </p>

      <p className="cr2-kiosk__hint" style={{ marginTop: 12 }}>
        Dein Fortschritt bleibt erhalten.
      </p>
    </>
  )
}
