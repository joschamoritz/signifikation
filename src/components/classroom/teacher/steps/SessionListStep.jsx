// T-4.3 — T1 Sessionliste.
//
// Empty-State im Wörterbuch-Stil (Drop-Cap "K", kursiver Hinweis).
// CTA „+ Neue Session“ ist die einzige primaere Aktion auf diesem Screen —
// als sticky bottom button (Mobile-first) realisiert.
//
// Pagination-Schwelle bewusst bei 50 (limit) — wenn eine Lehrkraft mehr
// braucht, kommt das in Welle 2. Bis dahin reicht ein Hinweis am Ende der
// Liste, dass aelter geschnitten ist.

import { useState } from 'react'
import { useTeacherClassroom, STEPS } from '../TeacherClassroomContext'
import { useSessionsList } from '../hooks/useSessionsList'
import { useQuickStartSession } from '../hooks/useQuickStartSession'
import { deleteSession, duplicateSession } from '../hooks/useTeacherSession'
import ClassroomSubScreen from '../components/ClassroomSubScreen'
import { MODE_LABEL } from '../../modeLabels'

const STATUS_LABEL = {
  lobby:    'Lobby',
  running:  'Läuft',
  finished: 'Beendet',
  aborted:  'Abgebrochen',
}

function formatDate(ts) {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day:   '2-digit',
      month: '2-digit',
      hour:  '2-digit',
      minute: '2-digit',
    }).format(new Date(ts))
  } catch { return '' }
}

function statusToStep(status) {
  if (status === 'lobby') return STEPS.LOBBY
  if (status === 'running') return STEPS.LIVE
  return STEPS.END
}

