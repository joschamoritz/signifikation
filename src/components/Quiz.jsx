import { useState, useMemo, useEffect } from 'react'
import { getRundInfo, getRoundOptions, calculateScore } from '../utils/gameLogic'
import { useBelege } from '../hooks/useBelege'
import BelegePanel from './BelegePanel'

// ── Haupt-Quiz (Runden 0–2) ───────────────────────────────────
export default function Quiz({ lemma, currentRound, onRoundComplete }) {
  const [selected, setSelected]   = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [showBelegHint, setShowBelegHint] = useState(
    () => !localStorage.getItem('sig_beleg_hint')
  )

  const rundInfo     = getRundInfo(lemma)
  const roundInfo    = rundInfo[currentRound]
  const roundKey     = roundInfo?.key
  const roundLabel   = roundInfo?.label ?? ''
  const relCode      = roundInfo?.relCode ?? ''
  const kollokatoren = (roundKey && lemma.runden[roundKey]) ?? []

  const { openBeleg, belegeCache, belegeLoading, loadBelege } = useBelege(lemma.lemma, relCode)

  const options = useMemo(() => getRoundOptions(kollokatoren), [kollokatoren])

  // Keine Daten für diese Runde → überspringen (0 Punkte)
  const shouldSkip = !kollokatoren.length && !!roundKey
  useEffect(() => {
    if (shouldSkip) onRoundComplete(0)
  }, [shouldSkip]) // eslint-disable-line

  if (shouldSkip) return null

  const roundScore = submitted ? calculateScore(selected, kollokatoren) : null

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

  const STATE_ICON = { correct: '✓', wrong: '✗', missed: '→' }

  function handleLoadBelege(collocate) {
    if (showBelegHint) {
      setShowBelegHint(false)
      localStorage.setItem('sig_beleg_hint', '1')
    }
    loadBelege(collocate)
  }

  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="quiz-lemma-word">{lemma.lemma}</h1>
        <div
          className="round-progress"
          role="img"
          aria-label={`Runde ${currentRound + 1} von 3, Bonusrunde folgt`}
        >
          {[0, 1, 2].map(i => (
            <span
              key={i}
              aria-hidden="true"
              className={`round-dot${i < currentRound ? ' done' : i === currentRound ? ' active' : ''}`}
            />
          ))}
          <span aria-hidden="true" className="round-dot round-dot--bonus" />
        </div>
        <p className="round-title">Runde {currentRound + 1} · {roundLabel}</p>
        <p className="quiz-instruction">
          Wähle die 3 stärksten Kollokate von <strong>{lemma.lemma}</strong>
        </p>
      </header>

      <div className="options-grid">
        {options.map((opt, i) => {
          const rank  = selectedRank(opt.wort)
          const state = getOptionState(opt.wort)
          const isActive = submitted && openBeleg === opt.wort
          return (
            <button
              key={opt.wort}
              className={`option${state ? ' ' + state : ''}${isActive ? ' option--beleg-active' : ''}`}
              style={{ animationDelay: submitted ? '0ms' : `${i * 35}ms` }}
              onClick={() => submitted ? handleLoadBelege(opt.wort) : toggleWord(opt.wort)}
            >
              {submitted && STATE_ICON[state] && (
                <span className="option-icon" aria-hidden="true">{STATE_ICON[state]}</span>
              )}
              {!submitted && rank && <span className="option-rank" aria-label={`Rang ${rank}`}>{rank}</span>}
              {opt.wort}
              {submitted && opt.log_dice != null && (
                <span className="logdice">{opt.log_dice}</span>
              )}
            </button>
          )
        })}
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
        <div className="round-feedback">
          <div className="round-feedback-score">
            <span className="round-score-display">+{roundScore}</span>
            <span className="round-score-label">
              {roundScore === 3 && 'Perfekt!'}
              {roundScore === 2 && 'Gut gemacht!'}
              {roundScore === 1 && 'Einen dabei'}
              {roundScore === 0 && 'Weiter üben'}
            </span>
          </div>
          <div className="round-feedback-answer">
            {kollokatoren
              .filter(k => k.rang <= 3)
              .sort((a, b) => a.rang - b.rang)
              .map(k => {
                const guessedRank = selectedRank(k.wort)
                const rankOk = guessedRank === k.rang
                return (
                  <span key={k.wort} className="feedback-word">
                    <span className={`feedback-rang ${rankOk ? 'feedback-rang--ok' : guessedRank ? 'feedback-rang--off' : 'feedback-rang--miss'}`}>
                      #{k.rang}
                    </span>
                    {k.wort}
                    <span className="logdice">{k.log_dice}</span>
                  </span>
                )
              })
            }
          </div>
        </div>
      )}

      <footer className="quiz-footer">
        {!submitted ? (
          <>
            <span className="select-count">{selected.length} / 3 gewählt</span>
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
            {currentRound < 2 ? 'Nächste Runde →' : 'Weiter →'}
          </button>
        )}
      </footer>
    </div>
  )
}
