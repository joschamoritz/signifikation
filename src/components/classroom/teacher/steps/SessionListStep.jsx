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

const MODE_LABEL = {
  kollokationen: 'Kollokationen',
  wortzwilling:  'Wort-Zwilling',
  zeitenwende:   'Zeitenwende',
  lueckenfueller: 'Lückenfüller',
}

// Marginalien-Kürzel pro Modus — analog zur Spielmodi-Startseite (KOLLOKT., KOMPAR. …).
const MODE_MARGIN = {
  kollokationen: 'KOLLOKT.',
  wortzwilling:  'KOMPAR.',
  zeitenwende:   'DIACH.',
  lueckenfueller: 'KONSTR.',
}

const STATUS_LABEL = {
  lobby:    'Lobby',
  running:  'Läuft',
  finished: 'Beendet',
  aborted:  'Abgebrochen',
}

// Eingekreiste Ziffern ①–⑳ wie im Wörterbuch; darüber hinaus schlichte Zahl.
function entryGlyph(i) {
  return i < 20 ? String.fromCharCode(0x2460 + i) : String(i + 1)
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
    <div data-testid="cr2-session-list">
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
          <span className="cr2-empty__dropcap" aria-hidden="true">K</span>
          <p className="cr2-empty__title">
            Noch keine Sessions. Lege deine erste an —<br />
            eine Klasse braucht nur einen Modus und ein Lemma.
          </p>
        </div>
      )}

      {!loading && !error && sessions.length > 0 && (
        <ol className="cr2-entries" aria-label="Sessions">
          {sessions.map((s, idx) => {
            const mode = s.settings?.mode
            const statusKey = s.status
            const ctaText =
              statusKey === 'lobby'   ? 'Lobby öffnen' :
              statusKey === 'running' ? 'Live ansehen' : 'Auswertung'
            const dotClass =
              statusKey === 'running'  ? 'cr2-status-dot--running'  :
              statusKey === 'finished' ? 'cr2-status-dot--finished' :
              statusKey === 'lobby'    ? 'cr2-status-dot--lobby'    : ''
            return (
              <li key={s.id} className="cr2-entry">
                <div className="test-entry-number" aria-hidden="true">
                  <span className="test-entry-num-glyph">{entryGlyph(idx)}</span>
                  <span className="test-entry-marginalia">{MODE_MARGIN[mode] || 'SESSION'}</span>
                </div>

                <div className="test-entry-body">
                  {confirmId === s.id ? (
                    <div className="cr2-entry__confirm" role="group" aria-label="Löschen bestätigen">
                      <button
                        type="button"
                        className="cr2-entry__confirm-yes"
                        onClick={() => doDelete(s)}
                        disabled={busyId === s.id}
                        data-testid={`cr2-session-delete-confirm-${s.id}`}
                      >
                        {busyId === s.id ? '…' : 'Löschen'}
                      </button>
                      <button
                        type="button"
                        className="cr2-entry__confirm-no"
                        onClick={() => setConfirmId(null)}
                        disabled={busyId === s.id}
                      >
                        Abbrechen
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="cr2-entry__delete"
                      onClick={() => { setDelError(null); setConfirmId(s.id) }}
                      aria-label={`Session ${s.title || s.code} löschen`}
                      title="Session löschen"
                      data-testid={`cr2-session-delete-${s.id}`}
                    >
                      ×
                    </button>
                  )}

                  <div className="test-entry-head">
                    <h2 className="test-headword">
                      {s.title || <span className="cr2-entry__untitled">Klasse · {s.code}</span>}
                    </h2>
                    <span className="test-ipa">{formatDate(s.createdAt)}</span>
                  </div>

                  <div className="test-entry-grammar">
                    <span className="test-pos">Session</span>
                    <span className="test-pos-rule" aria-hidden="true" />
                    {mode && <span className="test-entry-category">{MODE_LABEL[mode] || mode}</span>}
                  </div>

                  <div className="test-entry-footer">
                    <span className={`test-status${statusKey === 'finished' ? ' test-status--done' : ''}`}>
                      <span className={`cr2-status-dot ${dotClass}`} aria-hidden="true" />
                      {STATUS_LABEL[statusKey] || statusKey}
                    </span>
                    <button
                      type="button"
                      className="test-cta"
                      onClick={() => handleResume(s)}
                      aria-label={`Session ${s.title || s.code} – ${STATUS_LABEL[statusKey] || statusKey}: ${ctaText}`}
                    >
                      {ctaText}
                      <span className="test-cta-arrow" aria-hidden="true"> →</span>
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="cr2-sticky-cta" role="none">
        <div className="cr2-sticky-cta__inner">
          <button
            type="button"
            className="cr2-btn cr2-btn--primary"
            data-testid="cr2-new-session"
            onClick={handleNew}
          >
            + Neue Session
          </button>
        </div>
      </div>
    </div>
  )
}
