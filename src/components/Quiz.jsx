import { useState, useMemo, useEffect } from 'react'
import {
  getRundInfo,
  getRoundOptions,
  calculateScore,
} from '../utils/gameLogic'
import { API_BASE } from '../config'
import BelegeSatz from './BelegeSatz'

// ── Freier Bonuspunkt (kein Wortprofil verfügbar) ─────────────
const FREE_BONUS_TEXTS = [
  {
    quote: 'You shall know a word by the company it keeps.',
    author: 'J. R. Firth (1957)',
    text: 'Das DWDS-Wortprofil hat für diese Relation leider keine ausreichenden Belege geliefert. Da das Schweigen des Korpus kein Urteil über das Wort ist, bekommst du den Bonuspunkt.',
  },
  {
    quote: 'La langue est un système où tout se tient.',
    author: 'Ferdinand de Saussure',
    text: 'Manchmal hält sich ein Wort so gut im System, dass keine Relation es statistisch fassen kann. Das DWDS schweigt – der Bonuspunkt spricht.',
  },
  {
    quote: null,
    text: 'Das Wortprofil ist hier unvollständig – ein seltener Fall von statistischer Einsamkeit. In der Korpuslinguistik wären das Kandidaten für eine manuelle Annotation. Der Punkt gehört trotzdem dir.',
  },
]

function FreeBonusRound({ onComplete }) {
  const msg = FREE_BONUS_TEXTS[Math.floor(Math.random() * FREE_BONUS_TEXTS.length)]
  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <div className="round-progress">
          {[0, 1, 2].map(i => <span key={i} className="round-dot done" />)}
          <span className="round-dot round-dot--bonus active" />
        </div>
        <p className="round-title"><span className="bonus-tag">Bonus</span> · Freier Punkt</p>
      </header>

      <div className="free-bonus-card">
        {msg.quote && (
          <blockquote className="free-bonus-quote">
            <p>„{msg.quote}"</p>
            <footer>— {msg.author}</footer>
          </blockquote>
        )}
        <p className="free-bonus-text">{msg.text}</p>
        <div className="round-feedback">
          <div className="round-feedback-score">
            <span className="round-score-display">+1</span>
            <span className="round-score-label">Bonuspunkt</span>
          </div>
        </div>
      </div>

      <footer className="quiz-footer">
        <button className="btn-primary btn-full" onClick={() => onComplete(1)}>
          Ergebnis →
        </button>
      </footer>
    </div>
  )
}

