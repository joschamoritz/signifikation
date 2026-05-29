// T-4.4 — T2 Setup: Modus, Lemmata, Name auf einem Screen.
//
// Stepper-Header oben (A/B/C), alle drei Bereiche untereinander sichtbar.
// CTA „Lobby öffnen" ist sticky bottom — disabled bis Modus + min. 1 Lemma.
// Bei Bestaetigung: POST /sessions → POST /assignments, dann GO_TO_LOBBY.

import { useMemo, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { createSession, addAssignment } from '../hooks/useTeacherSession'
import ModePicker  from '../components/ModePicker'
import LemmaPicker from '../components/LemmaPicker'
import SetupPreview from '../components/SetupPreview'

function defaultTitle() {
  try {
    const date = new Intl.DateTimeFormat('de-DE', {
      day:   '2-digit',
      month: '2-digit',
      year:  'numeric',
    }).format(new Date())
    return `Klasse ${date}`
  } catch { return 'Klasse' }
}

export default function SetupStep() {
  const { state, dispatch } = useTeacherClassroom()
  const draft = state.setupDraft || {}

  const [mode, setMode]         = useState(draft.mode || null)
  const [lemmaIds, setLemmaIds] = useState(draft.lemmaIds || [])
  const [title, setTitle]       = useState(draft.title ?? defaultTitle())
  const [autoStart, setAutoStart] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const canSubmit = !!mode && lemmaIds.length > 0 && !submitting
  const canPreview = !!mode && lemmaIds.length > 0

  const stepperItems = useMemo(() => ([
    { id: 'A', label: 'Modus',   done: !!mode },
    { id: 'B', label: 'Lemmata', done: lemmaIds.length > 0 },
    { id: 'C', label: 'Details', done: !!title.trim() },
  ]), [mode, lemmaIds, title])

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const settings = { mode, autoStart }
      const session  = await createSession({ title: title.trim() || null, settings })
      await addAssignment(session.id, { mode, lemmaIds })
      dispatch({ type: 'GO_TO_LOBBY', sessionId: session.id })
    } catch (err) {
      setError(err?.message || 'Session konnte nicht angelegt werden.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div data-testid="cr2-setup">
      <button
        type="button"
        className="cr2-btn cr2-btn--ghost"
        onClick={() => dispatch({ type: 'GO_TO_LIST' })}
        style={{ marginBottom: 12 }}
      >
        ← Zurück
      </button>

      <ol className="cr2-stepper" aria-label="Setup-Schritte">
        {stepperItems.map((item, idx) => (
          <li key={item.id} className={`cr2-stepper__item${item.done ? ' cr2-stepper__item--done' : (idx === 0 || stepperItems[idx - 1].done) ? ' cr2-stepper__item--active' : ''}`}>
            <span className="cr2-stepper__num">{item.id}</span>
            <span>{item.label}</span>
            {idx < stepperItems.length - 1 && <span className="cr2-stepper__sep">·</span>}
          </li>
        ))}
      </ol>

      {/* A — Modus */}
      <section className="cr2-section" aria-labelledby="cr2-setup-mode-label">
        <span id="cr2-setup-mode-label" className="cr2-section__label">A · Spielmodus</span>
        <ModePicker value={mode} onChange={setMode} />
      </section>

      {/* B — Lemmata */}
      <section className="cr2-section" aria-labelledby="cr2-setup-lemma-label">
        <span id="cr2-setup-lemma-label" className="cr2-section__label">B · Lemmata (1–3)</span>
        <LemmaPicker value={lemmaIds} onChange={setLemmaIds} />
      </section>

      {/* C — Details */}
      <section className="cr2-section" aria-labelledby="cr2-setup-title-label">
        <span id="cr2-setup-title-label" className="cr2-section__label">C · Details</span>
        <input
          type="text"
          className="cr2-input"
          placeholder="Klassen-Name (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          aria-label="Klassen-Name"
        />
        <label className="cr2-toggle" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={autoStart}
            onChange={(e) => setAutoStart(e.target.checked)}
          />
          Sofort starten (statt Lobby öffnen)
        </label>
      </section>

      {error && <p className="cr2-error">{error}</p>}

      <div className="cr2-sticky-cta" role="none">
        <div className="cr2-sticky-cta__inner">
          <button
            type="button"
            className="cr2-btn cr2-btn--ghost"
            disabled={!canPreview}
            onClick={() => setPreviewOpen(true)}
            data-testid="cr2-setup-preview-open"
          >
            Schüleransicht testen
          </button>
          <button
            type="button"
            className="cr2-btn cr2-btn--primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            data-testid="cr2-setup-submit"
          >
            {submitting ? 'Wird angelegt …' : 'Lobby öffnen'}
          </button>
        </div>
      </div>

      {previewOpen && (
        <SetupPreview
          mode={mode}
          lemmaIds={lemmaIds}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}
