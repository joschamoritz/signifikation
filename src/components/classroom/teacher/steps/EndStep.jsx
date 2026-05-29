// T5 — Ende-Step (W2-T4).
//
// Pseudonymisierte Nachbereitung pro Modus/Lemma: Trefferquote (Balken),
// Ø-Score, haeufigster Distraktor + Liste der auffaelligsten Fragen.
// Datenquelle: GET /sessions/:id/results — bewusst OHNE Klarnamen-Zuordnung
// zu einzelnen Antworten (D7 gilt auch nach Session-Ende).
//
// „Namen zeigen" (off by default) listet nur die Teilnehmer-Roster aus dem
// Dashboard — niemals verknuepft mit einzelnen Antworten.
// Export-Button NICHT hier — Welle 2 (D10).

import { useEffect, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, getSessionResults } from '../hooks/useTeacherSession'

const MODE_LABELS = {
  kollokationen: 'Kollokationen',
  wortzwilling:  'Wort-Zwilling',
  zeitenwende:   'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

function modeLabel(mode) {
  return MODE_LABELS[mode] || mode || '—'
}

export default function EndStep() {
  const { state, dispatch } = useTeacherClassroom()
  const sessionId = state.activeSessionId

  const [results, setResults] = useState(null)
  const [participants, setParticipants] = useState([])
  const [showNames, setShowNames] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!sessionId) return undefined
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        // Auswertung ist primaer; das Dashboard liefert nur den Namens-Roster
        // fuer den optionalen Toggle. Faellt das Dashboard aus, bleibt die
        // Auswertung trotzdem nutzbar.
        const [res, dash] = await Promise.all([
          getSessionResults(sessionId),
          getDashboard(sessionId).catch(() => null),
        ])
        if (cancelled) return
        setResults(res)
        setParticipants(dash?.participants || [])
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Auswertung konnte nicht geladen werden.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sessionId])

  const byLemma   = results?.byLemma || []
  const trickiest = results?.trickiest || []
  const totals    = results?.totals || { participants: 0, submissions: 0 }
  const hasSubmissions = results?.hasSubmissions

  return (
    <div data-testid="cr2-end">
      {loading && <p className="cr2-loading">Auswertung wird geladen …</p>}
      {error && <p className="cr2-error">{error}</p>}

      {results && (
        <>
          <section className="cr2-section" aria-label="Übersicht">
            <span className="cr2-section__label">Übersicht</span>
            <ul className="cr2-aggregate">
              <li className="cr2-aggregate__row">
                <span className="cr2-aggregate__lemma">Teilnehmer mit Abgabe</span>
                <span className="cr2-aggregate__pct" style={{ color: 'var(--cr2-text)' }}>
                  {totals.participants}
                </span>
              </li>
              <li className="cr2-aggregate__row">
                <span className="cr2-aggregate__lemma">Abgaben gesamt</span>
                <span className="cr2-aggregate__pct" style={{ color: 'var(--cr2-text)' }}>
                  {totals.submissions}
                </span>
              </li>
            </ul>
          </section>

          {/* Empty State: Session ohne Abgaben beendet */}
          {!hasSubmissions && (
            <section className="cr2-section" aria-label="Keine Abgaben">
              <div className="cr2-result-empty" data-testid="cr2-end-empty">
                <p className="cr2-result-empty__title">Keine Abgaben</p>
                <p className="cr2-result-empty__text">
                  In dieser Session wurden keine Antworten abgegeben — es gibt nichts auszuwerten.
                  Starte eine neue Session, um es erneut zu versuchen.
                </p>
              </div>
            </section>
          )}

          {/* Auffälligste Fragen (Top 3 niedrigste Trefferquote) */}
          {trickiest.length > 0 && (
            <section className="cr2-section" aria-label="Auffälligste Fragen">
              <span className="cr2-section__label">Auffälligste Fragen</span>
              <ul className="cr2-aggregate" data-testid="cr2-end-trickiest">
                {trickiest.map((t) => (
                  <li key={`${t.assignmentId}:${t.lemmaId}`} className="cr2-aggregate__row">
                    <span className="cr2-aggregate__lemma">
                      {t.lemma}{' '}
                      <span className="cr2-result-card__mode">· {modeLabel(t.mode)}</span>
                    </span>
                    <span className="cr2-aggregate__pct">{t.hitRatePct}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Pro Lemma: Trefferquote-Balken, Ø-Score, häufigster Distraktor */}
          {byLemma.length > 0 && (
            <section className="cr2-section" aria-label="Auswertung pro Lemma">
              <span className="cr2-section__label">Pro Lemma</span>
              <div className="cr2-result-cards" data-testid="cr2-end-cards">
                {byLemma.map((row) => (
                  <article
                    key={`${row.assignmentId}:${row.lemmaId}`}
                    className="cr2-result-card"
                  >
                    <header className="cr2-result-card__head">
                      <h3 className="cr2-result-card__lemma">{row.lemma}</h3>
                      <span className="cr2-result-card__mode">{modeLabel(row.mode)}</span>
                    </header>

                    <div
                      className="cr2-bar"
                      role="img"
                      aria-label={`Trefferquote ${row.hitRatePct} Prozent`}
                    >
                      <div
                        className="cr2-bar__fill"
                        style={{ width: `${row.hitRatePct}%` }}
                      />
                      <span className="cr2-bar__label">{row.hitRatePct}%</span>
                    </div>

                    <dl className="cr2-result-card__meta">
                      <div className="cr2-result-card__metaItem">
                        <dt>Ø-Score</dt>
                        <dd>{row.avgScore} / {row.maxScore}</dd>
                      </div>
                      <div className="cr2-result-card__metaItem">
                        <dt>Teilnehmer</dt>
                        <dd>{row.participants}</dd>
                      </div>
                    </dl>

                    {row.topDistractor ? (
                      <p className="cr2-result-card__distractor">
                        Häufigster Stolperstein:{' '}
                        <strong>{row.topDistractor.label}</strong>{' '}
                        <span className="cr2-result-card__distractorCount">
                          ({row.topDistractor.count}×)
                        </span>
                      </p>
                    ) : (
                      <p className="cr2-result-card__distractor cr2-result-card__distractor--none">
                        Kein auffälliger Distraktor.
                      </p>
                    )}
                  </article>
                ))}
              </div>
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