// ── Bonus-Runde ───────────────────────────────────────────────
function BonusRound({ bonus, lemma, onComplete }) {
  const [selected, setSelected]   = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [openBeleg,     setOpenBeleg]     = useState(null)
  const [belegeCache,   setBelegeCache]   = useState({})
  const [belegeLoading, setBelegeLoading] = useState(false)
  const isCorrect = submitted && selected === bonus.correct

  function optionClass(opt) {
    if (!submitted) return `bonus-option${selected === opt ? ' selected' : ''}`
    const isActive = submitted && openBeleg === opt
    if (opt === bonus.correct) return `bonus-option correct${isActive ? ' option--beleg-active' : ''}`
    if (opt === selected)      return `bonus-option wrong${isActive ? ' option--beleg-active' : ''}`
    return `bonus-option${isActive ? ' option--beleg-active' : ''}`
  }

  async function loadBelege(opt) {
    if (openBeleg === opt) { setOpenBeleg(null); return }
    if (belegeCache[opt] !== undefined) { setOpenBeleg(opt); return }
    setOpenBeleg(opt)
    setBelegeLoading(true)
    try {
      const r = await fetch(
        `${API_BASE}/api/belege?collocate=${encodeURIComponent(opt)}&lemma=${encodeURIComponent(lemma.lemma)}&rel=`
      )
      const data = await r.json()
      setBelegeCache(prev => ({ ...prev, [opt]: Array.isArray(data) ? data : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [opt]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="quiz-lemma-word">{lemma.lemma}</h1>
        <div className="round-progress">
          {[0, 1, 2].map(i => (
            <span key={i} className="round-dot done" />
          ))}
          <span className="round-dot round-dot--bonus active" />
        </div>
        <p className="round-title"><span className="bonus-tag">Bonus</span> · {bonus.label}</p>
        <p className="quiz-instruction">{bonus.question}</p>
      </header>

      <div className="bonus-options">
        {bonus.options.map((opt, i) => (
          <button
            key={opt}
            className={optionClass(opt)}
            style={{ animationDelay: submitted ? '0ms' : `${i * 80}ms` }}
            onClick={() => submitted ? loadBelege(opt) : setSelected(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      {submitted && openBeleg && (
        <div className="belege-panel">
          <p className="belege-panel-title">
            Belege: <em>{lemma.lemma}</em> + <em>{openBeleg}</em>
          </p>
          {belegeLoading && belegeCache[openBeleg] === undefined ? (
            <p className="belege-status">Lade Belege …</p>
          ) : belegeCache[openBeleg]?.length ? (
            belegeCache[openBeleg].map((b, bi) => (
              <div key={bi} className="beleg-item">
                <BelegeSatz tokens={b.tokens} />
                <p className="beleg-quelle">{b.quelle}</p>
              </div>
            ))
          ) : (
            <p className="belege-status">Keine Belege gefunden.</p>
          )}
        </div>
      )}

      {submitted && (
        <div className="round-feedback">
          <div className="round-feedback-score">
            <span className="round-score-display">{isCorrect ? '+1' : '+0'}</span>
            <span className="round-score-label">
              {isCorrect ? 'Richtig!' : 'Leider falsch'}
            </span>
          </div>
          {!isCorrect && (
            <div className="round-feedback-answer">
              <span className="feedback-label">Lösung: </span>
              <span className="feedback-word">{bonus.correct}</span>
            </div>
          )}
        </div>
      )}

      <footer className="quiz-footer">
        {!submitted ? (
          <>
            <span className="select-count">{selected ? '1 / 1 gewählt' : '0 / 1 gewählt'}</span>
            <button
              className="btn-primary"
              disabled={!selected}
              onClick={() => setSubmitted(true)}
            >
              Auswerten
            </button>
          </>
        ) : (
          <button className="btn-primary btn-full" onClick={() => onComplete(isCorrect ? 1 : 0)}>
            Ergebnis →
          </button>
        )}
      </footer>
    </div>
  )
}

// ── Haupt-Quiz ────────────────────────────────────────────────
export default function Quiz({ lemma, currentRound, bonusQuestion, onRoundComplete }) {
  // Bonus-Runde
  if (currentRound === 3 && bonusQuestion) {
    if (bonusQuestion.skipped) {
      return <FreeBonusRound onComplete={onRoundComplete} />
    }
    return <BonusRound bonus={bonusQuestion} lemma={lemma} onComplete={onRoundComplete} />
  }

  const [selected, setSelected]   = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [openBeleg,     setOpenBeleg]     = useState(null)
  const [belegeCache,   setBelegeCache]   = useState({})
  const [belegeLoading, setBelegeLoading] = useState(false)
  const [showBelegHint, setShowBelegHint] = useState(
    () => !localStorage.getItem('sig_beleg_hint')
  )

  const rundInfo     = getRundInfo(lemma)
  const roundInfo    = rundInfo[currentRound]
  const roundKey     = roundInfo?.key
  const roundLabel   = roundInfo?.label ?? ''
  const kollokatoren = (roundKey && lemma.runden[roundKey]) ?? []

  const options = useMemo(() => getRoundOptions(kollokatoren), []) // eslint-disable-line

  // Keine Daten für diese Runde → einmalig überspringen (0 Punkte)
  const shouldSkip = !kollokatoren.length && !!roundKey
  useEffect(() => {
    if (shouldSkip) onRoundComplete(0)
  }, [shouldSkip]) // eslint-disable-line

  if (shouldSkip) return null
  const roundScore = submitted ? calculateScore(selected, kollokatoren) : null

  // Rang des gewählten Wortes (Position im selected-Array, 1-basiert)
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

  // 'correct' | 'wrong' | 'missed' | 'selected' | ''
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

  async function loadBelege(collocate) {
    if (showBelegHint) {
      setShowBelegHint(false)
      localStorage.setItem('sig_beleg_hint', '1')
    }
    if (openBeleg === collocate) { setOpenBeleg(null); return }
    if (belegeCache[collocate] !== undefined) { setOpenBeleg(collocate); return }
    setOpenBeleg(collocate)
    setBelegeLoading(true)
    try {
      const r = await fetch(
        `${API_BASE}/api/belege?collocate=${encodeURIComponent(collocate)}&lemma=${encodeURIComponent(lemma.lemma)}&rel=${roundInfo?.relCode || ''}`
      )
      const data = await r.json()
      setBelegeCache(prev => ({ ...prev, [collocate]: Array.isArray(data) ? data : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [collocate]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="quiz-lemma-word">{lemma.lemma}</h1>
        <div className="round-progress">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={`round-dot${i < currentRound ? ' done' : i === currentRound ? ' active' : ''}`}
            />
          ))}
          <span className="round-dot round-dot--bonus" />
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
              onClick={() => submitted ? loadBelege(opt.wort) : toggleWord(opt.wort)}
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
        <div className="beleg-hint" onClick={() => { setShowBelegHint(false); localStorage.setItem('sig_beleg_hint', '1') }}>
          💡 Tipp: Klicke auf ein Wort, um Beispielsätze aus dem DWDS-Korpus zu sehen.
        </div>
      )}

      {submitted && openBeleg && (
        <div className="belege-panel">
          <p className="belege-panel-title">
            Belege: <em>{lemma.lemma}</em> + <em>{openBeleg}</em>
          </p>
          {belegeLoading && belegeCache[openBeleg] === undefined ? (
            <p className="belege-status">Lade Belege …</p>
          ) : belegeCache[openBeleg]?.length ? (
            belegeCache[openBeleg].map((b, bi) => (
              <div key={bi} className="beleg-item">
                <BelegeSatz tokens={b.tokens} />
                <p className="beleg-quelle">{b.quelle}</p>
              </div>
            ))
          ) : (
            <p className="belege-status">Keine Belege gefunden.</p>
          )}
        </div>
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
