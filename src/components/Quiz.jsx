import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { getRoundOptions, calculateMixedScore, shuffle } from '../utils/gameLogic'
import { useBelege } from '../hooks/useBelege'
import BelegePanel from './BelegePanel'

// ── Haupt-Quiz (Einzelrunde, gemischte Top-3) ─────────────────
export default function Quiz({ lemma, currentRound, onRoundComplete, onBack }) {
  const [selected, setSelected]   = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [showBelegHint, setShowBelegHint] = useState(
    () => !localStorage.getItem('sig_beleg_hint')
  )

  const kollokatoren = lemma.runden?.kollokatoren ?? []

  const { openBeleg, belegeCache, belegeLoading, loadBelege } = useBelege(lemma.lemma, '')
  const wrapRef = useRef(null)

  const handleScroll = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const atEnd = rect.bottom <= window.innerHeight + 4
    el.classList.toggle('options-grid-wrap--scrolled-to-end', atEnd)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const options        = useMemo(() => getRoundOptions(kollokatoren), [kollokatoren])
  const displayOptions = useMemo(
    () => submitted
      ? [...options].sort((a, b) => (b.log_dice ?? 0) - (a.log_dice ?? 0))
      : options,
    [options, submitted]
  )

  // Keine Daten → überspringen (0 Punkte)
  const shouldSkip = !kollokatoren.length
  useEffect(() => {
    if (shouldSkip) onRoundComplete(0)
  }, [shouldSkip]) // eslint-disable-line

  if (shouldSkip) return null

  const roundScore = submitted ? calculateMixedScore(selected, kollokatoren) : null

  // ── Joker ────────────────────────────────────────────────────
  const [jokerVisible, setJokerVisible] = useState(false)
  const [jokerUsed,    setJokerUsed]    = useState(false)
  const [grayedWords,  setGrayedWords]  = useState(new Set())
  const jokerTimer = useRef(null)

  useEffect(() => {
    if (submitted || jokerUsed) return
    setJokerVisible(false)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 15000)
    return () => clearTimeout(jokerTimer.current)
  }, [currentRound, submitted, jokerUsed])

  function resetJokerTimer() {
    if (jokerUsed || submitted) return
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 15000)
  }

  function activateJoker() {
    if (jokerUsed || submitted) return
    setJokerUsed(true)
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    const wrong = options.filter(opt => {
      const k = kollokatoren.find(k => k.wort === opt.wort)
      return (!k || k.rang > 3) && !selected.includes(opt.wort)
    })
    const toGray = new Set(shuffle([...wrong]).slice(0, 3).map(o => o.wort))
    setGrayedWords(toGray)
  }

  function selectedRank(word) {
    const i = selected.indexOf(word)
    return i >= 0 ? i + 1 : null
  }

  function toggleWord(word) {
    if (submitted) return
    setSelected(prev =>
      prev.includes(word)
        ? prev.filter(w => w !== word)
        : prev.length < 3 ? [...prev, word] : prev
    )
  }

  function getOptionState(word) {
    if (!submitted) return selected.includes(word) ? 'selected' : ''
    const k = kollokatoren.find(k => k.wort === word)
    const isSelected = selected.includes(word)
    const isTop3 = k && k.rang <= 3
    if (isSelected && isTop3)  return 'correct'
    if (isSelected && !isTop3) return 'wrong'
    if (!isSelected && isTop3) return 'missed'
    return ''
  }

  const STATE_ICON  = { correct: '✓', wrong: '✗', missed: '→' }
  const STATE_LABEL = { correct: 'korrekt', wrong: 'falsch', missed: 'verpasst' }

  function handleLoadBelege(collocate) {
    if (showBelegHint) {
      setShowBelegHint(false)
      localStorage.setItem('sig_beleg_hint', '1')
    }
    loadBelege(collocate)
  }

  return (
    <div className="screen quiz-screen" onClick={resetJokerTimer}>
      {onBack && !submitted && (
        <button className="back-btn" onClick={onBack} aria-label="Zurück zur Wortauswahl">
          <span className="back-btn-chevron">‹</span>Zurück
        </button>
      )}
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="quiz-lemma-word">{lemma.lemma}</h1>
        <p id="quiz-instruction" className="quiz-instruction">
          Wähle die 3 stärksten Kollokationen von <strong>{lemma.lemma}</strong>
          {!submitted && !jokerUsed && jokerVisible && (
            <button className="joker-btn" onClick={e => { e.stopPropagation(); activateJoker() }} aria-label="Hinweis aktivieren" title="Hinweis"><em>i</em></button>
          )}
        </p>
        {options.length < 10 && (
          <p className="quiz-options-hint" aria-live="polite">
            <em>{options.length} Kollokationen verfügbar</em>
          </p>
        )}
      </header>

      <div ref={wrapRef} className="options-grid-wrap">
      <div className="options-grid" aria-describedby="quiz-instruction">
        {displayOptions.map((opt, i) => {
          const rank  = selectedRank(opt.wort)
          const state = getOptionState(opt.wort)
          const isActive = submitted && openBeleg === opt.wort

          const ariaLabel = submitted
            ? `${opt.wort} – ${STATE_LABEL[state] ?? ''}`
            : rank
              ? `${opt.wort} – Rang ${rank} gewählt`
              : opt.wort

          return (
            <button
              key={opt.wort}
              className={`option${state ? ' ' + state : ''}${isActive ? ' option--beleg-active' : ''}${!submitted && grayedWords.has(opt.wort) ? ' option--grayed' : ''}`}
              disabled={!submitted && grayedWords.has(opt.wort) || undefined}
              style={{ animationDelay: submitted ? '0ms' : `${i * 35}ms` }}
              onClick={() => submitted ? handleLoadBelege(opt.wort) : toggleWord(opt.wort)}
              aria-label={ariaLabel}
              aria-pressed={!submitted ? selected.includes(opt.wort) : undefined}
            >
              {submitted && STATE_ICON[state] && (
                <span className="option-icon" aria-hidden="true">{STATE_ICON[state]}</span>
              )}
              {!submitted && rank && <span className="option-rank" aria-hidden="true">{rank}</span>}
              {opt.wort}
              {submitted && opt.log_dice != null && (
                <span className="logdice" aria-hidden="true">{opt.log_dice}</span>
              )}
            </button>
          )
        })}
      </div>
      </div>

      {submitted && showBelegHint && (
        <button
          type="button"
          className="beleg-hint"
          onClick={() => { setShowBelegHint(false); localStorage.setItem('sig_beleg_hint', '1') }}
          aria-label="Tipp schließen: Klicke auf ein Wort, um Beispielsätze aus dem DWDS-Korpus zu sehen."
        >
          💡 Tipp: Klicke auf ein Wort, um Beispielsätze aus dem DWDS-Korpus zu sehen.
        </button>
      )}

      {submitted && openBeleg && (
        <BelegePanel
          lemma={lemma.lemma}
          collocate={openBeleg}
          data={belegeCache[openBeleg]}
          loading={belegeLoading}
        />
      )}

      {submitted && (
        <div className="round-feedback" aria-live="polite" aria-atomic="true">
          <div className="round-feedback-score">
            <span className="round-score-display">+{roundScore}</span>
            <span className="round-score-label">
              {(() => {
                const v = new Date().toISOString().slice(0,10).replace(/-/g,'')
                const seed = parseInt(v, 10) % 4
                const labelGroups = {
                  3: ['treffend','präzise','belegt','nachgewiesen'],
                  2: ['nahezu','weitgehend','annähernd','überwiegend'],
                  1: ['bedingt','partiell','vereinzelt','ansatzweise'],
                  0: ['nicht belegt','fraglich','abweichend','ungesichert'],
                }
                const cat = roundScore >= 9 ? 3 : roundScore >= 6 ? 2 : roundScore >= 3 ? 1 : 0
                return <em>{labelGroups[cat][seed]}</em>
              })()}
            </span>
          </div>
          <div className="round-feedback-answer">
            {/* Top-3: korrekte Wörter mit Rang und Punkten */}
            {kollokatoren
              .filter(k => k.rang <= 3)
              .sort((a, b) => a.rang - b.rang)
              .map(k => {
                const guessedRank = selectedRank(k.wort)
                const rankOk = guessedRank === k.rang
                const pts = guessedRank ? (rankOk ? 3 : 2) : null
                return (
                  <span key={k.wort} className="feedback-word">
                    <span className={`feedback-rang ${rankOk ? 'feedback-rang--ok' : guessedRank ? 'feedback-rang--off' : 'feedback-rang--miss'}`}>
                      #{k.rang}
                    </span>
                    {k.wort}
                    <span className="logdice">{k.log_dice}</span>
                    {pts !== null && <span className="feedback-pts">+{pts}</span>}
                  </span>
                )
              })
            }
            {/* Nahe-Treffer (Rang 4–5) die gewählt wurden */}
            {selected
              .map(word => kollokatoren.find(k => k.wort === word))
              .filter(k => k && k.rang >= 4 && k.rang <= 5)
              .map(k => (
                <span key={k.wort} className="feedback-word">
                  <span className="feedback-rang feedback-rang--off">#{k.rang}</span>
                  {k.wort}
                  <span className="logdice">{k.log_dice}</span>
                  <span className="feedback-pts">+1</span>
                </span>
              ))
            }
            {/* Bonus-Indikator */}
            {selected.length === 3 && selected.every(word => {
              const k = kollokatoren.find(k => k.wort === word)
              return k && k.rang <= 3
            }) && (
              <span className="feedback-word feedback-bonus">
                Alle Top-3 gewählt
                <span className="feedback-pts">+1</span>
              </span>
            )}
          </div>
        </div>
      )}

      <footer className="quiz-footer">
        {!submitted ? (
          <>
            <span className="select-count" aria-live="polite" aria-atomic="true">{selected.length} / 3 gewählt</span>
            <button
              className="btn-primary"
              disabled={selected.length !== 3}
              onClick={() => setSubmitted(true)}
            >
              Auswerten
            </button>
          </>
        ) : (
          <button
            className="btn-primary btn-full"
            onClick={() => onRoundComplete(roundScore)}
          >
            Weiter →
          </button>
        )}
      </footer>
    </div>
  )
}
