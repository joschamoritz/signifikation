import { useState, useRef, useEffect } from 'react'
import { getMedal } from '../utils/gameLogic'
import '../styles/lueckenfueller.css'

// ── Hilfsfunktion: Satz mit Lücke(n) rendern ──────────────
function SatzMitLuecke({ satzMitLuecke, submitted, kollokator, isCorrect }) {
  const parts = satzMitLuecke.split('_____')
  if (parts.length < 2) return <span>{satzMitLuecke}</span>
  return (
    <>
      {parts[0]}
      <span className={[
        'lf-blank',
        submitted ? (isCorrect ? 'lf-blank--correct' : 'lf-blank--wrong') : '',
      ].filter(Boolean).join(' ')}>
        {submitted ? kollokator : ''}
      </span>
      {parts[1]}
    </>
  )
}

// ── Double-Runde: Satz mit zuzuweisendem Wort ─────────────
function DoubleSatz({ sentence, assignedWord, isActive, submitted }) {
  const parts = sentence.satzMitLuecke.split('_____')
  if (parts.length < 2) return <span>{sentence.satzMitLuecke}</span>

  const correct = submitted && (assignedWord === sentence.kollokator || assignedWord === sentence.token)

  return (
    <>
      {parts[0]}
      <span className={[
        'lf-blank',
        isActive && !assignedWord ? 'lf-blank--active' : '',
        assignedWord && !submitted ? 'lf-blank--filled' : '',
        submitted ? (correct ? 'lf-blank--correct' : 'lf-blank--wrong') : '',
      ].filter(Boolean).join(' ')}>
        {submitted ? (sentence.token || sentence.kollokator) : (assignedWord || '')}
      </span>
      {parts[1]}
    </>
  )
}

const BackArrow = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
    <path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

// ── Ergebnisseite ─────────────────────────────────────────
function ResultsScreen({ data, scores, onBack }) {
  const maxPoints = data.reduce((s, r) => s + r.punkte, 0)
  const total  = scores.reduce((s, p) => s + p, 0)
  const medal  = getMedal(total, maxPoints)

  function renderRoundSummary(r, i) {
    const pts = scores[i] ?? 0

    if (r.type === 'double') {
      return (
        <div key={i} className="lf-result-round">
          <div className="lf-result-left">
            <span className="lf-result-badge">Doppellücke</span>
            {r.sentences.map((s, j) => (
              <span key={j} className="lf-result-satz">
                {s.satzMitLuecke.replace('_____', `[${s.kollokator}]`)}
              </span>
            ))}
          </div>
          <span className={`lf-result-pts${pts === 0 ? ' lf-result-pts--zero' : ''}`}>
            {pts > 0 ? `+${pts}` : '0'}
          </span>
        </div>
      )
    }

    if (r.type === 'free') {
      return (
        <div key={i} className="lf-result-round">
          <div className="lf-result-left">
            <span className="lf-result-badge">Freie Eingabe</span>
            <span className="lf-result-satz">
              {r.satzMitLuecke.replace('_____', `[${r.kollokator}]`)}
            </span>
            <span className={`lf-result-kollokator${pts > 0 ? ' lf-result-kollokator--correct' : ' lf-result-kollokator--wrong'}`}>
              {pts > 0 ? '✓' : '✗'} {r.kollokator}
            </span>
          </div>
          <span className={`lf-result-pts${pts === 0 ? ' lf-result-pts--zero' : ''}`}>
            {pts > 0 ? `+${pts}` : '0'}
          </span>
        </div>
      )
    }

    // type === 'choice'
    return (
      <div key={i} className="lf-result-round">
        <div className="lf-result-left">
          <span className="lf-result-satz">
            {r.satzMitLuecke.replace('_____', `[${r.kollokator}]`)}
          </span>
          <span className={`lf-result-kollokator${pts > 0 ? ' lf-result-kollokator--correct' : ' lf-result-kollokator--wrong'}`}>
            {pts > 0 ? '✓' : '✗'} {r.kollokator}
          </span>
        </div>
        <span className={`lf-result-pts${pts === 0 ? ' lf-result-pts--zero' : ''}`}>
          {pts > 0 ? `+${pts}` : '0'}
        </span>
      </div>
    )
  }

  return (
    <div className="screen lf-screen">
      <button className="back-btn" type="button" onClick={onBack} aria-label="Zurück zur Startseite"><BackArrow /></button>
      <header className="lf-header">
        <span className="quiz-game-badge">Lückenfüller</span>
        <div className="round-progress" aria-label={`Alle ${data.length} Runden abgeschlossen`}>
          {data.map((_, i) => <span key={i} className="round-dot done" />)}
        </div>
      </header>

      <div className="lf-results-rounds">
        {data.map((r, i) => renderRoundSummary(r, i))}
      </div>

      <div className="results-score-banner">
        <div className="results-score-row">
          <span className="results-score-num">{total}</span>
          <span className="results-score-max">/ {maxPoints}</span>
        </div>
        <p className="results-medal">{medal.emoji} {medal.label}</p>
      </div>
    </div>
  )
}