export default function SessionListStep() {
  const { state, dispatch } = useTeacherClassroom()
  const { sessions, loading, error, refresh } = useSessionsList({ limit: 50, pollMs: 30000 })
  const quick = useQuickStartSession()
  const [confirmId, setConfirmId] = useState(null)
  const [busyId, setBusyId]       = useState(null)
  const [delError, setDelError]   = useState(null)
  const [dupBusyId, setDupBusyId] = useState(null)

  // Bei Mount nach Setup-/Lobby-Wechsel auf einen aktualen Stand
  void state // (state nicht ungenutzt: Linter-Friend)

  function handleNew() {
    dispatch({ type: 'GO_TO_SETUP' })
  }

  async function doDelete(session) {
    setBusyId(session.id)
    setDelError(null)
    try {
      await deleteSession(session.id)
      setConfirmId(null)
      refresh()
    } catch (err) {
      setDelError(err?.message || 'Sitzung konnte nicht gelöscht werden.')
    } finally {
      setBusyId(null)
    }
  }

  function handleResume(session) {
    dispatch({
      type: 'RESUME_SESSION',
      sessionId: session.id,
      step: statusToStep(session.status),
    })
  }

  async function handleDuplicate(session) {
    if (dupBusyId) return
    setDupBusyId(session.id)
    setDelError(null)
    try {
      const dup = await duplicateSession(session.id)
      // Direkt in die Lobby der frischen Session — neuer Code, teilen, los.
      dispatch({ type: 'GO_TO_LOBBY', sessionId: dup.id })
    } catch (err) {
      setDelError(err?.message || 'Sitzung konnte nicht wiederholt werden.')
    } finally {
      setDupBusyId(null)
    }
  }

  return (
    <ClassroomSubScreen
      testId="classroom-session-list"
      title="Sitzungen"
      label="Live-Sitzung"
      lead="Verwalte deine Live-Stunden."
    >
      {loading && <p className="classroom-loading">Sitzungen werden geladen …</p>}

      {error && (
        <p className="classroom-error">
          {error}{' '}
          <button type="button" className="classroom-btn classroom-btn--ghost" onClick={refresh}>
            Erneut versuchen
          </button>
        </p>
      )}

      {delError && <p className="classroom-error" role="alert">{delError}</p>}

      {!loading && !error && sessions.length === 0 && (
        <div className="classroom-empty" role="status">
          <span className="classroom-empty__ornament" aria-hidden="true">· · ·</span>
          <p className="classroom-empty__title">
            Noch keine Sitzungen. Lege deine erste an —<br />
            eine Klasse braucht nur einen Modus und ein Lemma.
          </p>

          {quick.available && (
            <div className="classroom-quickstart">
              <p className="classroom-quickstart__lead">Am schnellsten loslegen:</p>
              <button
                type="button"
                className="test-cta classroom-quickstart__cta"
                onClick={quick.quickStart}
                disabled={quick.busy}
                data-testid="classroom-quickstart"
              >
                {quick.busy ? 'Wird angelegt …' : 'Erste Sitzung mit den Wörtern von heute'}
                {!quick.busy && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
              </button>
              <p className="classroom-quickstart__hint">Kollokationen · direkt in die Lobby. Anpassen kannst du alles später.</p>
            </div>
          )}
          {quick.error && <p className="classroom-error" role="alert">{quick.error}</p>}
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <ol className="lemma-cards classroom-session-cards" aria-label="Sitzungen">
          {sessions.map((s) => {
            // Alle gespielten Modi (in Reihenfolge); Fallback auf settings.mode
            // für Altsessions ohne Modi-Liste.
            const modeList = Array.isArray(s.modes) && s.modes.length
              ? s.modes
              : (s.settings?.mode ? [s.settings.mode] : [])
            const modeLabel = modeList.map((m) => MODE_LABEL[m] || m).join(' · ')
            const statusKey = s.status
            const dotClass =
              statusKey === 'running'  ? 'classroom-status-dot--running'  :
              statusKey === 'finished' ? 'classroom-status-dot--finished' :
              statusKey === 'lobby'    ? 'classroom-status-dot--lobby'    : ''
            const confirming = confirmId === s.id
            return (
              <li key={s.id} className="lemma-card-wrap">
                <div className="lemma-card">
                  <button
                    className="lemma-card-main"
                    type="button"
                    onClick={() => handleResume(s)}
                    aria-label={`Sitzung ${s.title || s.code} – ${STATUS_LABEL[statusKey] || statusKey}`}
                  >
                    <div className="lemma-info">
                      <div className="lemma-header-row">
                        <span className="lemma-name">
                          {s.title || <span className="classroom-session-untitled">Klasse · {s.code}</span>}
                        </span>
                        {modeLabel && <span className="lemma-wortart-abbrev">{modeLabel}</span>}
                      </div>
                      <div className="lemma-definition">
                        <p>
                          <span className={`classroom-status-dot ${dotClass}`} aria-hidden="true" />
                          {STATUS_LABEL[statusKey] || statusKey} · {formatDate(s.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className="lemma-arrow" aria-hidden="true">›</span>
                  </button>

                  {!confirming && (
                    <>
                      <button
                        type="button"
                        className="lemma-info-btn classroom-session-repeat"
                        onClick={() => handleDuplicate(s)}
                        disabled={dupBusyId === s.id}
                        aria-label={`Sitzung ${s.title || s.code} mit neuer Klasse wiederholen`}
                        title="Mit neuer Klasse wiederholen"
                        data-testid={`classroom-session-repeat-${s.id}`}
                      >
                        {dupBusyId === s.id ? '…' : '↻'}
                      </button>
                      <button
                        type="button"
                        className="lemma-info-btn classroom-session-del"
                        onClick={() => { setDelError(null); setConfirmId(s.id) }}
                        aria-label={`Sitzung ${s.title || s.code} löschen`}
                        title="Sitzung löschen"
                        data-testid={`classroom-session-delete-${s.id}`}
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>

                {confirming && (
                  <div className="classroom-session-confirm" role="group" aria-label="Löschen bestätigen">
                    <span className="classroom-session-confirm__q">Sitzung löschen?</span>
                    <button
                      type="button"
                      className="classroom-session-confirm__yes"
                      onClick={() => doDelete(s)}
                      disabled={busyId === s.id}
                      data-testid={`classroom-session-delete-confirm-${s.id}`}
                    >
                      {busyId === s.id ? '…' : 'Löschen'}
                    </button>
                    <button
                      type="button"
                      className="classroom-session-confirm__no"
                      onClick={() => setConfirmId(null)}
                      disabled={busyId === s.id}
                    >
                      Abbrechen
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <div className="classroom-sticky-cta" role="none">
        <div className="classroom-sticky-cta__inner">
          <button
            type="button"
            className="classroom-cta"
            data-testid="classroom-new-session"
            onClick={handleNew}
          >
            <span className="classroom-cta__plus" aria-hidden="true">＋</span>
            Neue Sitzung anlegen
            <span className="test-cta-arrow" aria-hidden="true"> →</span>
          </button>
        </div>
      </div>
    </ClassroomSubScreen>
  )
}
