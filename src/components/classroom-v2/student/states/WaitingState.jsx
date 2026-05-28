// T-5.4 — S3 Warten.
//
// Bewusst KEINE Liste anderer Teilnehmer (sozialer Druck vermeiden).
// Eigener Name oben rechts als Chip („ich bin drin"). Pulsierender Gold-Punkt.
//
// Der State-Übergang nach 'playing' passiert nicht hier, sondern in
// useStudentSession: sobald /me/view ein currentLemma + status=running
// liefert (durch session:started via Socket oder durch das Polling),
// SET_VIEW im Reducer schaltet auf KIOSK_STATES.PLAYING.

import { useStudentKiosk } from '../StudentKioskContext'

const MODE_LABEL = {
  kollokationen:  'Kollokationen',
  wortzwilling:   'Wort-Zwilling',
  zeitenwende:    'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

export default function WaitingState() {
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

      <p className="cr2-kiosk__dropcap">W</p>
      <h1 className="cr2-kiosk__title">Warte, gleich geht&apos;s los.</h1>

      <p className="cr2-kiosk__lead" style={{ marginTop: 22, marginBottom: 0 }}>
        <span className="cr2-kiosk__pulse" aria-hidden="true" />
        Deine Lehrkraft startet das Spiel gleich.
      </p>

      {state.assignment?.mode && (
        <p className="cr2-kiosk__hint" style={{ marginTop: 12 }}>
          Modus: {MODE_LABEL[state.assignment.mode] || state.assignment.mode}
        </p>
      )}
    </>
  )
}
