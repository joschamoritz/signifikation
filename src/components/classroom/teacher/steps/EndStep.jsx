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
import ClassroomSubScreen from '../components/ClassroomSubScreen'

const MODE_LABELS = {
  kollokationen: 'Kollokationen',
  wortzwilling:  'Wort-Zwilling',
  zeitenwende:   'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

function modeLabel(mode) {
  return MODE_LABELS[mode] || mode || '—'
}

// Trefferquote-Semantik (design.md: Status-Farben nur fuer Bedeutung):
// rot = hoher Klaerbedarf, amber = mittel, gruen = gut verstanden.
function rateClass(pct) {
  if (pct < 40) return 'cr2-rate--low'
  if (pct < 70) return 'cr2-rate--mid'
  return 'cr2-rate--high'
}

// Klassen-Puls: rohe Zaehler in einen lesbaren Satz verdichten.
function pulseSentence(totals) {
  const p = totals.participants || 0
  const s = totals.submissions || 0
  const pPart = `${p} ${p === 1 ? 'Teilnehmer hat' : 'Teilnehmer haben'} abgegeben`
  const sPart = `${s} ${s === 1 ? 'Antwort' : 'Antworten'} insgesamt`
  return `${pPart} · ${sPart}.`
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
    <ClassroomSubScreen
      testId="cr2-end"
      title="Auswertung"
      label="Live-Session"
      lead="Wie lief die Stunde?"
      backLabel="Zurück zur Übersicht"
      onBack={() => dispatch({ type: 'GO_TO_LIST' })}
    >
      {loading && <p className="cr2-loading" role="status">Auswertung wird geladen …</p>}
      {error && <p className="cr2-error" role="alert">{error}</p>}

      {results && (
        <>
          {/* Klassen-Puls: eine lesbare Aussage statt roher Zaehler. */}
          {hasSubmissions && (
            <section className="cr2-section cr2-pulse-section" aria-label="Übersicht">
              <span className="cr2-section__label">Session-Ergebnis</span>
              <p className="cr2-pulse">{pulseSentence(totals)}</p>
              <hr className="cr2-doubleline" aria-hidden="true" />
            </section>
          )}

          {/* Empty State: Session ohne Abgaben beendet */}
          {!hasSubmissions && (
            <section className="cr2-section" aria-label="Keine Abgaben">
              <div className="cr2-result-empty" data-testid="cr2-end-empty">
                <p className="cr2-result-empty__ornament" aria-hidden="true">· · ·</p>
                <p className="cr2-result-empty__title">Keine Abgaben</p>
                <p className="cr2-result-empty__text">
                  In dieser Session wurden keine Antworten eingereicht — es gibt nichts auszuwerten.
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
                    <span className={`cr2-aggregate__pct ${rateClass(t.hitRatePct)}`}>{t.hitRatePct}%</span>
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

                    <p className="cr2-result-card__sub">
                      n = {row.participants} · Ø {row.avgScore} / {row.maxScore} Pkt.
                    </p>

                    <p
                      className="cr2-rate"
                      role="img"
                      aria-label={`Trefferquote ${row.hitRatePct} Prozent — ${row.participants} Teilnehmer`}
                    >
                      <span className={`cr2-rate__num ${rateClass(row.hitRatePct)}`}>
                        {row.hitRatePct} %
                      </span>
                      <span className="cr2-rate__text">der Teilnehmer lagen richtig</span>
                    </p>

                    {row.topDistractor && (
                      <p className="cr2-result-card__distractor">
                        <span className="cr2-result-card__distractorLead">Häufigste Fehlantwort: </span>
                        <strong>{row.topDistractor.label}</strong>
                        <span className="cr2-result-card__distractorCount">
                          {' '}— {row.topDistractor.count}×
                        </span>
                      </p>
                    )}

                    {Array.isArray(row.distribution) && row.distribution.length > 0 && (() => {
                      const isOption = row.distribution[0]?.kind === 'option'
                      const summary = isOption
                        ? `Antwortverteilung · ${row.distribution.length} Optionen`
                        : `Trefferquote je Item · ${row.distribution.length}`
                      return (
                        <details className="cr2-dist" data-testid="cr2-end-dist">
                          <summary className="cr2-dist__toggle">{summary}</summary>
                          <ul className="cr2-dist__list">
                            {row.distribution.map((o) => {
                              const rowClass = isOption
                                ? (o.correct ? ' cr2-dist__row--correct' : '')
                                : ` ${rateClass(o.pct).replace('cr2-rate--', 'cr2-dist__row--band-')}`
                              const ariaVerb = isOption
                                ? `${o.count}× gewählt, ${o.pct} Prozent${o.correct ? ', korrekt' : ''}`
                                : `${o.pct} Prozent richtig${o.sub ? `, Lösung ${o.sub}` : ''}`
                              return (
                                <li key={o.label} className={`cr2-dist__row${rowClass}`}>
                                  <span className="cr2-dist__mark" aria-hidden="true">
                                    {isOption && o.correct ? '✓' : ''}
                                  </span>
                                  <span className="cr2-dist__word">
                                    {o.label}
                                    {o.sub && <span className="cr2-dist__sub"> · {o.sub}</span>}
                                  </span>
                                  <span
                                    className="cr2-dist__bar"
                                    role="img"
                                    aria-label={`${o.label}: ${ariaVerb}`}
                                  >
                                    <span className="cr2-dist__fill" style={{ width: `${o.pct}%` }} />
                                  </span>
                                  <span className="cr2-dist__pct">{o.pct} %</span>
                                </li>
                              )
                            })}
                          </ul>
                        </details>
                      )
                    })()}
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

    </ClassroomSubScreen>
  )
}
