// T-4.4 / W2-T2 — T2 Setup: geordnete Liste von (Modus + Lemmata)-Bloecken,
// dann Name/Details.
//
// Eine Session kann seit W2-T2 mehrere Modi NACHEINANDER spielen. Der Lehrer
// legt im Setup eine geordnete Liste an (1–5 Bloecke), kann Bloecke
// hinzufuegen/entfernen/umordnen und pro Block die Schueleransicht testen.
// Bei Bestaetigung: POST /sessions → POST /assignments/bulk, dann GO_TO_LOBBY.

import { useMemo, useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { createSession, addAssignments } from '../hooks/useTeacherSession'
import ModePicker  from '../components/ModePicker'
import LemmaPicker from '../components/LemmaPicker'
import SetupPreview from '../components/SetupPreview'

const MAX_BLOCKS = 5

let blockKeySeq = 0
function newBlock(init = {}) {
  blockKeySeq += 1
  return { key: `blk-${blockKeySeq}`, mode: init.mode || null, lemmaIds: init.lemmaIds || [] }
}

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

function blocksFromDraft(draft) {
  if (Array.isArray(draft.blocks) && draft.blocks.length > 0) {
    return draft.blocks.map((b) => newBlock(b))
  }
  // Rueckwaerts-Kompat: ein alter Single-Draft (mode + lemmaIds).
  if (draft.mode || (draft.lemmaIds && draft.lemmaIds.length)) {
    return [newBlock({ mode: draft.mode || null, lemmaIds: draft.lemmaIds || [] })]
  }
  return [newBlock()]
}

export default function SetupStep() {
  const { state, dispatch } = useTeacherClassroom()
  const draft = state.setupDraft || {}

  const [blocks, setBlocks]       = useState(() => blocksFromDraft(draft))
  const [title, setTitle]         = useState(draft.title ?? defaultTitle())
  const [autoStart, setAutoStart] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)
  const [previewIdx, setPreviewIdx] = useState(null)  // index des offenen Vorschau-Blocks

  const blockValid = (b) => !!b.mode && b.lemmaIds.length > 0
  const allValid   = blocks.length > 0 && blocks.every(blockValid)
  const canSubmit  = allValid && !submitting

  const stepperItems = useMemo(() => ([
    { id: 'A', label: 'Modi',    done: allValid },
    { id: 'B', label: 'Details', done: !!title.trim() },
  ]), [allValid, title])

  function updateBlock(idx, patch) {
    setBlocks((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)))
  }
  function addBlock() {
    setBlocks((prev) => (prev.length >= MAX_BLOCKS ? prev : [...prev, newBlock()]))
  }
  function removeBlock(idx) {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }
  function moveBlock(idx, dir) {
    setBlocks((prev) => {
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const settings = { mode: blocks[0].mode, autoStart, blockCount: blocks.length }
      const session  = await createSession({ title: title.trim() || null, settings })
      await addAssignments(session.id, {
        blocks: blocks.map((b) => ({ mode: b.mode, lemmaIds: b.lemmaIds })),
      })
      dispatch({ type: 'GO_TO_LOBBY', sessionId: session.id })
    } catch (err) {
      setError(err?.message || 'Session konnte nicht angelegt werden.')
    } finally {
      setSubmitting(false)
    }
  }

  const previewBlock = previewIdx != null ? blocks[previewIdx] : null

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

      {/* A — Modus-Bloecke in Reihenfolge */}
      <section className="cr2-section" aria-labelledby="cr2-setup-modes-label">
        <span id="cr2-setup-modes-label" className="cr2-section__label">
          A · Modi nacheinander (1–{MAX_BLOCKS})
        </span>

        {blocks.map((block, idx) => (
          <article
            key={block.key}
            className="cr2-block"
            data-testid={`cr2-block-${idx}`}
            aria-label={`Modus ${idx + 1} von ${blocks.length}`}
          >
            <header className="cr2-block__head">
              <span className="cr2-block__num">Modus {idx + 1} von {blocks.length}</span>
              <div className="cr2-block__tools" role="group" aria-label="Block ordnen">
                <button
                  type="button"
                  className="cr2-block__tool"
                  onClick={() => moveBlock(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Modus ${idx + 1} nach oben`}
                  data-testid={`cr2-block-up-${idx}`}
                >↑</button>
                <button
                  type="button"
                  className="cr2-block__tool"
                  onClick={() => moveBlock(idx, +1)}
                  disabled={idx === blocks.length - 1}
                  aria-label={`Modus ${idx + 1} nach unten`}
                  data-testid={`cr2-block-down-${idx}`}
                >↓</button>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    className="cr2-block__tool cr2-block__tool--remove"
                    onClick={() => removeBlock(idx)}
                    aria-label={`Modus ${idx + 1} entfernen`}
                    data-testid={`cr2-block-remove-${idx}`}
                  >×</button>
                )}
              </div>
            </header>

            <ModePicker
              value={block.mode}
              onChange={(mode) => updateBlock(idx, { mode })}
            />
            <LemmaPicker
              mode={block.mode}
              value={block.lemmaIds}
              onChange={(lemmaIds) => updateBlock(idx, { lemmaIds })}
            />

            <button
              type="button"
              className="cr2-btn cr2-btn--ghost cr2-block__preview"
              disabled={!blockValid(block)}
              onClick={() => setPreviewIdx(idx)}
              data-testid={`cr2-block-preview-${idx}`}
            >
              Schüleransicht testen
            </button>
          </article>
        ))}

        {blocks.length < MAX_BLOCKS && (
          <button
            type="button"
            className="cr2-btn cr2-btn--ghost cr2-block-add"
            onClick={addBlock}
            data-testid="cr2-block-add"
          >
            + Weiterer Modus
          </button>
        )}
      </section>

      {/* B — Details */}
      <section className="cr2-section" aria-labelledby="cr2-setup-title-label">
        <span id="cr2-setup-title-label" className="cr2-section__label">B · Details</span>
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
            className="cr2-btn cr2-btn--primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            data-testid="cr2-setup-submit"
          >
            {submitting ? 'Wird angelegt …' : 'Lobby öffnen'}
          </button>
        </div>
      </div>

      {previewBlock && (
        <SetupPreview
          mode={previewBlock.mode}
          lemmaIds={previewBlock.lemmaIds}
          onClose={() => setPreviewIdx(null)}
        />
      )}
    </div>
  )
}
