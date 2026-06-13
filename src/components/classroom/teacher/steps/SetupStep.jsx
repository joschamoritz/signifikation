// T-4.4 / W2-T2 — T2 Setup: geordnete Liste von (Modus + Lemmata)-Bloecken,
// dann Name/Details.
//
// Eine Session kann seit W2-T2 mehrere Modi NACHEINANDER spielen. Der Lehrer
// legt im Setup eine geordnete Liste an (1–5 Bloecke), kann Bloecke
// hinzufuegen/entfernen/umordnen und pro Block die Schueleransicht testen.
// Bei Bestaetigung: POST /sessions → POST /assignments/bulk, dann GO_TO_LOBBY.

import { useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { createSession, addAssignments } from '../hooks/useTeacherSession'
import ModePicker  from '../components/ModePicker'
import LemmaPicker from '../components/LemmaPicker'
import WortZwillingPicker from '../components/WortZwillingPicker'
import SetupPreview from '../components/SetupPreview'
import ClassroomSubScreen from '../components/ClassroomSubScreen'

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState(null)
  const [previewIdx, setPreviewIdx] = useState(null)  // index des offenen Vorschau-Blocks

  const blockValid = (b) => !!b.mode && b.lemmaIds.length > 0
  const allValid   = blocks.length > 0 && blocks.every(blockValid)
  const canSubmit  = allValid && !submitting

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
      const settings = { mode: blocks[0].mode, blockCount: blocks.length }
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
    <ClassroomSubScreen
      testId="classroom-setup"
      title="Neue Session"
      label="Live-Session"
      lead="Modus und Wörter wählen."
      backLabel="Zurück zu den Sessions"
      onBack={() => dispatch({ type: 'GO_TO_LIST' })}
    >
      {/* I — Modus-Bloecke in Reihenfolge */}
      <section className="classroom-section" aria-labelledby="classroom-setup-modes-label">
        <span id="classroom-setup-modes-label" className="classroom-section__label">
          I · Modi &amp; Wörter <span className="classroom-section__hint">(1–{MAX_BLOCKS})</span>
        </span>

        {blocks.map((block, idx) => (
          <article
            key={block.key}
            className="classroom-block"
            data-testid={`classroom-block-${idx}`}
            aria-label={`Modus ${idx + 1} von ${blocks.length}`}
          >
            <header className="classroom-block__head">
              <span className="classroom-block__num">Modus {idx + 1} von {blocks.length}</span>
              <div className="classroom-block__tools" role="group" aria-label="Block ordnen">
                <button
                  type="button"
                  className="classroom-block__tool"
                  onClick={() => moveBlock(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Modus ${idx + 1} nach oben`}
                  data-testid={`classroom-block-up-${idx}`}
                >↑</button>
                <button
                  type="button"
                  className="classroom-block__tool"
                  onClick={() => moveBlock(idx, +1)}
                  disabled={idx === blocks.length - 1}
                  aria-label={`Modus ${idx + 1} nach unten`}
                  data-testid={`classroom-block-down-${idx}`}
                >↓</button>
                {blocks.length > 1 && (
                  <button
                    type="button"
                    className="classroom-block__tool classroom-block__tool--remove"
                    onClick={() => removeBlock(idx)}
                    aria-label={`Modus ${idx + 1} entfernen`}
                    data-testid={`classroom-block-remove-${idx}`}
                  >×</button>
                )}
              </div>
            </header>

            <ModePicker
              value={block.mode}
              onChange={(mode) => updateBlock(idx, { mode, lemmaIds: [] })}
            />
            {block.mode === 'wortzwilling' ? (
              <WortZwillingPicker
                value={block.lemmaIds}
                onChange={(lemmaIds) => updateBlock(idx, { lemmaIds })}
              />
            ) : (
              <LemmaPicker
                mode={block.mode}
                value={block.lemmaIds}
                onChange={(lemmaIds) => updateBlock(idx, { lemmaIds })}
              />
            )}

            <button
              type="button"
              className="test-cta classroom-block__preview"
              disabled={!blockValid(block)}
              onClick={() => setPreviewIdx(idx)}
              data-testid={`classroom-block-preview-${idx}`}
            >
              Schüleransicht testen
              <span className="test-cta-arrow" aria-hidden="true"> →</span>
            </button>
          </article>
        ))}

        {blocks.length < MAX_BLOCKS && (
          <button
            type="button"
            className="test-cta classroom-block-add"
            onClick={addBlock}
            data-testid="classroom-block-add"
          >
            <span aria-hidden="true">＋</span> Weiterer Modus
          </button>
        )}
      </section>

      <div className="test-rule--double" role="separator" aria-hidden="true" />

      {/* II — Details */}
      <section className="classroom-section" aria-labelledby="classroom-setup-title-label">
        <span id="classroom-setup-title-label" className="classroom-section__label">II · Details</span>
        <input
          type="text"
          className="classroom-headword-input"
          placeholder="Klassen-Name (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          aria-label="Klassen-Name"
        />
      </section>

      {error && <p className="classroom-error">{error}</p>}

      <div className="classroom-sticky-cta" role="none">
        <div className="classroom-sticky-cta__inner">
          <button
            type="button"
            className="classroom-cta"
            disabled={!canSubmit}
            onClick={handleSubmit}
            data-testid="classroom-setup-submit"
          >
            {submitting ? 'Wird angelegt …' : 'Lobby öffnen'}
            {!submitting && <span className="test-cta-arrow" aria-hidden="true"> →</span>}
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
    </ClassroomSubScreen>
  )
}
