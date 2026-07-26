// W2-T1 — Teacher-Preview „Schüleransicht testen“.
//
// Rendert die ECHTE Schüler-Spielkomponente (classroom/student/games/*) im
// Kiosk-Look, aber vollständig lokal:
//   - KEIN Socket, KEIN Join, KEINE Session, KEINE Submission, KEIN Scoring.
//   - Inhalt kommt aus POST /preview → derselbe content_snapshot + dieselbe
//     Whitelist (buildSafePrompt) wie im Echtbetrieb (server/routes/classroom.js).
//   - onSubmit ist ein No-Op-Handler, der nur lokal zum nächsten Lemma /
//     zur nächsten Lückenfüller-Runde weiterschaltet.
//
// Schließen führt ohne Seiteneffekte zurück ins Setup (onClose).

import { useEffect, useState } from 'react'
import { previewAssignment } from '../hooks/useTeacherSession'
import ClassroomGameKollokationen  from '../../student/games/ClassroomGameKollokationen'
import ClassroomGameWortZwilling   from '../../student/games/ClassroomGameWortZwilling'
import ClassroomGameZeitenwende    from '../../student/games/ClassroomGameZeitenwende'
import ClassroomGameLueckenfueller from '../../student/games/ClassroomGameLueckenfueller'
// Spielscreen-Optik (Optionsliste/Header/Footer) — wie im echten Kiosk.
import '../../../../styles/quiz.css'
import '../../student/KioskShell.css'
import './SetupPreview.css'

function pickGameComponent(mode) {
  switch (mode) {
    case 'kollokationen':   return ClassroomGameKollokationen
    case 'wortzwilling':    return ClassroomGameWortZwilling
    case 'zeitenwende':     return ClassroomGameZeitenwende
    case 'lueckenfueller':  return ClassroomGameLueckenfueller
    default:                 return null
  }
}

// Lückenfüller liefert das volle (gewhitelistete) rounds-Array; die Spiel-
// Komponente erwartet aber prompt.currentRound / prompt.roundIndex (so wie
// buildStudentView es im Echtbetrieb pro Submission nachschiebt). Wir formen
// das hier lokal je Schritt.
function gamePromptFor(mode, lemma, roundIndex) {
  if (mode === 'lueckenfueller') {
    const rounds = Array.isArray(lemma?.prompt?.rounds) ? lemma.prompt.rounds : []
    return { currentRound: rounds[roundIndex] || null, roundIndex }
  }
  return lemma?.prompt || {}
}

function roundCount(mode, lemma) {
  if (mode !== 'lueckenfueller') return 1
  return Array.isArray(lemma?.prompt?.rounds) ? lemma.prompt.rounds.length : 1
}

// Hat das Lemma überhaupt spielbaren Inhalt? (z. B. Lückenfüller braucht genug
// Belege → sonst leere rounds; Zeitenwende/Kollokationen/Wort-Zwilling brauchen
// Wörter.) Steuert eine klare Eignungs-Meldung statt eines leeren Spielscreens.
function lemmaHasContent(mode, lemma) {
  const p = lemma?.prompt || {}
  if (mode === 'lueckenfueller') return Array.isArray(p.rounds) && p.rounds.length > 0
  return Array.isArray(p.words) && p.words.length > 0
}

const NO_CONTENT_HINT = {
  lueckenfueller: 'Für dieses Lemma gibt es nicht genug Belege für den Lückenfüller. Wähle ein anderes Lemma.',
  zeitenwende:    'Dieses Lemma hat zu wenig zeitliche Distinktion (vor/nach 2000). Wähle ein anderes Lemma.',
  kollokationen:  'Für dieses Lemma konnten keine Kollokationen erzeugt werden. Wähle ein anderes Lemma.',
  wortzwilling:   'Dieses Paar hat zu wenig unterscheidende Begleitwörter. Wähle ein anderes Paar.',
}

