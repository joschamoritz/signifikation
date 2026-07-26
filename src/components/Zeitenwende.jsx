import { useState, useEffect, useCallback, useRef } from 'react'
import BelegeSatz from './BelegeSatz'
import { lsGet, lsParse } from '../utils/storage'
import { getMedal } from '../utils/gameLogic'
import { hapticLight, hapticMedium } from '../utils/haptics'
import { API } from '../config'
import { apiGet } from '../api/client'
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
function ZWResults({ lemma, words, answers, onBack, ipa }) {
  const score     = answers.filter((a, i) => a === words[i].periode).length
  const medal     = getMedal(score, TOTAL)
  const zwHistory = lsParse(lsGet('sig_zw_history'), []).slice(0, 14).reverse()

  return (
    <div className="screen zw-screen zw-screen--results">
      <button type="button" className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>

      <header className="zw-header zw-header--results">
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

      {/* Score-Block fix unter Header */}
      <div className="zw-results-score zw-results-score--top">
        <div className="zw-results-medal" aria-hidden="true">{medal.emoji}</div>
        <div className="zw-results-score-text">
          <div className="zw-results-points">{score} / {TOTAL} <span className="zw-results-unit">Punkte</span></div>
          <div className="zw-results-label">{medal.label}</div>
        </div>
      </div>

      {zwHistory.length > 0 && (
        <div className="history-strip history-strip--top">
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

      {/* Scrollbare Wörter-Liste */}
      <div className="zw-results-scroll">
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
      </div>

      {/* Sticky Footer */}
      <div className="zw-results-footer">
        <button type="button" className="btn-primary btn-full" onClick={onBack}>
          Zur Startseite
        </button>
      </div>
    </div>
  )
}

/** Hauptkomponente */
export default function Zeitenwende({
  data,
  onBack,
  onFinish,
  savedResult = null,
  initialProgress = null,
  // Phase-5/T-5.6: Props fuer den Classroom-Pfad — Defaults bleiben Singleplayer.
  // Classroom rendert eigene Variante (ClassroomGameZeitenwende.jsx).
  mode = 'single',
  onSubmit,
  onProgress,
  disableProgress = false,
  hideHeader = false,
}) {
  const { lemma, words, ipa = '', definitionen = [] } = data

  // Klassenraum-Pilot: dieselbe Swipe-Engine + Karten-Optik wie Singleplayer,
  // ABER ohne lokales Scoring/Feedback/Belege/Ergebnis (Server-autoritativ,
  // Auflösung erst durch die Lehrkraft). Der Swipe sammelt nur pre/post und
  // schiebt nach dem letzten Wort EIN onSubmit({ answers }) hoch.
  const isClassroom = mode === 'classroom'
  const total = isClassroom ? (Array.isArray(words) ? words.length : 0) : TOTAL
  const submittedRef = useRef(false)

  const [round,   setRound]   = useState(initialProgress?.round ?? 0)
  const [answers, setAnswers] = useState(initialProgress?.answers ?? savedResult?.answers ?? [])
  const [feedback, setFeedback] = useState(null)   // null | 'correct' | 'wrong'
  const [chosen,   setChosen]   = useState(null)    // 'pre' | 'post'
  const [phase,    setPhase]    = useState(savedResult ? 'results' : 'play')
  const [belege,   setBelege]   = useState(null)

  // Swipe-State. dragX lebt bewusst NICHT im React-State: setState pro
  // touchmove rendert die komplette Komponente pro Frame neu (Jank auf
  // Low-End-Android — Classroom-Zielgruppe, F-M3). Stattdessen schreibt
  // ein rAF-gedrosselter Handler Transform/Opacity direkt aufs DOM.
  const [swiping, setSwiping] = useState(false)
  const touchStartX   = useRef(null)
  const touchCurrentX = useRef(null)
  const mouseDownRef  = useRef(false)
  const dragXRef      = useRef(0)
  const rafRef        = useRef(null)
  const cardRef       = useRef(null)
  const preLabelRef   = useRef(null)
  const postLabelRef  = useRef(null)

  const applyDrag = useCallback((dx) => {
    dragXRef.current = dx
    if (rafRef.current !== null) return // ein DOM-Write pro Frame reicht
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = cardRef.current
      if (!el) return
      const x = dragXRef.current
      const progress = Math.min(1, Math.abs(x) / SWIPE_THRESHOLD)
      el.style.transform  = `translateX(${x}px) rotate(${(x * 0.04).toFixed(2)}deg)`
      el.style.transition = 'none'
      el.style.animation  = 'none'
      el.style.boxShadow  = `${(-x * 0.1).toFixed(1)}px 8px ${(16 + Math.abs(x) * 0.25).toFixed(1)}px rgba(0,0,0,${(0.08 + progress * 0.12).toFixed(3)})`
      if (preLabelRef.current)  preLabelRef.current.style.opacity  = String(Math.min(1, Math.max(0, (-x - 20) / 50)))
      if (postLabelRef.current) postLabelRef.current.style.opacity = String(Math.min(1, Math.max(0, (x - 20) / 50)))
    })
  }, [])

  const resetDrag = useCallback(() => {
    dragXRef.current = 0
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const el = cardRef.current
    if (el) {
      el.style.transform = ''
      el.style.transition = ''
      el.style.animation = ''
      el.style.boxShadow = ''
    }
    if (preLabelRef.current)  preLabelRef.current.style.opacity = '0'
    if (postLabelRef.current) postLabelRef.current.style.opacity = '0'
  }, [])

  // Swipe-State bei neuem Wort zurücksetzen
  useEffect(() => {
    resetDrag()
    setSwiping(false)
  }, [round, resetDrag])

  // Belege laden sobald Feedback erscheint. AbortController + cancelled-Flag:
  // bei schnellem Weiterswipen darf eine spaete Antwort nicht die Belege
  // eines anderen Wortes setzen (Review 2026-06-10).
  useEffect(() => {
    if (feedback === null) { setBelege(null); return }
    setBelege(null)
    let cancelled = false
    const controller = new AbortController()
    const word = encodeURIComponent(words[round]?.wort ?? '')
    const lem  = encodeURIComponent(lemma)
    apiGet(`${API}/belege?collocate=${word}&lemma=${lem}`, { signal: controller.signal })
      .then(d  => { if (!cancelled) setBelege(Array.isArray(d) ? d : []) })
      .catch(() => { if (!cancelled) setBelege([]) })
    return () => { cancelled = true; controller.abort() }
  }, [feedback, round, words, lemma])

  const advanceRound = useCallback(() => {
    if (feedback === null || chosen === null) return
    const nextAnswers = [...answers, chosen]
    setFeedback(null)
    setChosen(null)
    setBelege(null)
    if (round + 1 >= total) {
      const score = nextAnswers.filter((a, i) => a === words[i].periode).length
      setAnswers(nextAnswers)
      setPhase('results')
      onFinish?.({ score, answers: nextAnswers })
    } else {
      setAnswers(nextAnswers)
      setRound(r => r + 1)
    }
  }, [feedback, chosen, answers, round, words, total, onFinish])

  const choose = useCallback((periode) => {
    if (isClassroom) {
      // Kein Sofort-Feedback: Antwort sammeln, direkt weiter; nach dem letzten
      // Wort genau einmal an den Server (onSubmit). Kein periode-Vergleich
      // (die Lösung liegt nicht auf dem Client).
      if (submittedRef.current) return
      const nextAnswers = [...answers, periode]
      if (round + 1 >= total) {
        submittedRef.current = true
        setAnswers(nextAnswers)
        onSubmit?.({ answers: nextAnswers })
      } else {
        setAnswers(nextAnswers)
        setRound(r => r + 1)
        // Entwurf für Reload-Wiederherstellung (7.2) spiegeln.
        onProgress?.({ round: round + 1, answers: nextAnswers })
      }
      return
    }
    if (feedback !== null) return
    const correct = words[round].periode === periode
    setChosen(periode)
    setFeedback(correct ? 'correct' : 'wrong')
  }, [isClassroom, answers, round, total, onSubmit, onProgress, feedback, words])

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
    if (Math.abs(raw) >= SWIPE_THRESHOLD && Math.abs(dragXRef.current) < SWIPE_THRESHOLD * 0.85) {
      hapticLight()
    }
    applyDrag(dx)
  }, [feedback, applyDrag])

  // Gemeinsame Drag-End-Logik (Touch + Maus)
  const finishDrag = useCallback(() => {
    if (touchStartX.current === null) return
    const totalDx = (touchCurrentX.current ?? touchStartX.current) - touchStartX.current
    touchStartX.current   = null
    touchCurrentX.current = null

    if (feedback !== null) {
      if (Math.abs(totalDx) > SWIPE_FEEDBACK_THRESHOLD) advanceRound()
      return
    }

    if (totalDx < -SWIPE_THRESHOLD) {
      hapticMedium()
      resetDrag()
      choose('pre')
    } else if (totalDx > SWIPE_THRESHOLD) {
      hapticMedium()
      resetDrag()
      choose('post')
    } else {
      setSwiping(false)
      resetDrag()
    }
  }, [feedback, advanceRound, choose, resetDrag])

  const handleTouchEnd = useCallback(() => finishDrag(), [finishDrag])

  // Maus-Handler für Desktop-Wischen
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    mouseDownRef.current  = true
    touchStartX.current   = e.clientX
    touchCurrentX.current = e.clientX
    if (feedback === null) setSwiping(true)
  }, [feedback])

  const handleMouseMove = useCallback((e) => {
    if (!mouseDownRef.current || touchStartX.current === null) return
    touchCurrentX.current = e.clientX
    if (feedback !== null) return
    const raw = e.clientX - touchStartX.current
    const dx  = raw * 0.85
    if (Math.abs(raw) >= SWIPE_THRESHOLD && Math.abs(dragXRef.current) < SWIPE_THRESHOLD * 0.85) {
      hapticLight()
    }
    applyDrag(dx)
  }, [feedback, applyDrag])

  // Globales mouseup: fängt Releases auch außerhalb der Karte ab
  useEffect(() => {
    const onMouseUp = () => {
      if (!mouseDownRef.current) return
      mouseDownRef.current = false
      finishDrag()
    }
    window.addEventListener('mouseup', onMouseUp)
    return () => window.removeEventListener('mouseup', onMouseUp)
  }, [finishDrag])

  // is-swiping nach Entscheidung entfernen (nach dem Snap, nicht davor)
  useEffect(() => {
    if (feedback !== null && swiping) setSwiping(false)
  }, [feedback, swiping])

  if (phase === 'results') {
    return <ZWResults lemma={lemma} words={words} answers={answers} onBack={() => onBack(null)} ipa={ipa} definitionen={definitionen} />
  }

  const currentWord   = words[round]
  const progressPct   = (round / total) * 100

  // Visuelle Swipe-Effekte schreibt applyDrag() framestabil direkt aufs DOM.

  const cardClass = [
    'zw-word-card',
    swiping                ? 'is-swiping'            : '',
    feedback === 'correct' ? 'zw-word-card--correct'  : '',
    feedback === 'wrong'   ? 'zw-word-card--wrong'    : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="screen zw-screen">
      {!isClassroom && (
        <button type="button" className="back-btn" onClick={() => onBack({ round, answers })} aria-label="Zurück zur Startseite"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
      )}

      {!hideHeader && (
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
          <p className="zw-subtitle">Wann war diese Verbindung mit <em>{lemma}</em> gebräuchlicher?</p>
        </header>
      )}

      {/* Fortschritt */}
      {!disableProgress && (
        <div className="zw-progress" role="progressbar" aria-valuenow={round + 1} aria-valuemin={1} aria-valuemax={total} aria-valuetext={`Runde ${round + 1} von ${total}`}>
          <div className="zw-progress-bar">
            <div className="zw-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="zw-progress-count" aria-label={`Runde ${round + 1} von ${total}`}>
            {round + 1} / {total}
          </span>
        </div>
      )}

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {`Runde ${round + 1} von ${total}: ${currentWord.wort}`}
      </div>

      {/* Karten-Bereich */}
      <div className="zw-card-area">
        {/* Deck-Karten im Hintergrund (Tinder-Stapel-Effekt, nur vor Feedback) */}
        {feedback === null && <div className="zw-deck-card zw-deck-card--back2" aria-hidden="true" />}
        {feedback === null && <div className="zw-deck-card zw-deck-card--back1" aria-hidden="true" />}

        {/* Aktive Wortkarte */}
        <div
          key={round}
          ref={cardRef}
          className={cardClass}
          aria-label={`Kollokator: ${currentWord.wort}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
        >
          {/* Richtungs-Indikatoren (Stempel-Stil); Opacity setzt applyDrag() */}
          <span
            ref={preLabelRef}
            className="zw-swipe-label zw-swipe-label--pre"
            style={{ opacity: 0 }}
            aria-hidden="true"
          >HISTORISCH</span>
          <span
            ref={postLabelRef}
            className="zw-swipe-label zw-swipe-label--post"
            style={{ opacity: 0 }}
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
                  <li key={i} className="zw-beleg-item">
                    <BelegeSatz tokens={b.tokens} />
                    <p className="beleg-quelle">{b.quelle}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Weiter-Button (nur während Feedback) */}
      {feedback !== null && (
        <footer className="quiz-footer">
          <button
            type="button"
            className="quiz-cta"
            onClick={advanceRound}
            aria-label={round + 1 >= total ? 'Ergebnis anzeigen' : 'Nächstes Wort'}
          >
            {round + 1 >= total ? 'Ergebnis anzeigen' : 'Weiter'}
            <span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        </footer>
      )}

      {/* Entscheidungs-Buttons – nur im Spielmodus, im Feedback-Modus übernimmt der Weiter-Button */}
      {feedback === null && (
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
      )}

      {feedback === null && (
        <p className="zw-key-hint" aria-hidden="true">← Wischen oder Klicken →</p>
      )}
    </div>
  )
}
