// T-4.7 — T5 Ende-Step.
//
// Aggregierte Auswertung, „Auffaelligster Distraktor" (in Welle 1 zeigen wir
// einfach das Lemma mit der niedrigsten Trefferquote — Single-Choice-Distraktor-
// Tracking kommt in Welle 2 mit dem erweiterten Telemetry-Modell).
//
// „Namen zeigen" — off by default (D7-Prinzip auch nach Session-Ende).
// Export-Button NICHT hier — Welle 2 (D10).

import { useEffect, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard } from '../hooks/useTeacherSession'

export default function EndStep() {
  const { state, dispatch } = useTeacherClassroom()
  const sessionId = state.activeSessionId

  const [dashboard, setDashboard] = useState(null)
  const [showNames, setShowNames] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!sessionId) return undefined
    setLoading(true)
    ;(async () => {
      try {
        const data = await getDashboard(sessionId)
        if (cancelled) return
        setDashboard(data)
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Auswertung konnte nicht geladen werden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  const aggregate = dashboard?.aggregate
  const perLemma  = aggregate?.perLemma || []
  const total     = aggregate?.totalParticipants || 0
  const submitted = aggregate?.submittedTotal || 0
  const participants = dashboard?.participants || []

  // Auffaelligster Distraktor in Welle 1: Lemma mit der NIEDRIGSTEN Trefferquote.
  const tricky = perLemma.length
    ? [...perLemma].sort((a, b) => a.correctPct - b.correctPct)[0]
    : null

  return (
    <div data-testid="cr2-end">
      {loading && <p className="cr2-loading">Auswertung wird geladen …</p>}
      {error && <p className="cr2-error">{error}</p>}

      {dashboard && (
        <>
          <section className="cr2-section" aria-label="Übersicht">
            <span className="cr2-section__label">Übersicht</span>
            <ul className="cr2-aggregate">
              <li className="cr2-aggregate__row">
                <span className="cr2-aggregate__lemma">Teilnehmer</span>
                <span className="cr2-aggregate__pct" style={{ color: 'var(--cr2-text)' }}>{total}</span>
              </li>
              <li className="cr2-aggregate__row">
                <span className="cr2-aggregate__lemma">Abgaben gesamt</span>
                <span className="cr2-aggregate__pct" style={{ color: 'var(--cr2-text)' }}>{submitted}</span>
              </li>
            </ul>
          </section>

          {tricky && (
            <section className="cr2-section" aria-label="Auffälligster Distraktor">
              <span className="cr2-section__label">Auffälligster Distraktor</span>
              <div className="cr2-lemma-mirror">
                <p className="cr2-lemma-mirror__title">{tricky.lemmaId}</p>
                <p style={{ margin: 0 }}>
                  Nur {tricky.correctPct}% Trefferquote — das Lemma mit dem grössten Stolperstein.
                </p>
              </div>
            </section>
          )}

          {perLemma.length > 0 && (
            <section className="cr2-section" aria-label="Trefferquote pro Lemma">
              <span className="cr2-section__label">Trefferquote pro Lemma</span>
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

          <section className="cr2-section" aria-label="Teilnehmer">
            <label className="cr2-toggle">
              <input
                type="checkbox"
                checked={showNames}
                onChange={(e) => setShowNames(e.target.checked)}
              />
              Namen zeigen ({participants.length})
            </label>
            {showNames && participants.length > 0 && (
              <ul className="cr2-participant-list" style={{ marginTop: 12 }}>
                {participants.map((p) => (
                  <li key={p.id} className="cr2-participant">
                    <span className="cr2-participant__dot" aria-hidden="true" />
                    <span className="cr2-participant__name">{p.displayName || '—'}</span>
                    <span className="cr2-participant__status">{p.leftAt ? 'verlassen' : 'dabei'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <div className="cr2-sticky-cta" role="none">
        <div className="cr2-sticky-cta__inner" style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <button
            type="button"
            className="cr2-btn cr2-btn--primary"
            onClick={() => dispatch({ type: 'GO_TO_SETUP' })}
            data-testid="cr2-end-new"
          >
            Neue Session
          </button>
          <button
            type="button"
            className="cr2-btn cr2-btn--outline"
            onClick={() => dispatch({ type: 'GO_TO_LIST' })}
            data-testid="cr2-end-close"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}
