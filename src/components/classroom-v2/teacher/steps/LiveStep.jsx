// T-4.6 — T4 Live-Step.
//
// Fortschrittsbalken oben (n/m abgegeben), Teilnehmer-Liste mit Status-Dots,
// Lemma-Spiegel (zeigt was die Schueler gerade sehen), aggregierte
// Trefferquote pro Lemma. Polling alle 3s + Socket-Updates fuer Realtime.
//
// D7: KEINE Live-Einzelantworten. KEIN Leaderboard. Nur Aggregate.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, finishSession } from '../hooks/useTeacherSession'
import { useTeacherSocket } from '../hooks/useTeacherSocket'
import ParticipantList from '../components/ParticipantList'

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
  const submittedIdsRef = useRef(new Set())

  const refresh = useCallback(async () => {
    if (!sessionId) return
    try {
      const data = await getDashboard(sessionId)
      setDashboard(data)
      // submittedIds aktualisieren — Socket-Events ergaenzen das nur fuer
      // sofortige Reaktion; das Polling ist Source of Truth.
      const newSet = new Set()
      for (const lemma of data?.aggregate?.perLemma || []) {
        // perLemma traegt submission-Counts pro Lemma, nicht pro Participant.
        // Wir markieren stattdessen Teilnehmer per submission:received-Socket-Event.
        void lemma
      }
      void newSet
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

  // Socket-Updates: submission:received markiert Teilnehmer als "abgegeben"
  // (Dot wird gefuellt). student:left → Teilnehmer ausgrauen.
  const handlers = useMemo(() => ({
    'submission:received': (payload) => {
      if (!payload?.participantId) return
      submittedIdsRef.current.add(payload.participantId)
      // Force re-render via state-tick
      setDashboard((prev) => prev ? { ...prev } : prev)
    },
    'student:left': () => { refresh() },
    'student:joined': () => { refresh() },
    'session:finished': () => {
      dispatch({ type: 'GO_TO_END', sessionId })
    },
  }), [dispatch, refresh, sessionId])

  useTeacherSocket({ sessionId, enabled: !!sessionId, handlers })

  const participants = dashboard?.participants || []
  const enrichedParticipants = participants.map((p) => ({
    ...p,
    submitted: submittedIdsRef.current.has(p.id),
  }))

  const submittedCount = enrichedParticipants.filter((p) => p.submitted).length
  const totalCount = enrichedParticipants.filter((p) => !p.leftAt).length
  const pct = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0

  const assignment = dashboard?.assignment
  const modeLabel = assignment?.mode ? (MODE_LABEL[assignment.mode] || assignment.mode) : ''
  const currentLemma = assignment?.contentSnapshot?.lemmata?.[0] || null
  const perLemma = dashboard?.aggregate?.perLemma || []

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

  return (
    <div data-testid="cr2-live">
      <section className="cr2-progress" aria-label="Abgaben-Fortschritt">
        <div className="cr2-progress__label">
          <span>{modeLabel}</span>
          <span className="cr2-progress__numbers">{submittedCount} / {totalCount} abgegeben</span>
        </div>
        <div className="cr2-progress__bar" aria-hidden="true">
          <div className="cr2-progress__fill" style={{ width: `${pct}%` }} />
        </div>
      </section>

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
                <span className="cr2-aggregate__lemma">{row.lemmaId}</span>
                <span className="cr2-aggregate__pct">{row.correctPct}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="cr2-sticky-cta" role="none">
        <div className="cr2-sticky-cta__inner">
          <button
            type="button"
            className="cr2-btn cr2-btn--primary"
            onClick={handleFinish}
            disabled={finishing}
            data-testid="cr2-live-finish"
          >
            {finishing ? 'Wird beendet …' : 'Auflösung freigeben'}
          </button>
        </div>
      </div>
    </div>
  )
}
