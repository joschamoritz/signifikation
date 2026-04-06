import { useState, useEffect, useCallback } from 'react'
import { lsGet, lsParse } from '../utils/storage'
import '../styles/zeitenwende.css'

const TOTAL = 10
const API   = import.meta.env.VITE_API_URL ?? ''

/** Berechnet Medal basierend auf Punktzahl */
function getMedal(score) {
  if (score === 10) return { emoji: '🥇', label: 'Perfekt' }
  if (score >= 8)  return { emoji: '🥈', label: 'Sehr gut' }
  if (score >= 6)  return { emoji: '🥉', label: 'Gut' }
  if (score >= 4)  return { emoji: '📖', label: 'Solide' }
  return { emoji: '📚', label: 'Weiter üben' }
}

function PeriodChip({ periode }) {
  return (
    <span className={`zw-period-chip zw-period-chip--${periode}`}>
      {periode === 'pre' ? '← vor 2000' : 'nach 2000 →'}
    </span>
  )
}

/** Ergebnisansicht */
function ZWResults({ lemma, words, answers, onBack }) {
  const score   = answers.filter((a, i) => a === words[i].periode).length
  const medal   = getMedal(score)
  const zwHistory = lsParse(lsGet('sig_zw_history'), []).slice(0, 14).reverse()

  return (
    <div className="screen zw-screen">
      <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
        <span className="back-btn-chevron">‹</span>Zurück
      </button>

      <header className="zw-header">
        <span className="zw-badge">Zeitenwende</span>
        <div className="zw-lemma">{lemma}</div>
      </header>

      <div className="zw-results">
        <div className="zw-results-score">
          <div className="zw-results-medal" aria-hidden="true">{medal.emoji}</div>
          <div className="zw-results-points">{score} / {TOTAL}</div>
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

        <button className="btn-primary btn-full" onClick={onBack}>
          Zur Startseite
        </button>
      </div>
    </div>
  )
}

/** Hauptkomponente */
export default function Zeitenwende({ data, onBack, onFinish, savedResult = null }) {
  const { lemma, words } = data

  const [round,     setRound]     = useState(0)
  const [answers,   setAnswers]   = useState(savedResult?.answers ?? [])
  const [feedback,  setFeedback]  = useState(null)   // null | 'correct' | 'wrong'
  const [chosen,    setChosen]    = useState(null)    // 'pre' | 'post'
  const [phase,     setPhase]     = useState(savedResult ? 'results' : 'play')
  const [belege,    setBelege]    = useState(null)    // null = lädt | [] = leer/fehler | [...] = Ergebnisse

  // Belege laden sobald Feedback erscheint
  useEffect(() => {
    if (feedback === null) { setBelege(null); return }
    setBelege(null)
    const word  = encodeURIComponent(words[round]?.wort ?? '')
    const lem   = encodeURIComponent(lemma)
    fetch(`${API}/api/v1/belege?collocate=${word}&lemma=${lem}`)
      .then(r => r.ok ? r.json() : [])
      .then(d  => setBelege(Array.isArray(d) ? d : []))
      .catch(() => setBelege([]))
  }, [feedback]) // eslint-disable-line

  // Weiter-Funktion (manuell vom User ausgelöst)
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

  // Tastatur-Support (← = pre, → = post; Enter/Space = Weiter)
  const handleKey = useCallback((e) => {
    if (phase !== 'play') return
    if (feedback !== null) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceRound() }
      return
    }
    if (e.key === 'ArrowLeft')  choose('pre')
    if (e.key === 'ArrowRight') choose('post')
  }, [phase, feedback, advanceRound]) // eslint-disable-line

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  function choose(periode) {
    if (feedback !== null) return
    const correct = words[round].periode === periode
    setChosen(periode)
    setFeedback(correct ? 'correct' : 'wrong')
    // kein setTimeout — User klickt manuell auf „Weiter"
  }

  if (phase === 'results') {
    return <ZWResults lemma={lemma} words={words} answers={answers} onBack={onBack} />
  }

  const currentWord  = words[round]
  const progressPct  = (round / TOTAL) * 100
  const cardClass    = [
    'zw-word-card',
    feedback === 'correct' ? 'zw-word-card--correct' : '',
    feedback === 'wrong'   ? 'zw-word-card--wrong'   : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="screen zw-screen">
      <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite">
        <span className="back-btn-chevron">‹</span>Zurück
      </button>

      <header className="zw-header">
        <span className="zw-badge">Zeitenwende</span>
        <div className="zw-lemma">{lemma}</div>
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

      {/* Wort-Karte */}
      <div className="zw-card-area">
        <div
          key={round}  /* key erzwingt Re-Mount → Animation bei jedem neuen Wort */
          className={cardClass}
          aria-live="polite"
          aria-label={`Kollokat: ${currentWord.wort}`}
        >
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
          ? 'Enter / Leertaste → Weiter'
          : '← Vor 2000 \u00a0·\u00a0 Nach 2000 →'}
      </p>
    </div>
  )
}
