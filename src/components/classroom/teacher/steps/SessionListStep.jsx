// T-4.3 — T1 Sessionliste.
//
// Empty-State im Wörterbuch-Stil (Drop-Cap "K", kursiver Hinweis).
// CTA „+ Neue Session" ist die einzige primaere Aktion auf diesem Screen —
// als sticky bottom button (Mobile-first) realisiert.
//
// Pagination-Schwelle bewusst bei 50 (limit) — wenn eine Lehrkraft mehr
// braucht, kommt das in Welle 2. Bis dahin reicht ein Hinweis am Ende der
// Liste, dass aelter geschnitten ist.

import { useState } from 'react'
import { useTeacherClassroom, STEPS } from '../TeacherClassroomContext'
import { useSessionsList } from '../hooks/useSessionsList'
import { deleteSession } from '../hooks/useTeacherSession'
import ClassroomSubScreen from '../components/ClassroomSubScreen'

const MODE_LABEL = {
  kollokationen: 'Kollokationen',
  wortzwilling:  'Wort-Zwilling',
  zeitenwende:   'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

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
  const { sessions, loading, error, refresh } = useSessionsList({ limit: 50 })
  const [confirmId, setConfirmId] = useState(null)
  const [busyId, setBusyId]       = useState(null)
  const [delError, setDelError]   = useState(null)

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
      setDelError(err?.message || 'Session konnte nicht gelöscht werden.')
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

  return (
    <ClassroomSubScreen
      testId="cr2-session-list"
      title="Sessions"
      label="Live-Session"
      lead="Verwalte deine Live-Stunden."
    >
      {loading && <p className="cr2-loading">Sessions werden geladen …</p>}

      {error && (
        <p className="cr2-error">
          {error}{' '}
          <button type="button" className="cr2-btn cr2-btn--ghost" onClick={refresh}>
            Erneut versuchen
          </button>
        </p>
      )}

      {delError && <p className="cr2-error" role="alert">{delError}</p>}

      {!loading && !error && sessions.length === 0 && (
        <div className="cr2-empty" role="status">
          <span className="cr2-empty__ornament" aria-hidden="true">· · ·</span>
          <p className="cr2-empty__title">
            Noch keine Sessions. Lege deine erste an —<br />
            eine Klasse braucht nur einen Modus und ein Lemma.
          </p>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <ol className="lemma-cards cr2-session-cards" aria-label="Sessions">
          {sessions.map((s) => {
            const mode = s.settings?.mode
            const statusKey = s.status
            const dotClass =
              statusKey === 'running'  ? 'cr2-status-dot--running'  :
              statusKey === 'finished' ? 'cr2-status-dot--finished' :
              statusKey === 'lobby'    ? 'cr2-status-dot--lobby'    : ''
            const confirming = confirmId === s.id
            return (
              <li key={s.id} className="lemma-card-wrap">
                <div className="lemma-card">
                  <button
                    className="lemma-card-main"
                    type="button"
                    onClick={() => handleResume(s)}
                    aria-label={`Session ${s.title || s.code} – ${STATUS_LABEL[statusKey] || statusKey}`}
                  >
                    <div className="lemma-info">
                      <div className="lemma-header-row">
                        <span className="lemma-name">
                          {s.title || <span className="cr2-session-untitled">Klasse · {s.code}</span>}
                        </span>
                        {mode && <span className="lemma-wortart-abbrev">{MODE_LABEL[mode] || mode}</span>}
                      </div>
                      <div className="lemma-definition">
                        <p>
                          <span className={`cr2-status-dot ${dotClass}`} aria-hidden="true" />
                          {STATUS_LABEL[statusKey] || statusKey} · {formatDate(s.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className="lemma-arrow" aria-hidden="true">›</span>
                  </button>

                  {!confirming && (
                    <button
                      type="button"
                      className="lemma-info-btn cr2-session-del"
                      onClick={() => { setDelError(null); setConfirmId(s.id) }}
                      aria-label={`Session ${s.title || s.code} löschen`}
                      title="Session löschen"
                      data-testid={`cr2-session-delete-${s.id}`}
                    >
                      ×
                    </button>
                  )}
                </div>

                {confirming && (
                  <div className="cr2-session-confirm" role="group" aria-label="Löschen bestätigen">
                    <span className="cr2-session-confirm__q">Session löschen?</span>
                    <button
                      type="button"
                      className="cr2-session-confirm__yes"
                      onClick={() => doDelete(s)}
                      disabled={busyId === s.id}
                      data-testid={`cr2-session-delete-confirm-${s.id}`}
                    >
                      {busyId === s.id ? '…' : 'Löschen'}
                    </button>
                    <button
                      type="button"
                      className="cr2-session-confirm__no"
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

      <div className="cr2-sticky-cta" role="none">
        <div className="cr2-sticky-cta__inner">
          <button
            type="button"
            className="cr2-cta"
            data-testid="cr2-new-session"
            onClick={handleNew}
          >
            <span className="cr2-cta__plus" aria-hidden="true">＋</span>
            Neue Session anlegen
            <span className="test-cta-arrow" aria-hidden="true"> →</span>
          </button>
        </div>
      </div>
    </ClassroomSubScreen>
  )
}