// ── Choice-Runde ──────────────────────────────────────────
function ChoiceRound({ round, roundIdx, totalRounds, onScore }) {
  const [selected,  setSelected]  = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [pts,       setPts]       = useState(0)

  const isCorrect = submitted && selected === round.kollokator

  function handleSubmit() {
    if (!selected || submitted) return
    const p = selected === round.kollokator ? round.punkte : 0
    setPts(p)
    setSubmitted(true)
  }

  function handleSelect(opt) {
    if (submitted) return
    setSelected(opt)
  }

  return (
    <>
      <div className="lf-satz-card">
        <p className="lf-satz-text">
          <SatzMitLuecke
            satzMitLuecke={round.satzMitLuecke}
            submitted={submitted}
            kollokator={round.token || round.kollokator}
            isCorrect={isCorrect}
          />
        </p>
        {submitted && <p className="lf-quelle">{round.quelle}</p>}
      </div>

      {submitted && (
        <div className={`lf-feedback ${isCorrect ? 'lf-feedback--correct' : 'lf-feedback--wrong'}`}>
          <span className="lf-feedback-icon">{isCorrect ? '✓' : '✗'}</span>
          <span className="lf-feedback-text">
            {isCorrect ? `Richtig! +${round.punkte}` : `Richtig wäre: ${round.kollokator}`}
          </span>
        </div>
      )}

      <div className="lf-options-grid">
        {round.optionen.map((opt) => {
          let cls = 'lf-option-btn'
          if (submitted) {
            if (opt === round.kollokator) cls += ' correct'
            else if (opt === selected)   cls += ' wrong'
            else                          cls += ' muted'
          } else if (opt === selected) {
            cls += ' selected'
          }
          return (
            <button
              key={opt}
              className={cls}
              onClick={() => submitted ? null : handleSelect(opt)}
              onDoubleClick={() => { if (!submitted && selected === opt) handleSubmit() }}
              disabled={submitted}
              aria-pressed={selected === opt && !submitted}
            >
              {opt}
            </button>
          )
        })}
      </div>

      <footer className="quiz-footer">
        {!submitted ? (
          <button className="quiz-cta" disabled={!selected} onClick={handleSubmit}>
            Auswerten<span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        ) : (
          <button className="quiz-cta" onClick={() => onScore(pts)}>
            {totalRounds - 1 === roundIdx ? 'Ergebnis ansehen' : 'Weiter'}
            <span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        )}
      </footer>
    </>
  )
}

