// T-4.6 — T4 Live-Step.
//
// Fortschrittsbalken oben (n/m abgegeben), Teilnehmer-Liste mit Status-Dots,
// Lemma-Spiegel (zeigt was die Schueler gerade sehen), aggregierte
// Trefferquote pro Lemma. Polling alle 3s + Socket-Updates fuer Realtime.
//
// D7: KEINE Live-Einzelantworten. KEIN Leaderboard. Nur Aggregate.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, finishSession, pauseSession, resumeSession, nextAssignment } from '../hooks/useTeacherSession'
import { useTeacherSocket } from '../hooks/useTeacherSocket'
import ParticipantList from '../components/ParticipantList'
import ClassroomSubScreen from '../components/ClassroomSubScreen'

const POLL_INTERVAL_MS = 3000

const MODE_LABEL = {
  kollokationen: 'Kollokationen',
  wortzwilling:  'Wort-Zwilling',
  zeitenwende:   'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

export default function LiveStep() {
  const { state, dispatch } = useTeacherClassroom()
  const sessionId = state.activeSessionId

  const [dashboard, setDashboard]  = useState(null)
  const [error, setError]          = useState(null)
  const [finishing, setFinishing]  = useState(false)
  const [pauseBusy, setPauseBusy]  = useState(false)
  const [advancing, setAdvancing]  = useState(false)

  // Pause-Status: Dashboard ist Source of Truth (session.paused), Socket-
  // Events (session:paused/resumed) sorgen fuer sofortige Reaktion.
  const paused = !!dashboard?.session?.paused

  const refresh = useCallback(async () => {
    if (!sessionId) return
    try {
      const data = await getDashboard(sessionId)
      setDashboard(data)
    } catch (err) {
      setError(err?.message || 'Dashboard konnte nicht geladen werden.')
    }
  }, [sessionId])

  // Initial-Load + 3s-Polling.
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  // Socket-Updates loesen einen Dashboard-Refresh aus — die Pro-Teilnehmer-
  // Runden-Counts kommen jetzt aus dem Dashboard (Server ist Source of Truth),
  // nicht mehr aus einem lokalen Submitted-Set. So unterscheidet die Anzeige
  // "spielt noch (Runde 1/3)" sauber von "fertig (3/3)".
  const handlers = useMemo(() => ({
    'submission:received': () => { refresh() },
    'student:left':        () => { refresh() },
    'student:joined':      () => { refresh() },
    'session:paused':      () => { refresh() },
    'session:resumed':     () => { refresh() },
    'assignment:changed':  () => { refresh() },
    'session:finished': () => {
      dispatch({ type: 'GO_TO_END', sessionId })
    },
  }), [dispatch, refresh, sessionId])

  useTeacherSocket({ sessionId, enabled: !!sessionId, handlers })

  // Runden pro Teilnehmer = Lemma-Anzahl des aktuellen Blocks (Server).
  const lemmataTotal = dashboard?.lemmataPerAssignment || 1
  const participants = dashboard?.participants || []
  const enrichedParticipants = participants.map((p) => ({
    ...p,
    // "submitted" = ALLE Runden fertig (Dot wird erst dann gefuellt).
    submitted:   !!p.done,
    roundsDone:  p.submittedLemmata || 0,
    roundsTotal: lemmataTotal,
  }))

  // Fortschritt zaehlt FERTIGE Teilnehmer (alle Runden abgegeben), nicht
  // "hat irgendeine Runde abgegeben" — das war die Mehrdeutigkeit aus 3.3.
  const submittedCount = enrichedParticipants.filter((p) => p.submitted).length
  const totalCount = enrichedParticipants.filter((p) => !p.leftAt).length
  const pct = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0

  const assignment = dashboard?.assignment
  const modeLabel = assignment?.mode ? (MODE_LABEL[assignment.mode] || assignment.mode) : ''
  const currentLemma = assignment?.contentSnapshot?.lemmata?.[0] || null
  const perLemma = dashboard?.aggregate?.perLemma || []

  // Lemma-Wort zur ID auflösen (Aggregat liefert nur lemmaId, kein Wort).
  const snap = assignment?.contentSnapshot || {}
  const lemmaWord = (id) =>
    snap.byLemma?.[id]?.lemma
    || (Array.isArray(snap.lemmata) ? snap.lemmata.find((l) => String(l.id) === String(id))?.lemma : null)
    || id

  // W2-T2: Reihenfolge-Metadaten. assignmentTotal>1 ⇒ es gibt weitere Modi.
  const assignmentTotal = dashboard?.assignmentTotal ?? 1
  const assignmentIndex = dashboard?.assignmentIndex ?? 0
  const hasNext = assignmentTotal > 1 && assignmentIndex < assignmentTotal - 1

  async function handleFinish() {
    if (!sessionId || finishing) return
    setFinishing(true)
    setError(null)
    try {
      await finishSession(sessionId)
      dispatch({ type: 'GO_TO_END', sessionId })
    } catch (err) {
      setError(err?.message || 'Beenden fehlgeschlagen.')
    } finally {
      setFinishing(false)
    }
  }

  async function handleNext() {
    if (!sessionId || advancing) return
    setAdvancing(true)
    setError(null)
    try {
      const res = await nextAssignment(sessionId)
      if (res?.done) {
        dispatch({ type: 'GO_TO_END', sessionId })
        return
      }
      // Frische Daten fuer den neuen Block holen (Counts kommen vom Server).
      await refresh()
    } catch (err) {
      setError(err?.message || 'Weiter zum nächsten Modus fehlgeschlagen.')
    } finally {
      setAdvancing(false)
    }
  }

  async function handleTogglePause() {
    if (!sessionId || pauseBusy) return
    setPauseBusy(true)
    setError(null)
    try {
      if (paused) await resumeSession(sessionId)
      else await pauseSession(sessionId)
      await refresh()
    } catch (err) {
      setError(err?.message || (paused ? 'Fortsetzen fehlgeschlagen.' : 'Pausieren fehlgeschlagen.'))
    } finally {
      setPauseBusy(false)
    }
  }

  return (
    <ClassroomSubScreen
      testId="cr2-live"
      title="Live"
      label={modeLabel || 'Live-Session'}
      lead="Die Klasse spielt — du behältst den Überblick."
      backLabel="Zurück zur Übersicht"
      onBack={() => dispatch({ type: 'GO_TO_LIST' })}
    >
      <section className="cr2-progress" aria-label="Abgaben-Fortschritt">
        <div className="cr2-progress__label">
          <span>
            {modeLabel}
            {assignmentTotal > 1 && (
              <span className="cr2-progress__step" data-testid="cr2-live-step">
                {' '}· Modus {assignmentIndex + 1} von {assignmentTotal}
              </span>
            )}
          </span>
          <span className="cr2-progress__numbers">
            {submittedCount} / {totalCount} fertig
            {lemmataTotal > 1 && (
              <span className="cr2-progress__rounds"> · {lemmataTotal} Runden</span>
            )}
          </span>
        </div>
        <div className="cr2-progress__bar" aria-hidden="true">
          <div className="cr2-progress__fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {paused && (
        <p className="cr2-paused-banner" data-testid="cr2-live-paused-banner">
          Pausiert — Schüler:innen sehen ein Wartebild, Abgaben sind gesperrt.
        </p>
      )}

      {error && <p className="cr2-error">{error}</p>}

      {currentLemma && (
        <div className="cr2-lemma-mirror" aria-label="Aktuelles Lemma">
          <p className="cr2-lemma-mirror__title">{currentLemma.lemma}</p>
          <p style={{ margin: 0 }}>{currentLemma.definition || currentLemma.prompt || '—'}</p>
        </div>
      )}

      <section className="cr2-section" aria-labelledby="cr2-live-participants-label">
        <span id="cr2-live-participants-label" className="cr2-section__label">Teilnehmer</span>
        <ParticipantList participants={enrichedParticipants} mode="live" />
      </section>

      {perLemma.length > 0 && (
        <section className="cr2-section" aria-labelledby="cr2-live-aggregate-label">
          <span id="cr2-live-aggregate-label" className="cr2-section__label">Trefferquote</span>
          <ul className="cr2-aggregate">
            {perLemma.map((row) => (
              <li key={row.lemmaId} className="cr2-aggregate__row">
                <span className="cr2-aggregate__lemma">{lemmaWord(row.lemmaId)}</span>
                <span className="cr2-aggregate__pct">{row.correctPct}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cr2-sticky-cta cr2-sticky-cta--row" role="none">
        <div className="cr2-sticky-cta__inner cr2-sticky-cta__inner--row">
          <button
            type="button"
            className="cr2-link-cta cr2-link-cta--muted"
            onClick={handleTogglePause}
            disabled={pauseBusy}
            data-testid="cr2-live-pause"
          >
            {pauseBusy
              ? (paused ? 'Wird fortgesetzt …' : 'Wird pausiert …')
              : (paused ? 'Fortsetzen' : 'Pausieren')}
          </button>
          {hasNext ? (
            <button
              type="button"
              className="cr2-cta cr2-cta--inline"
              onClick={handleNext}
              disabled={advancing || paused}
              data-testid="cr2-live-next"
              title={paused ? 'Erst fortsetzen, dann wechseln' : undefined}
            >
              {advancing ? 'Wechselt …' : 'Nächster Modus'}
              {!advancing && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
            </button>
          ) : (
            <button
              type="button"
              className="cr2-cta cr2-cta--inline"
              onClick={handleFinish}
              disabled={finishing}
              data-testid="cr2-live-finish"
            >
              {finishing ? 'Wird beendet …' : 'Auflösung freigeben'}
              {!finishing && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
            </button>
          )}
        </div>
      </div>
    </ClassroomSubScreen>
  )
}
