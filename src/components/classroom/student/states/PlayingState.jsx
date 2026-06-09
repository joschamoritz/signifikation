// T-5.5 — S4 Spielen.
//
// Renderlogik: Name-Chip oben rechts + ClassroomGameWrapper.
// Toast (Submit-Fehler) wird im StudentKioskRoute oben gehalten —
// PlayingState reicht den onToast-Callback durch.

import { useStudentKiosk } from '../StudentKioskContext'
import ClassroomGameWrapper from '../components/ClassroomGameWrapper'

export default function PlayingState({ onToast }) {
  const { state } = useStudentKiosk()
  const total   = state.progress?.totalLemmata || 0
  const current = (state.progress?.submittedCount || 0) + 1

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="cr2-kiosk__hint" style={{ margin: 0 }}>
          {total > 1 ? `Lemma ${Math.min(current, total)} / ${total}` : 'Klassenraum'}
        </span>
        {state.displayName && (
          <span className="cr2-kiosk__name-chip">
            <strong>{state.displayName}</strong>
          </span>
        )}
      </div>

      {/* Spielstart kommt per Server-Push ohne Nutzeraktion → für Screenreader ansagen. */}
      <p className="sr-only" role="status">Das Spiel hat begonnen. Deine Aufgabe ist da.</p>

      <ClassroomGameWrapper onToast={onToast} />
    </>
  )
}
