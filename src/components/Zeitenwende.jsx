import { useState, useEffect, useCallback, useRef } from 'react'
import { lsGet, lsParse } from '../utils/storage'
import { getMedal } from '../utils/gameLogic'
import { API } from '../config'
import '../styles/zeitenwende.css'

const TOTAL                   = 10
const SWIPE_THRESHOLD         = 80   // px bis Entscheidung ausgelöst wird
const SWIPE_FEEDBACK_THRESHOLD = 40  // px Wischen im Feedback-Modus → Weiter

function PeriodChip({ periode }) {
  return (
    <span className={`zw-period-chip zw-period-chip--${periode}`}>
      {periode === 'pre' ? '← vor 2000' : 'nach 2000 →'}
    </span>
  )
}

/** Ergebnisansicht */
function ZWResults({ lemma, words, answers, onBack, ipa, definitionen }) {
  const score     = answers.filter((a, i) => a === words[i].periode).length
  const medal     = getMedal(score, TOTAL)
  const zwHistory = lsParse(lsGet('sig_zw_history'), []).slice(0, 14).reverse()

  return (
    <div className="screen zw-screen">
      <button type="button" className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
        <span className="back-btn-chevron">‹</span>Zurück
      </button>

      <header className="zw-header">
        <span className="zw-badge">Zeitenwende</span>
        <div className="dict-entry-header">
          <div className="zw-lemma">{lemma}</div>
          {ipa && (
            <div className="dict-entry-meta">
              <span className="lautschrift" aria-label={`Aussprache: [${ipa}]`}>[{ipa}]</span>
            </div>
          )}
          {ipa && <hr className="dict-entry-rule" aria-hidden="true" />}
        </div>
      </header>

      <div className="zw-results">
        <div className="zw-results-score">
          <div className="zw-results-medal" aria-hidden="true">{medal.emoji}</div>
          <div className="zw-results-points">{score} / {TOTAL} <span className="zw-results-unit">Punkte</span></div>
          <div className="zw-results-label">{medal.label}</div>
        </div>

        <div className="zw-results-list" role="list" aria-label="Ergebnisse">
          {words.map((w, i) => {
            const correct = answers[i] === w.periode
            return (
              <div
                key={w.wort}
                role="listitem"
                className={`zw-result-row zw-result-row--${correct ? 'correct' : 'wrong'}`}
              >
                <span className="zw-result-icon" aria-hidden="true">{correct ? '✓' : '✗'}</span>
                <span className="zw-result-word">{w.wort}</span>
                <PeriodChip periode={w.periode} />
              </div>
            )
          })}
        </div>

        {zwHistory.length > 0 && (
          <div className="history-strip">
            <span className="history-label">Dein Verlauf · Zeitenwende</span>
            <div className="history-emojis" role="list" aria-label="Verlauf Zeitenwende">
              {zwHistory.map((h, i) => (
                <span key={i} role="listitem" className="history-emoji"
                      title={`${h.date}: ${h.medal}`} aria-label={`${h.date}: ${h.medal}`}>
                  {h.emoji}
                </span>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="btn-primary btn-full" onClick={onBack}>
          Zur Startseite
        </button>
      </div>
    </div>
  )
}

/** Hauptkomponente */
export default function Zeitenwende({ data, onBack, onFinish, savedResult = null }) {
  const { lemma, words, ipa = '', definitionen = [] } = data

  const [round,   setRound]   = useState(0)
  const [answers, setAnswers] = useState(savedResult?.answers ?? [])
  const [feedback, setFeedback] = useState(null)   // null | 'correct' | 'wrong'
  const [chosen,   setChosen]   = useState(null)    // 'pre' | 'post'
  const [phase,    setPhase]    = useState(savedResult ? 'results' : 'play')
  const [belege,   setBelege]   = useState(null)

  // Swipe-State
  const [dragX,   setDragX]   = useState(0)
  const [swiping, setSwiping] = useState(false)
  const touchStartX   = useRef(null)
  const touchCurrentX = useRef(null)

  // Swipe-State bei neuem Wort zurücksetzen
  useEffect(() => {
    setDragX(0)
    setSwiping(false)
  }, [round])

  // Belege laden sobald Feedback erscheint
  useEffect(() => {
    if (feedback === null) { setBelege(null); return }
    setBelege(null)
    const word = encodeURIComponent(words[round]?.wort ?? '')
    const lem  = encodeURIComponent(lemma)
    fetch(`${API}/belege?collocate=${word}&lemma=${lem}`)
      .then(r => r.ok ? r.json() : [])
      .then(d  => setBelege(Array.isArray(d) ? d : []))
      .catch(() => setBelege([]))
  }, [feedback]) // eslint-disable-line

  const advanceRound = useCallback(() => {
    if (feedback === null || chosen === null) return
    const nextAnswers = [...answers, chosen]
    setFeedback(null)
    setChosen(null)
    setBelege(null)
    if (round + 1 >= TOTAL) {
      const score = nextAnswers.filter((a, i) => a === words[i].periode).length
      setAnswers(nextAnswers)
      setPhase('results')
      onFinish?.({ score, answers: nextAnswers })
    } else {
      setAnswers(nextAnswers)
      setRound(r => r + 1)
    }
  }, [feedback, chosen, answers, round, words, onFinish])

  const choose = useCallback((periode) => {
    if (feedback !== null) return
    const correct = words[round].periode === periode
    setChosen(periode)
    setFeedback(correct ? 'correct' : 'wrong')
  }, [feedback, words, round])

  // Tastatur-Support (← = pre, → = post; Enter/Space/Pfeile = Weiter)
  const handleKey = useCallback((e) => {
    if (phase !== 'play') return
    if (feedback !== null) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); advanceRound()
      }
      return
    }
    if (e.key === 'ArrowLeft')  choose('pre')
    if (e.key === 'ArrowRight') choose('post')
  }, [phase, feedback, advanceRound, choose])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Touch-Handler
  const handleTouchStart = useCallback((e) => {
    touchStartX.current   = e.touches[0].clientX
    touchCurrentX.current = e.touches[0].clientX
    if (feedback === null) setSwiping(true)
  }, [feedback])

  const handleTouchMove = useCallback((e) => {
    if (touchStartX.current === null) return
    touchCurrentX.current = e.touches[0].clientX
    if (feedback !== null) return
    const raw = e.touches[0].clientX - touchStartX.current
    const dx  = raw * 0.85 // Widerstandsgefühl
    // Haptik genau beim Einrasten der Schwelle
    if (Math.abs(raw) >= SWIPE_THRESHOLD && Math.abs(dragX) < SWIPE_THRESHOLD * 0.85) {
      navigator.vibrate?.(12)
    }
    setDragX(dx)
  }, [feedback, dragX])

  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null) return
    const totalDx = (touchCurrentX.current ?? touchStartX.current) - touchStartX.current
    touchStartX.current   = null
    touchCurrentX.current = null

    if (feedback !== null) {
      // Im Feedback-Modus: jedes Wischen → Weiter
      if (Math.abs(totalDx) > SWIPE_FEEDBACK_THRESHOLD) advanceRound()
      return
    }

    setSwiping(false)
    setDragX(0)

    if (totalDx < -SWIPE_THRESHOLD) {
      navigator.vibrate?.([8, 30, 8])
      choose('pre')
    } else if (totalDx > SWIPE_THRESHOLD) {
      navigator.vibrate?.([8, 30, 8])
      choose('post')
    }
  }, [feedback, advanceRound, choose])

  if (phase === 'results') {
    return <ZWResults lemma={lemma} words={words} answers={answers} onBack={onBack} ipa={ipa} definitionen={definitionen} />
  }

  const currentWord   = words[round]
  const progressPct   = (round / TOTAL) * 100

  // Swipe-Berechnungen für visuelle Effekte
  const swipeProgress = swiping ? Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD) : 0
  const preOpacity    = swiping ? Math.min(1, Math.max(0, (-dragX - 20) / 50)) : 0
  const postOpacity   = swiping ? Math.min(1, Math.max(0, (dragX  - 20) / 50)) : 0
  const cardStyle     = swiping ? {
    transform:  `translateX(${dragX}px) rotate(${(dragX * 0.04).toFixed(2)}deg)`,
    transition: 'none',
    animation:  'none',
    boxShadow:  `${(-dragX * 0.1).toFixed(1)}px 8px ${(16 + Math.abs(dragX) * 0.25).toFixed(1)}px rgba(0,0,0,${(0.08 + swipeProgress * 0.12).toFixed(3)})`,
  } : {}

  const cardClass = [
    'zw-word-card',
    swiping                ? 'is-swiping'            : '',
    feedback === 'correct' ? 'zw-word-card--correct'  : '',
    feedback === 'wrong'   ? 'zw-word-card--wrong'    : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="screen zw-screen">
      <button type="button" className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
        <span className="back-btn-chevron">‹</span>Zurück
      </button>

      <header className="zw-header">
        <span className="zw-badge">Zeitenwende</span>
        <div className="dict-entry-header">
          <div className="zw-lemma">{lemma}</div>
          {(ipa || definitionen.length > 0) && (
            <div className="dict-entry-meta">
              {ipa && <span className="lautschrift" aria-label={`Aussprache: [${ipa}]`}>[{ipa}]</span>}
            </div>
          )}
          {definitionen.length > 0 && (
            <p className="zw-definition">{definitionen[0]}</p>
          )}
          {(ipa || definitionen.length > 0) && <hr className="dict-entry-rule" aria-hidden="true" />}
        </div>
        <p className="zw-subtitle">Wann war dieses Kollokat von <em>{lemma}</em> gebräuchlicher?</p>
      </header>

      {/* Fortschritt */}
      <div className="zw-progress" role="progressbar" aria-valuenow={round} aria-valuemin={0} aria-valuemax={TOTAL}>
        <div className="zw-progress-bar">
          <div className="zw-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <span className="zw-progress-count" aria-label={`Runde ${round + 1} von ${TOTAL}`}>
          {round + 1} / {TOTAL}
        </span>
      </div>

      {/* Karten-Bereich */}
      <div className="zw-card-area">
        {/* Deck-Karten im Hintergrund (Tinder-Stapel-Effekt) */}
        <div className="zw-deck-card zw-deck-card--back2" aria-hidden="true" />
        <div className="zw-deck-card zw-deck-card--back1" aria-hidden="true" />

        {/* Aktive Wortkarte */}
        <div
          key={round}
          className={cardClass}
          style={cardStyle}
          aria-live="polite"
          aria-label={`Kollokat: ${currentWord.wort}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Richtungs-Indikatoren (Stempel-Stil) */}
          <span
            className="zw-swipe-label zw-swipe-label--pre"
            style={{ opacity: preOpacity }}
            aria-hidden="true"
          >HISTORISCH</span>
          <span
            className="zw-swipe-label zw-swipe-label--post"
            style={{ opacity: postOpacity }}
            aria-hidden="true"
          >MODERN</span>
          {currentWord.wort}
        </div>

        <div
          className={[
            'zw-feedback-label',
            feedback === 'correct' ? 'zw-feedback-label--correct' : '',
            feedback === 'wrong'   ? 'zw-feedback-label--wrong'   : '',
            feedback === null      ? 'zw-feedback-label--empty'   : '',
          ].filter(Boolean).join(' ')}
          aria-live="polite"
        >
          {feedback === 'correct' && '✓ Richtig'}
          {feedback === 'wrong'   && `✗ War ${currentWord.periode === 'pre' ? 'vor' : 'nach'} 2000`}
        </div>

        {/* Belege (nur während Feedback) */}
        {feedback !== null && (
          <div className="zw-belege" aria-live="polite">
            {belege === null && (
              <p className="zw-belege-status">Belege werden geladen…</p>
            )}
            {belege !== null && belege.length === 0 && (
              <p className="zw-belege-status">Keine Belege verfügbar</p>
            )}
            {belege !== null && belege.length > 0 && (
              <ul className="zw-belege-list" aria-label="Korpusbelege">
                {belege.slice(0, 3).map((b, i) => (
                  <li key={i} className="zw-beleg-item">{b.text ?? b}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Weiter-Button (nur während Feedback) */}
      {feedback !== null && (
        <button
          type="button"
          className="zw-weiter-btn"
          onClick={advanceRound}
          aria-label={round + 1 >= TOTAL ? 'Ergebnis anzeigen' : 'Nächstes Wort'}
        >
          {round + 1 >= TOTAL ? 'Ergebnis anzeigen' : 'Weiter'} →
        </button>
      )}

      {/* Entscheidungs-Buttons */}
      <div className="zw-choices">
        <button
          type="button"
          className={[
            'zw-choice-btn',
            'zw-choice-btn--pre',
            chosen === 'pre' ? 'zw-choice-btn--selected-pre' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => choose('pre')}
          disabled={feedback !== null}
          aria-label="Vor 2000"
        >
          <span className="zw-choice-arrow" aria-hidden="true">←</span>
          <span className="zw-choice-label">Vor 2000</span>
        </button>

        <button
          type="button"
          className={[
            'zw-choice-btn',
            'zw-choice-btn--post',
            chosen === 'post' ? 'zw-choice-btn--selected-post' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => choose('post')}
          disabled={feedback !== null}
          aria-label="Nach 2000"
        >
          <span className="zw-choice-arrow" aria-hidden="true">→</span>
          <span className="zw-choice-label">Nach 2000</span>
        </button>
      </div>

      <p className="zw-key-hint" aria-hidden="true">
        {feedback !== null
          ? 'Wischen oder Enter → Weiter'
          : '← Wischen oder Klicken →'}
      </p>
    </div>
  )
}