export default function SetupPreview({ mode, lemmaIds, onClose }) {
  const [status, setStatus]   = useState('loading') // loading | ready | error
  const [error, setError]     = useState(null)
  const [lemmata, setLemmata] = useState([])
  const [lemmaIndex, setLemmaIndex] = useState(0)
  const [roundIndex, setRoundIndex] = useState(0)
  const [done, setDone]       = useState(false)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    setError(null)
    previewAssignment({ mode, lemmaIds })
      .then((data) => {
        if (!alive) return
        const items = Array.isArray(data?.lemmata) ? data.lemmata : []
        setLemmata(items)
        setLemmaIndex(0)
        setRoundIndex(0)
        setDone(false)
        setStatus(items.length > 0 ? 'ready' : 'error')
        if (items.length === 0) setError('Keine Inhalte für diese Auswahl vorhanden.')
      })
      .catch((err) => {
        if (!alive) return
        setError(err?.message || 'Vorschau konnte nicht geladen werden.')
        setStatus('error')
      })
    return () => { alive = false }
  }, [mode, lemmaIds])

  const Game = pickGameComponent(mode)
  const currentLemma = lemmata[lemmaIndex] || null

  // No-Op-Submit: keine Submission, kein Scoring — nur lokal weiterschalten.
  function handleAdvance() {
    const totalRounds = roundCount(mode, currentLemma)
    if (mode === 'lueckenfueller' && roundIndex + 1 < totalRounds) {
      setRoundIndex((r) => r + 1)
      return
    }
    if (lemmaIndex + 1 < lemmata.length) {
      setLemmaIndex((i) => i + 1)
      setRoundIndex(0)
      return
    }
    setDone(true)
  }

  function restart() {
    setLemmaIndex(0)
    setRoundIndex(0)
    setDone(false)
  }

  const total = lemmata.length
  const totalRounds = roundCount(mode, currentLemma)

  return (
    <div
      className="classroom-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Vorschau der Schüleransicht"
      data-testid="classroom-setup-preview"
    >
      <div className="classroom-kiosk classroom-preview">
        <header className="classroom-kiosk__header classroom-preview__header">
          <button
            type="button"
            className="classroom-preview__back"
            onClick={onClose}
            aria-label="Vorschau schließen"
            data-testid="classroom-preview-close"
          >
            <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Schließen
          </button>
          <span className="classroom-kiosk__brand"><small>Vorschau</small></span>
        </header>

        <main className="classroom-kiosk__main">
          <p className="classroom-preview__banner" role="note">
            Vorschau — so sehen es deine Schüler:innen. Keine echte Sitzung,
            Eingaben werden nicht gewertet.
          </p>

          {status === 'loading' && (
            <p className="classroom-kiosk__hint" data-testid="classroom-preview-loading">
              Vorschau wird geladen …
            </p>
          )}

          {status === 'error' && (
            <p className="classroom-kiosk__hint classroom-kiosk__hint--error" data-testid="classroom-preview-error">
              {error || 'Vorschau nicht verfügbar.'}
            </p>
          )}

          {status === 'ready' && !done && currentLemma && Game && lemmaHasContent(mode, currentLemma) && (
            <>
              <p className="classroom-kiosk__hint" style={{ margin: '0 0 4px' }} data-testid="classroom-preview-progress">
                {total > 1 ? `Lemma ${lemmaIndex + 1} / ${total}` : 'Klassenraum'}
                {mode === 'lueckenfueller' && totalRounds > 1
                  ? ` · Runde ${roundIndex + 1} / ${totalRounds}`
                  : ''}
              </p>
              <Game
                key={`${lemmaIndex}:${roundIndex}`}
                lemma={currentLemma}
                prompt={gamePromptFor(mode, currentLemma, roundIndex)}
                onSubmit={handleAdvance}
                submitting={false}
              />
            </>
          )}

          {/* Eignungs-Hinweis: das gewählte Lemma hat keinen spielbaren Inhalt. */}
          {status === 'ready' && !done && currentLemma && Game && !lemmaHasContent(mode, currentLemma) && (
            <div style={{ textAlign: 'center', paddingTop: 8 }} data-testid="classroom-preview-no-content">
              <span className="classroom-kiosk__dropcap">!</span>
              <p className="classroom-kiosk__title" style={{ fontSize: '1.2rem' }}>
                {currentLemma.lemma || 'Dieses Lemma'} — kein Inhalt
              </p>
              <p className="classroom-kiosk__lead">
                {NO_CONTENT_HINT[mode] || 'Für diese Auswahl gibt es keinen spielbaren Inhalt.'}
              </p>
              {lemmaIndex + 1 < total ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setLemmaIndex((i) => i + 1); setRoundIndex(0) }}
                  data-testid="classroom-preview-skip"
                >
                  Nächstes Lemma ansehen →
                </button>
              ) : (
                <button type="button" className="btn-ghost" onClick={onClose}>
                  Zurück zum Setup
                </button>
              )}
            </div>
          )}

          {status === 'ready' && !done && currentLemma && !Game && (
            <p className="classroom-kiosk__hint classroom-kiosk__hint--error">
              Unbekannter Spielmodus „{mode || '—'}“.
            </p>
          )}

          {status === 'ready' && done && (
            <div style={{ textAlign: 'center', paddingTop: 16 }} data-testid="classroom-preview-done">
              <span className="classroom-kiosk__dropcap classroom-kiosk__dropcap--gold">✓</span>
              <p className="classroom-kiosk__title">Vorschau durchgespielt</p>
              <p className="classroom-kiosk__lead">
                Das war die Schüleransicht für deine Auswahl.
              </p>
              <button
                type="button"
                className="btn-primary btn-full"
                onClick={restart}
                data-testid="classroom-preview-restart"
              >
                Nochmal ansehen
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ marginTop: 6 }}
                onClick={onClose}
              >
                Zurück zum Setup
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
