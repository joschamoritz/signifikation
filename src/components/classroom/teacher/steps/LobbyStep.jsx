// T-4.5 — T3 Lobby.
//
// Code riesig, Teilnehmer-Liste live ueber Socket. Start-CTA disabled bis
// mind. 1 Teilnehmer beigetreten ist. POST /start setzt locked_at und
// broadcasted session:started — danach in Live-Step.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, startSession, kickParticipant } from '../hooks/useTeacherSession'
import { useTeacherSocket } from '../hooks/useTeacherSocket'
import SessionCodeCard from '../components/SessionCodeCard'
import ParticipantList from '../components/ParticipantList'
import ClassroomSubScreen from '../components/ClassroomSubScreen'

export default function LobbyStep() {
  const { state, dispatch } = useTeacherClassroom()
  const sessionId = state.activeSessionId

  const [session, setSession]           = useState(null)
  const [participants, setParticipants] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)
  const [starting, setStarting]         = useState(false)
  const [armed, setArmed]               = useState(false)
  const [allowLateJoin, setAllowLateJoin] = useState(true)

  // Initial-Load: aktueller Session-Snapshot + Teilnehmer.
  // (Auch unter „lobby“ liefert der Dashboard-Endpunkt diese Daten.)
  useEffect(() => {
    let cancelled = false
    if (!sessionId) return undefined
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const data = await getDashboard(sessionId)
        if (cancelled) return
        setSession(data?.session || null)
        setParticipants(data?.participants || [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Sitzung konnte nicht geladen werden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  // Live-Socket: student:joined / student:left aktualisieren die Liste,
  // ohne dass wir polling brauchen.
  const handlers = useMemo(() => ({
    'student:joined': (payload) => {
      if (!payload?.participantId) return
      setParticipants((prev) => {
        if (prev.some((p) => p.id === payload.participantId)) return prev
        return [...prev, {
          id: payload.participantId,
          displayName: payload.displayName || '',
          joinedAt: payload.joinedAt || Date.now(),
          connected: true,
          leftAt: null,
        }]
      })
    },
    'student:left': (payload) => {
      if (!payload?.participantId) return
      setParticipants((prev) => prev.map((p) =>
        p.id === payload.participantId
          ? { ...p, connected: false, leftAt: Date.now() }
          : p,
      ))
    },
    'student:heartbeat': (payload) => {
      if (!payload?.participantId) return
      setParticipants((prev) => prev.map((p) =>
        p.id === payload.participantId
          ? { ...p, connected: !!payload.connected }
          : p,
      ))
    },
  }), [])

  useTeacherSocket({ sessionId, enabled: !!sessionId, handlers })

  const activeCount = participants.filter((p) => !p.leftAt).length

  const handleKick = useCallback(async (participantId) => {
    if (!sessionId || !participantId) return
    // Optimistisch entfernen — der Server bestätigt + wirft den Schüler raus.
    setParticipants((prev) => prev.filter((p) => p.id !== participantId))
    try {
      await kickParticipant(sessionId, participantId)
    } catch (err) {
      setError(err?.message || 'Teilnehmer konnte nicht entfernt werden.')
      // Bei Fehler neu laden, damit die Liste konsistent bleibt.
      try {
        const data = await getDashboard(sessionId)
        setParticipants(data?.participants || [])
      } catch { /* Liste bleibt wie sie ist */ }
    }
  }, [sessionId])

  const handleStart = useCallback(async () => {
    if (!sessionId || activeCount === 0 || starting) return
    setStarting(true)
    setError(null)
    try {
      await startSession(sessionId, { allowLateJoin })
      dispatch({ type: 'GO_TO_LIVE', sessionId })
    } catch (err) {
      setError(err?.message || 'Start fehlgeschlagen.')
    } finally {
      setStarting(false)
    }
  }, [sessionId, activeCount, starting, allowLateJoin, dispatch])

  // Auto-disarm: schaut die Lehrkraft nach dem ersten Tap weg, fällt die
  // Bestätigung nach 4 s zurück.
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])

  // 2-Tap-Bestätigung gegen versehentlichen Start (am Beamer schnell passiert).
  const handleStartClick = useCallback(() => {
    if (!sessionId || activeCount === 0 || starting) return
    if (!armed) { setArmed(true); return }
    setArmed(false)
    handleStart()
  }, [sessionId, activeCount, starting, armed, handleStart])

  return (
    <ClassroomSubScreen
      testId="classroom-lobby"
      title="Lobby"
      label="Live-Sitzung"
      lead="Teile den Code — warte auf die Klasse."
      backLabel="Zurück zur Übersicht"
      onBack={() => dispatch({ type: 'GO_TO_LIST' })}
    >
      {loading && <p className="classroom-loading">Lobby wird vorbereitet …</p>}
      {error && <p className="classroom-error">{error}</p>}

      {session && (
        <>
          <SessionCodeCard code={session.code} />

          <section className="classroom-section" aria-labelledby="classroom-lobby-participants-label" style={{ marginTop: 24 }}>
            <span id="classroom-lobby-participants-label" className="classroom-section__label">
              Teilnehmer ({activeCount})
            </span>
            <ParticipantList participants={participants} mode="lobby" onKick={handleKick} />
          </section>

          <label className="classroom-toggle classroom-lobby-latejoin">
            <input
              type="checkbox"
              checked={allowLateJoin}
              onChange={(e) => setAllowLateJoin(e.target.checked)}
              data-testid="classroom-lobby-latejoin"
            />
            Spätbeitritt erlauben
            <span className="classroom-lobby-latejoin__hint">
              Aus: nach dem Start kommt niemand mehr rein.
            </span>
          </label>
        </>
      )}

      <div className="classroom-sticky-cta" role="none">
        <div className="classroom-sticky-cta__inner">
          <button
            type="button"
            className="classroom-cta"
            disabled={!session || activeCount === 0 || starting}
            onClick={handleStartClick}
            data-testid="classroom-lobby-start"
          >
            {starting
              ? 'Wird gestartet …'
              : activeCount === 0
                ? 'Warte auf Teilnehmer …'
                : armed
                  ? 'Nochmal tippen zum Starten'
                  : `Spiel starten (${activeCount} dabei)`}
            {!starting && activeCount > 0 && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
          </button>
        </div>
      </div>
    </ClassroomSubScreen>
  )
}
