import { useState } from 'react'
import { getMedal } from '../utils/gameLogic'
import '../styles/lueckenfueller.css'

function SatzMitLuecke({ satzMitLuecke, submitted, kollokator }) {
  const parts = satzMitLuecke.split('_____')
  if (parts.length < 2) return <span>{satzMitLuecke}</span>
  return (
    <>
      {parts[0]}
      <span className={`lf-blank${submitted ? ' lf-blank--revealed' : ''}`}>
        {submitted ? kollokator : '_____'}
      </span>
      {parts[1]}
    </>
  )
}

export default function Lueckenfueller({ data, lemmaName, onBack, onFinish, savedResult }) {
  const [phase, setPhase] = useState(savedResult ? 'results' : 'play')
  const [round, setRound] = useState(0)
  const [selected, setSelected] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [scores, setScores] = useState([])

  const MAX_POINTS = 10

  if (phase === 'results') {
    const resultScores = savedResult ? savedResult.scores : scores
    const total = resultScores.reduce((s, p) => s + p, 0)
    const medal = getMedal(total, MAX_POINTS)

    return (
      <div className="screen lf-screen">
        <header className="lf-header">
          <span className="quiz-game-badge">Lückenfüller</span>
          <div className="round-progress" aria-label="Alle 3 Runden abgeschlossen">
            {[0, 1, 2].map(i => (
              <span key={i} className="round-dot done" />
            ))}
          </div>
          <h1 className="quiz-lemma-word">{lemmaName}</h1>
        </header>

        <div className="lf-results-rounds">
          {data.map((r, i) => {
            const pts = resultScores[i] ?? 0
            const correct = pts > 0
            return (
              <div key={i} className="lf-result-round">
                <div className="lf-result-left">
                  <span className="lf-result-satz">
                    {r.satzMitLuecke.replace('_____', `[${r.kollokator}]`)}
                  </span>
                  <span className={`lf-result-kollokator${correct ? ' lf-result-kollokator--correct' : ' lf-result-kollokator--wrong'}`}>
                    {correct ? '✓' : '✗'} {r.kollokator}
                    <span className="logdice" style={{ marginLeft: '6px' }}>{r.logDice}</span>
                  </span>
                </div>
                <span className={`lf-result-pts${pts === 0 ? ' lf-result-pts--zero' : ''}`}>
                  {pts > 0 ? `+${pts}` : '0'}
                </span>
              </div>
            )
          })}
        </div>

        <div className="results-score-banner">
          <div className="results-score-row">
            <span className="results-score-num">{total}</span>
            <span className="results-score-max">/ {MAX_POINTS}</span>
          </div>
          <p className="results-medal">{medal.emoji} {medal.label}</p>
        </div>

        <button className="btn-primary btn-full" onClick={onBack}>
          Zurück
        </button>
      </div>
    )
  }

  const currentRound = data[round]
  const isLastRound = round === data.length - 1

  function handleSelect(opt) {
    if (submitted) return
    setSelected(opt)
  }

  function handleSubmit() {
    if (!selected || submitted) return
    const pts = selected === currentRound.kollokator ? currentRound.punkte : 0
    setScores(prev => [...prev, pts])
    setSubmitted(true)
  }

  function handleNext() {
    if (isLastRound) {
      const finalScores = scores
      const total = finalScores.reduce((s, p) => s + p, 0)
      onFinish({ score: total, scores: finalScores })
      setPhase('results')
    } else {
      setRound(r => r + 1)
      setSelected(null)
      setSubmitted(false)
    }
  }

  const isCorrect = submitted && selected === currentRound.kollokator

  return (
    <div className="screen lf-screen">
      <header className="lf-header">
        <span className="quiz-game-badge">Lückenfüller</span>
        <div className="round-progress" aria-label={`Runde ${round + 1} von 3`}>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={`round-dot${i < round ? ' done' : ''}${i === round ? ' active' : ''}`}
            />
          ))}
        </div>
        <h1 className="quiz-lemma-word">{lemmaName}</h1>
      </header>

      <div className="lf-satz-card">
        <p>
          <SatzMitLuecke
            satzMitLuecke={currentRound.satzMitLuecke}
            submitted={submitted}
            kollokator={currentRound.kollokator}
          />
        </p>
        {submitted && <p className="lf-quelle">{currentRound.quelle}</p>}
      </div>

      <div className="options-grid-wrap">
        <div className="options-grid">
          {currentRound.optionen.map((opt, i) => {
            let cls = 'option'
            if (submitted) {
              if (opt === currentRound.kollokator) cls += ' correct'
              else if (opt === selected) cls += ' wrong'
            } else if (opt === selected) {
              cls += ' selected'
            }
            return (
              <button
                key={opt}
                className={cls}
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => handleSelect(opt)}
                disabled={submitted}
              >
                {submitted && opt === currentRound.kollokator && (
                  <span className="option-icon">✓</span>
                )}
                {submitted && opt === selected && opt !== currentRound.kollokator && (
                  <span className="option-icon">✗</span>
                )}
                {opt}
              </button>
            )
          })}
        </div>
      </div>

      {submitted && (
        <div className="round-feedback">
          <div className="round-feedback-score">
            <span className="round-score-display">
              {isCorrect ? `+${currentRound.punkte}` : '+0'}
            </span>
            <span className="round-score-label">
              {isCorrect
                ? 'Richtig!'
                : `Richtig wäre: ${currentRound.kollokator}`}
            </span>
          </div>
        </div>
      )}

      <footer className="quiz-footer">
        {!submitted ? (
          <>
            <button className="btn-secondary" onClick={onBack}>Abbruch</button>
            <button
              className="btn-primary"
              disabled={!selected}
              onClick={handleSubmit}
            >
              Auswerten
            </button>
          </>
        ) : (
          <button className="btn-primary btn-full" onClick={handleNext}>
            {isLastRound ? 'Ergebnis ansehen' : 'Weiter →'}
          </button>
        )}
      </footer>
    </div>
  )
}
