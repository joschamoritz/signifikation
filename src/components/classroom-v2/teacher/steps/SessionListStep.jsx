// T-4.3 — T1 Sessionliste.
//
// Empty-State im Wörterbuch-Stil (Drop-Cap "K", kursiver Hinweis).
// CTA „+ Neue Session" ist die einzige primaere Aktion auf diesem Screen —
// als sticky bottom button (Mobile-first) realisiert.
//
// Pagination-Schwelle bewusst bei 50 (limit) — wenn ein Pilot-Lehrer mehr
// braucht, kommt das in Welle 2. Bis dahin reicht ein Hinweis am Ende der
// Liste, dass aelter geschnitten ist.

import { useTeacherClassroom, STEPS } from '../TeacherClassroomContext'
import { useSessionsList } from '../hooks/useSessionsList'

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

  // Bei Mount nach Setup-/Lobby-Wechsel auf einen aktualen Stand
  void state // (state nicht ungenutzt: Linter-Friend)

  function handleNew() {
    dispatch({ type: 'GO_TO_SETUP' })
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
        <ul className="cr2-card-list" aria-label="Sessions">
          {sessions.map((s) => {
            const mode = s.settings?.mode
            const statusClass =
              s.status === 'running'  ? 'cr2-card__dot--running'  :
              s.status === 'finished' ? 'cr2-card__dot--finished' : ''
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className="cr2-card"
                  onClick={() => handleResume(s)}
                  aria-label={`Session ${s.title || s.code} – ${STATUS_LABEL[s.status] || s.status}`}
                >
                  <div className="cr2-card__row">
                    <h2 className="cr2-card__title">
                      {s.title || <span style={{ fontStyle: 'italic', color: 'var(--cr2-muted)' }}>Klasse · {s.code}</span>}
                    </h2>
                    <span className="cr2-card__meta">{formatDate(s.createdAt)}</span>
                  </div>
                  <div className="cr2-card__row" style={{ marginTop: 8 }}>
                    {mode && <span className="cr2-card__badge">{MODE_LABEL[mode] || mode}</span>}
                    <span className="cr2-card__meta">
                      <span className={`cr2-card__dot ${statusClass}`} aria-hidden="true" />
                      {' '}{STATUS_LABEL[s.status] || s.status}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
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
