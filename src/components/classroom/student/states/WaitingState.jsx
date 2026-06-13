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
    <div className="classroom-kiosk__panel classroom-kiosk__panel--center">
      {state.displayName && (
        <span className="classroom-kiosk__name-chip" data-testid="classroom-kiosk-name-chip">
          <strong>{state.displayName}</strong>
        </span>
      )}

      <p className="classroom-kiosk__overline">
        {state.assignment?.mode ? (MODE_LABEL[state.assignment.mode] || state.assignment.mode) : 'Klassenraum'}
      </p>
      <h1 className="classroom-kiosk__title">Warte, gleich geht&apos;s los.</h1>

      {/* role=status: der Wechsel zu „spielen" passiert per Server-Push ohne
          Nutzeraktion — Screenreader bekommen wenigstens die Warte-Ansage. */}
      <p className="classroom-kiosk__lead" role="status" style={{ marginTop: 18, marginBottom: 0 }}>
        <span className="classroom-kiosk__pulse" aria-hidden="true" />
        Deine Lehrkraft startet das Spiel gleich.
      </p>
    </div>
  )
}
