import { useState, useMemo } from 'react'
import {
  getRundInfo,
  getRoundOptions,
  calculateScore,
} from '../utils/gameLogic'

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
        <div className="quiz-meta">
          <span className="bonus-tag">Bonus</span>
        </div>
        <div className="round-progress">
          {[0, 1, 2].map(i => <span key={i} className="round-dot done" />)}
          <span className="round-dot round-dot--bonus active" />
        </div>
        <h2 className="round-title">Bonus · Freier Punkt</h2>
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
  const isCorrect = submitted && selected === bonus.correct

  function optionClass(opt) {
    if (!submitted) return `bonus-option${selected === opt ? ' selected' : ''}`
    if (opt === bonus.correct) return 'bonus-option correct'
    if (opt === selected)      return 'bonus-option wrong'
    return 'bonus-option'
  }

  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <div className="quiz-meta">
          <span className="lemma-tag">{lemma.lemma}</span>
          <span className="bonus-tag">Bonus</span>
        </div>

        <div className="round-progress">
          {[0, 1, 2].map(i => (
            <span key={i} className="round-dot done" />
          ))}
          <span className="round-dot round-dot--bonus active" />
        </div>

        <h2 className="round-title">Bonus · {bonus.label}</h2>
        <p className="quiz-instruction">{bonus.question}</p>
      </header>

      <div className="bonus-options">
        {bonus.options.map(opt => (
          <button
            key={opt}
            className={optionClass(opt)}
            onClick={() => !submitted && setSelected(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

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

  const rundInfo     = getRundInfo(lemma)
  const roundKey     = rundInfo[currentRound].key
  const roundLabel   = rundInfo[currentRound].label
  const kollokatoren = lemma.runden[roundKey]

  const options    = useMemo(() => getRoundOptions(kollokatoren), []) // eslint-disable-line
  const roundScore = submitted ? calculateScore(selected, kollokatoren) : null

  function toggleWord(word) {
    if (submitted) return
    setSelected(prev =>
      prev.includes(word)
        ? prev.filter(w => w !== word)
        : prev.length < 3 ? [...prev, word] : prev
    )
  }

  function optionClass(word) {
    if (!submitted) return selected.includes(word) ? 'option selected' : 'option'
    const k          = kollokatoren.find(k => k.wort === word)
    const isSelected = selected.includes(word)
    const isTop3     = k && k.rang <= 3

    if (isSelected && isTop3)  return 'option correct'
    if (isSelected && !isTop3) return 'option wrong'
    if (!isSelected && isTop3) return 'option missed'
    return 'option'
  }

  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <div className="quiz-meta">
          <span className="lemma-tag">{lemma.lemma}</span>
        </div>

        <div className="round-progress">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={`round-dot${i < currentRound ? ' done' : i === currentRound ? ' active' : ''}`}
            />
          ))}
        </div>

        <h2 className="round-title">Runde {currentRound + 1} · {roundLabel}</h2>
        <p className="quiz-instruction">
          Wähle genau 3 Kollokate von <strong>{lemma.lemma}</strong>
        </p>
      </header>

      <div className="options-grid">
        {options.map(opt => (
          <button
            key={opt.wort}
            className={optionClass(opt.wort)}
            onClick={() => toggleWord(opt.wort)}
          >
            {opt.wort}
          </button>
        ))}
      </div>

      {submitted && (
        <div className="round-feedback">
          <div className="round-feedback-score">
            <span className="round-score-display">+{roundScore}</span>
            <span className="round-score-label">
              {roundScore === 3 && 'Perfekt!'}
              {roundScore === 2 && 'Gut gemacht!'}
              {roundScore === 1 && 'Fast!'}
              {roundScore === 0 && 'Weiter üben'}
            </span>
          </div>
          <div className="round-feedback-answer">
            <span className="feedback-label">Top-3: </span>
            {kollokatoren
              .filter(k => k.rang <= 3)
              .sort((a, b) => a.rang - b.rang)
              .map(k => (
                <span key={k.wort} className="feedback-word">{k.wort}</span>
              ))
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