// ── Double-Runde ──────────────────────────────────────────
function DoubleRound({ round, onScore }) {
  const [answers,     setAnswers]     = useState([null, null])
  const [submitted,   setSubmitted]   = useState(false)
  const [debouncing,  setDebouncing]  = useState(null) // verhindert Doppelklick-Fehler auf Mobile

  const bothFilled = answers[0] !== null && answers[1] !== null
  const activeSlot = answers[0] === null ? 0 : answers[1] === null ? 1 : null

  function handleOptionClick(opt) {
    if (submitted || debouncing === opt) return
    const assignedAt = answers.indexOf(opt)
    if (assignedAt !== -1) {
      // Zuweisung aufheben + kurzen Debounce setzen damit Doppeltap nicht sofort reassigned
      const next = [...answers]
      next[assignedAt] = null
      setAnswers(next)
      setDebouncing(opt)
      requestAnimationFrame(() => requestAnimationFrame(() => setDebouncing(null)))
      return
    }
    if (activeSlot === null) return
    const next = [...answers]
    next[activeSlot] = opt
    setAnswers(next)
  }

  const [pts, setPts] = useState(0)

  function handleSubmit() {
    if (!bothFilled || submitted) return
    const correctA = answers[0] === round.sentences[0].kollokator
    const correctB = answers[1] === round.sentences[1].kollokator
    const p = (correctA ? 1 : 0) + (correctB ? 1 : 0)
    setPts(p)
    setSubmitted(true)
  }

  return (
    <>
      <div className="lf-double-card">
        {round.sentences.map((s, i) => {
          const isActive    = activeSlot === i
          return (
            <div key={i} className={`lf-double-sentence${isActive && !answers[i] ? ' lf-double-sentence--active' : ''}`}>
              <span className="lf-double-label">Lücke {i + 1}</span>
              <p className="lf-satz-text">
                <DoubleSatz
                  sentence={s}
                  assignedWord={answers[i]}
                  isActive={isActive}
                  submitted={submitted}
                />
              </p>
              {submitted && <p className="lf-quelle">{s.quelle}</p>}
            </div>
          )
        })}
      </div>

      {submitted && (
        <div className={`lf-feedback ${answers[0] === round.sentences[0].kollokator && answers[1] === round.sentences[1].kollokator ? 'lf-feedback--correct' : 'lf-feedback--wrong'}`}>
          <span className="lf-feedback-text">
            {round.sentences.map((s, i) => (
              <span key={i} className="lf-double-result-line">
                {answers[i] === s.kollokator ? '✓' : '✗'} {s.kollokator}
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="lf-options-grid">
        {round.optionen.map((opt) => {
          const assignedAt = answers.indexOf(opt)
          let cls = 'lf-option-btn'
          if (submitted) {
            const isKoll = round.sentences.some(s => s.kollokator === opt)
            if (assignedAt !== -1) {
              const correct = answers[assignedAt] === round.sentences[assignedAt]?.kollokator
              cls += correct ? ' correct' : ' wrong'
            } else if (isKoll) {
              cls += ' correct'
            } else {
              cls += ' muted'
            }
          } else if (assignedAt !== -1) {
            cls += ` assigned assigned-${assignedAt}`
          }
          return (
            <button
              key={opt}
              className={cls}
              onClick={() => handleOptionClick(opt)}
              disabled={submitted}
              aria-pressed={!submitted && assignedAt !== -1 ? 'true' : 'false'}
            >
              {assignedAt !== -1 && !submitted && (
                <span className="lf-slot-badge">{assignedAt + 1}</span>
              )}
              {opt}
            </button>
          )
        })}
      </div>

      <footer className="quiz-footer">
        {!submitted ? (
          <button className="quiz-cta" disabled={!bothFilled} onClick={handleSubmit}>
            Auswerten<span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        ) : (
          <button className="quiz-cta" onClick={() => onScore(pts)}>
            Weiter<span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        )}
      </footer>
    </>
  )
}

// ── Free-Runde ────────────────────────────────────────────
function FreeRound({ round, onScore }) {
  const [input,     setInput]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pts,       setPts]       = useState(0)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function matchesFree(val, kollokator, token) {
    const v = val.toLowerCase()
    const k = kollokator.toLowerCase()
    const t = (token || '').toLowerCase()
    // Exakter Match oder startsWith-Toleranz für Flexionsformen. Die
    // Mindestlänge muss fuer BEIDE Seiten gelten: prueft man nur die Loesung
    // (k.length >= MIN), zaehlt jedes Praefix der Loesung — bei „treffen" waere
    // schon die Eingabe „t" richtig gewesen.
    const MIN = 4
    const near = (a, b) => a.length >= MIN && b.length >= MIN && (a.startsWith(b) || b.startsWith(a))
    return v === k || v === t || near(v, k) || near(v, t)
  }

  function handleSubmit() {
    if (!input.trim() || submitted) return
    const correct = matchesFree(input.trim(), round.kollokator, round.token)
    setPts(correct ? round.punkte : 0)
    setSubmitted(true)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  const isCorrect = submitted && matchesFree(input.trim(), round.kollokator, round.token)

  return (
    <>
      <div className={`lf-satz-card${submitted && isCorrect ? ' lf-satz-card--highlight' : ''}`}>
        <p className="lf-satz-text">
          <SatzMitLuecke
            satzMitLuecke={round.satzMitLuecke}
            submitted={submitted}
            kollokator={round.token || round.kollokator}
            isCorrect={isCorrect}
          />
        </p>
        {submitted && <p className="lf-quelle">{round.quelle}</p>}
      </div>

      {submitted && (
        <div className={`lf-feedback ${isCorrect ? 'lf-feedback--correct' : 'lf-feedback--wrong'}`}>
          <span className="lf-feedback-icon">{isCorrect ? '✓' : '✗'}</span>
          <span className="lf-feedback-text">
            {isCorrect ? `Richtig! +${round.punkte}` : `Richtig wäre: ${round.kollokator}`}
          </span>
        </div>
      )}

      {!submitted && (
        <div className="lf-free-wrap">
          <label htmlFor="lf-free-input" className="sr-only">Fehlenden Kollokator eingeben</label>
          <input
            id="lf-free-input"
            ref={inputRef}
            className="lf-free-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Wort eingeben …"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={submitted}
          />
        </div>
      )}

      <footer className="quiz-footer">
        {!submitted ? (
          <button className="quiz-cta" disabled={!input.trim()} onClick={handleSubmit}>
            Auswerten<span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        ) : (
          <button className="quiz-cta" onClick={() => onScore(pts)}>
            Ergebnis ansehen<span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        )}
      </footer>
    </>
  )
}

// ── Hauptkomponente ───────────────────────────────────────
export default function Lueckenfueller({
  data,
  lemmaName,
  onBack,
  onFinish,
  savedResult,
  initialProgress,
}) {
  const [phase,  setPhase]  = useState(savedResult ? 'results' : 'play')
  const [round,  setRound]  = useState(initialProgress?.round ?? 0)
  const [scores, setScores] = useState(initialProgress?.scores ?? [])

  // Wird an Unterrunden weitergegeben – speichert den aktuellen Spielstand beim Zurück-Klick
  function handleMidGameBack() {
    onBack({ round, scores })
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        data={data}
        scores={savedResult ? savedResult.scores : scores}
        onBack={() => onBack(null)}
      />
    )
  }

  const currentRound = data[round]
  const totalRounds  = data.length
  const isLastRound  = round === totalRounds - 1

  function handleScore(pts) {
    const newScores = [...scores, pts]
    setScores(newScores)
    if (isLastRound) {
      const total = newScores.reduce((s, p) => s + p, 0)
      onFinish({ score: total, scores: newScores })
      setPhase('results')
    } else {
      setRound(r => r + 1)
    }
  }

  const typeLabel = {
    choice: 'Auswahl',
    double: 'Doppellücke',
    free:   'Freie Eingabe',
  }[currentRound.type] ?? 'Auswahl'

  return (
    <div className="screen lf-screen">
      <button className="back-btn" type="button" onClick={handleMidGameBack} aria-label="Zurück zur Startseite"><BackArrow /></button>
      <header className="lf-header">
        <div className="lf-header-top">
          <span className="quiz-game-badge">Lückenfüller</span>
          <span className="lf-type-label">{typeLabel}</span>
        </div>
        <div className="round-progress" aria-label={`Runde ${round + 1} von ${totalRounds}`}>
          {Array.from({ length: totalRounds }, (_, i) => (
            <span
              key={i}
              className={`round-dot${i < round ? ' done' : ''}${i === round ? ' active' : ''}`}
            />
          ))}
        </div>
        <h1 className="quiz-lemma-word">{lemmaName}</h1>
      </header>

      {currentRound.type === 'choice' && (
        <ChoiceRound
          key={round}
          round={currentRound}
          roundIdx={round}
          totalRounds={totalRounds}
          onScore={handleScore}
        />
      )}

      {currentRound.type === 'double' && (
        <DoubleRound
          key={round}
          round={currentRound}
          onScore={handleScore}
        />
      )}

      {currentRound.type === 'free' && (
        <FreeRound
          key={round}
          round={currentRound}
          onScore={handleScore}
        />
      )}
    </div>
  )
}
