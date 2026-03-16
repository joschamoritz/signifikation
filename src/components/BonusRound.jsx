import { useState } from 'react'
import { useBelege } from '../hooks/useBelege'
import BelegePanel from './BelegePanel'

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

export function FreeBonusRound({ onComplete }) {
  const msg = FREE_BONUS_TEXTS[Math.floor(Math.random() * FREE_BONUS_TEXTS.length)]
  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <div className="round-progress" role="img" aria-label="Bonusrunde, alle 3 Hauptrunden abgeschlossen">
          {[0, 1, 2].map(i => <span key={i} aria-hidden="true" className="round-dot done" />)}
          <span aria-hidden="true" className="round-dot round-dot--bonus active" />
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
export function BonusRound({ bonus, lemma, onComplete }) {
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const { openBeleg, belegeCache, belegeLoading, loadBelege } = useBelege(lemma.lemma)
  const isCorrect = submitted && selected === bonus.correct

  function optionClass(opt) {
    if (!submitted) return `bonus-option${selected === opt ? ' selected' : ''}`
    const isActive = openBeleg === opt
    if (opt === bonus.correct) return `bonus-option correct${isActive ? ' option--beleg-active' : ''}`
    if (opt === selected)      return `bonus-option wrong${isActive ? ' option--beleg-active' : ''}`
    return `bonus-option${isActive ? ' option--beleg-active' : ''}`
  }

  return (
    <div className="screen quiz-screen">
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="quiz-lemma-word">{lemma.lemma}</h1>
        <div className="round-progress" role="img" aria-label="Bonusrunde, alle 3 Hauptrunden abgeschlossen">
          {[0, 1, 2].map(i => <span key={i} aria-hidden="true" className="round-dot done" />)}
          <span aria-hidden="true" className="round-dot round-dot--bonus active" />
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
            <button className="btn-primary" disabled={!selected} onClick={() => setSubmitted(true)}>
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
