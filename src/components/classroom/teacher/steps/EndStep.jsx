// T5 — Ende-Step (W2-T4).
//
// Pseudonymisierte Nachbereitung pro Modus/Lemma: Trefferquote (Balken),
// Ø-Score, haeufigster Distraktor + Liste der auffaelligsten Fragen.
// Datenquelle: GET /sessions/:id/results — bewusst OHNE Klarnamen-Zuordnung
// zu einzelnen Antworten (D7 gilt auch nach Session-Ende).
//
// „Namen zeigen“ (off by default) listet nur die Teilnehmer-Roster aus dem
// Dashboard — niemals verknuepft mit einzelnen Antworten.
// Export-Button NICHT hier — Welle 2 (D10).

import { useEffect, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { getDashboard, getSessionResults, duplicateSession } from '../hooks/useTeacherSession'
import ClassroomSubScreen from '../components/ClassroomSubScreen'
import { buildResultsCsv, resultsCsvFilename, downloadCsv } from '../exportResults'
import { MODE_LABEL as MODE_LABELS } from '../../modeLabels'

function modeLabel(mode) {
  return MODE_LABELS[mode] || mode || '—'
}

// Trefferquote-Semantik (design.md: Status-Farben nur fuer Bedeutung):
// rot = hoher Klaerbedarf, amber = mittel, gruen = gut verstanden.
function rateClass(pct) {
  if (pct < 40) return 'classroom-rate--low'
  if (pct < 70) return 'classroom-rate--mid'
  return 'classroom-rate--high'
}

// logDice komma-formatiert (deutsche Schreibweise), null → leer.
function fmtDice(v) {
  return v == null ? null : String(v).replace('.', ',')
}

// Modus-Pille in der Marken-Optik aus design.md (Farbe je Modus).
function ModeBadge({ mode }) {
  return <span className={`classroom-mode-badge classroom-mode-badge--${mode}`}>{modeLabel(mode)}</span>
}

// Ein Wörterbuch-Eintrag pro Lemma (Headword, Ø-Punkte, Lösung, Distraktor,
// aufklappbare Antwortverteilung). showBadge=false in gruppierter Ansicht
// (der Modus steht dann in der Gruppen-Überschrift).
function LemmaEntry({ row, showBadge }) {
  const dist = Array.isArray(row.distribution) ? row.distribution : []
  const isOption = dist[0]?.kind === 'option'
  const firstDistractorIdx = isOption ? dist.findIndex((o) => !o.correct) : -1

  return (
    <article className="classroom-result-card">
      <header className="classroom-result-card__head">
        <h3 className="classroom-result-card__lemma">{row.lemma}</h3>
        {showBadge && <ModeBadge mode={row.mode} />}
      </header>

      <p className="classroom-result-card__sub">
        n = {row.participants} · Ø{' '}
        <span className={`classroom-result-card__avg ${rateClass(row.hitRatePct)}`}>{row.avgScore}</span>
        {' '}/ {row.maxScore} Pkt.
      </p>

      {/* Lösung dauerhaft sichtbar — bei Kollokationen die besten 3 + logDice. */}
      {isOption && (
        <p className="classroom-result-card__solution">
          <span className="classroom-result-card__solutionLead">Beste Kollokationen: </span>
          {dist.filter((o) => o.correct).map((o, i, arr) => (
            <span key={o.label}>
              <strong>{o.label}</strong>
              {o.logDice != null && (
                <span className="classroom-result-card__ld"> ({fmtDice(o.logDice)})</span>
              )}
              {i < arr.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      )}

      {row.topDistractor && (
        <p className="classroom-result-card__distractor">
          <span className="classroom-result-card__distractorLead">Häufigste Fehlantwort: </span>
          <strong>{row.topDistractor.label}</strong>
          <span className="classroom-result-card__distractorCount">
            {' '}— {row.topDistractor.count}×
          </span>
        </p>
      )}

      {dist.length > 0 && (
        <details className="classroom-dist" data-testid="classroom-end-dist">
          <summary className="classroom-dist__toggle">
            {isOption
              ? `Antwortverteilung · ${dist.length} Optionen`
              : `Trefferquote je Item · ${dist.length}`}
          </summary>
          <ul className="classroom-dist__list">
            {dist.map((o, idx) => {
              const bandClass = isOption
                ? (o.correct ? ' classroom-dist__row--correct' : '')
                : ` ${rateClass(o.pct).replace('classroom-rate--', 'classroom-dist__row--band-')}`
              const divideClass = idx === firstDistractorIdx && firstDistractorIdx > 0
                ? ' classroom-dist__row--divide'
                : ''
              const ariaVerb = isOption
                ? `${o.count}× gewählt, ${o.pct} Prozent${o.correct ? ', korrekt' : ''}`
                : `${o.pct} Prozent richtig${o.sub ? `, Lösung ${o.sub}` : ''}`
              return (
                <li key={o.label} className={`classroom-dist__row${bandClass}${divideClass}`}>
                  <span className="classroom-dist__mark" aria-hidden="true">
                    {isOption && o.correct ? '✓' : ''}
                  </span>
                  <span className="classroom-dist__word">
                    {o.label}
                    {o.sub && <span className="classroom-dist__sub"> · {o.sub}</span>}
                    {isOption && o.logDice != null && (
                      <span className="classroom-dist__ld"> · {fmtDice(o.logDice)}</span>
                    )}
                  </span>
                  <span className="classroom-dist__bar" role="img" aria-label={`${o.label}: ${ariaVerb}`}>
                    {o.pct > 0 && (
                      <span className="classroom-dist__fill" style={{ width: `${o.pct}%` }} />
                    )}
                  </span>
                  <span className="classroom-dist__pct">{o.pct} %</span>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </article>
  )
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
  const [duplicating, setDuplicating] = useState(false)
  const [dupError, setDupError] = useState(null)
  // Pro-Lemma-Reihenfolge: inhaltlich (nach Modus gruppiert) oder nach
  // Schwierigkeit (niedrigste Trefferquote zuerst).
  const [sortBy, setSortBy] = useState('order') // 'order' | 'difficulty'

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
  const totals    = results?.totals || { participants: 0, submissions: 0 }
  const hasSubmissions = results?.hasSubmissions

  function handleCsv() {
    if (!results) return
    downloadCsv(resultsCsvFilename(results), buildResultsCsv(results))
  }

  async function handleDuplicate() {
    if (!sessionId || duplicating) return
    setDuplicating(true)
    setDupError(null)
    try {
      const dup = await duplicateSession(sessionId)
      // Frische Lobby mit neuem Code — dieselbe Stunde für die nächste Klasse.
      dispatch({ type: 'GO_TO_LOBBY', sessionId: dup.id })
    } catch (err) {
      setDupError(err?.message || 'Wiederholen fehlgeschlagen.')
    } finally {
      setDuplicating(false)
    }
  }

  return (
    <ClassroomSubScreen
      testId="classroom-end"
      title="Auswertung"
      label="Live-Sitzung"
      lead="Wie lief die Stunde?"
      backLabel="Zurück zur Übersicht"
      onBack={() => dispatch({ type: 'GO_TO_LIST' })}
    >
      {loading && <p className="classroom-loading" role="status">Auswertung wird geladen …</p>}
      {error && <p className="classroom-error" role="alert">{error}</p>}

      {results && (
        <>
          {/* Klassen-Puls: eine lesbare Aussage statt roher Zaehler. */}
          {hasSubmissions && (
            <section className="classroom-section classroom-pulse-section" aria-label="Übersicht">
              <span className="classroom-section__label">Sitzungsergebnis</span>
              <p className="classroom-pulse">{pulseSentence(totals)}</p>
              <div className="classroom-export" role="group" aria-label="Auswertung exportieren">
                <button
                  type="button"
                  className="classroom-export__btn"
                  onClick={handleCsv}
                  data-testid="classroom-end-export-csv"
                >
                  CSV speichern
                </button>
                <span className="classroom-export__sep" aria-hidden="true">·</span>
                <button
                  type="button"
                  className="classroom-export__btn"
                  onClick={() => window.print()}
                  data-testid="classroom-end-print"
                >
                  Drucken
                </button>
              </div>
              <hr className="classroom-doubleline" aria-hidden="true" />
            </section>
          )}

          {/* Empty State: Session ohne Abgaben beendet */}
          {!hasSubmissions && (
            <section className="classroom-section" aria-label="Keine Abgaben">
              <div className="classroom-result-empty" data-testid="classroom-end-empty">
                <p className="classroom-result-empty__ornament" aria-hidden="true">· · ·</p>
                <p className="classroom-result-empty__title">Keine Abgaben</p>
                <p className="classroom-result-empty__text">
                  In dieser Sitzung wurden keine Antworten eingereicht — es gibt nichts auszuwerten.
                </p>
              </div>
            </section>
          )}

          {/* Pro Lemma: Ø-Punkte, Lösung, Distraktor, Antwortverteilung. */}
          {byLemma.length > 0 && (() => {
            const distinctModes = [...new Set(byLemma.map((r) => r.mode))]
            const grouped = sortBy === 'order' && distinctModes.length > 1
            const ordered = sortBy === 'difficulty'
              ? [...byLemma].sort((a, b) => a.hitRatePct - b.hitRatePct)
              : byLemma

            return (
              <section className="classroom-section" aria-label="Auswertung pro Lemma">
                <div className="classroom-prolemma-head">
                  <span className="classroom-section__label">Pro Lemma</span>
                  <div className="classroom-sort" role="group" aria-label="Sortierung">
                    <button
                      type="button"
                      className={`classroom-sort__opt${sortBy === 'order' ? ' is-active' : ''}`}
                      aria-pressed={sortBy === 'order'}
                      onClick={() => setSortBy('order')}
                    >
                      Reihenfolge
                    </button>
                    <span className="classroom-sort__sep" aria-hidden="true">·</span>
                    <button
                      type="button"
                      className={`classroom-sort__opt${sortBy === 'difficulty' ? ' is-active' : ''}`}
                      aria-pressed={sortBy === 'difficulty'}
                      onClick={() => setSortBy('difficulty')}
                    >
                      Schwierigkeit
                    </button>
                  </div>
                </div>

                <div className="classroom-result-cards" data-testid="classroom-end-cards">
                  {grouped
                    ? (() => {
                        const out = []
                        let lastMode = null
                        ordered.forEach((row) => {
                          if (row.mode !== lastMode) {
                            out.push(
                              <h4 key={`grp-${row.assignmentId}`} className="classroom-prolemma-group">
                                <ModeBadge mode={row.mode} />
                              </h4>,
                            )
                            lastMode = row.mode
                          }
                          out.push(
                            <LemmaEntry key={`${row.assignmentId}:${row.lemmaId}`} row={row} showBadge={false} />,
                          )
                        })
                        return out
                      })()
                    : ordered.map((row) => (
                        <LemmaEntry key={`${row.assignmentId}:${row.lemmaId}`} row={row} showBadge />
                      ))}
                </div>
              </section>
            )
          })()}

          <section className="classroom-section" aria-label="Teilnehmer">
            <label className="classroom-toggle">
              <input
                type="checkbox"
                checked={showNames}
                onChange={(e) => setShowNames(e.target.checked)}
              />
              Namen zeigen ({participants.length})
            </label>
            {showNames && participants.length > 0 && (
              <ul className="classroom-participant-list" style={{ marginTop: 12 }}>
                {participants.map((p) => (
                  <li key={p.id} className="classroom-participant">
                    <span className="classroom-participant__dot" aria-hidden="true" />
                    <span className="classroom-participant__name">{p.displayName || '—'}</span>
                    <span className="classroom-participant__status">{p.leftAt ? 'verlassen' : 'dabei'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* W4 — Stunde mit neuer Klasse wiederholen: klont die Konfiguration in
          eine frische Lobby (neuer Code, ohne Teilnehmer/Abgaben). */}
      {!loading && !error && (
        <section className="classroom-section classroom-end-repeat" aria-label="Stunde wiederholen">
          <hr className="classroom-doubleline" aria-hidden="true" />
          <p className="classroom-end-repeat__hint">
            Dieselbe Stunde noch einmal — mit einer anderen Klasse?
          </p>
          {dupError && <p className="classroom-error" role="alert">{dupError}</p>}
          <button
            type="button"
            className="classroom-cta classroom-end-repeat__cta"
            onClick={handleDuplicate}
            disabled={duplicating}
            data-testid="classroom-end-repeat"
          >
            {duplicating ? 'Wird vorbereitet …' : 'Mit neuer Klasse wiederholen'}
            {!duplicating && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
          </button>
        </section>
      )}

    </ClassroomSubScreen>
  )
}
