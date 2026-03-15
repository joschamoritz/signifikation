import { useState, useCallback, useEffect, Suspense, lazy, useRef } from 'react'
import { API_BASE } from './config'
import Home from './components/Home'
import LemmaSelection from './components/LemmaSelection'
import Quiz from './components/Quiz'
import Results from './components/Results'
import ErrorBoundary from './components/ErrorBoundary'
import { getMedal, getDailyMedal } from './utils/gameLogic'

const Zeitreise = lazy(() => import('./components/Zeitreise'))

function todayKey() {
  const d = new Date()
  return `sig_${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function todayZRKey() {
  const d = new Date()
  return `sig_zr_${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getPlayedToday() {
  const raw = localStorage.getItem(todayKey())
  if (!raw) return []
  const val = JSON.parse(raw)
  return Array.isArray(val) ? val : []
}

function getZRToday() {
  const raw = localStorage.getItem(todayZRKey())
  return raw ? JSON.parse(raw) : null
}

function saveToHistory(date, medal, total, maxTotal) {
  const history = JSON.parse(localStorage.getItem('sig_history') || '[]')
  const idx = history.findIndex(h => h.date === date)
  const entry = { date, medal, total, maxTotal }
  if (idx >= 0) history[idx] = entry
  else history.unshift(entry)
  localStorage.setItem('sig_history', JSON.stringify(history.slice(0, 365)))
}

function savePlayedGame(lemmaId, lemmaName, total, medal, lemmataLength) {
  const played = getPlayedToday()
  const idx    = played.findIndex(p => p.id === lemmaId)
  const entry  = { id: lemmaId, lemma: lemmaName, total, medal }
  if (idx >= 0) played[idx] = entry
  else played.push(entry)
  localStorage.setItem(todayKey(), JSON.stringify(played))

  if (lemmataLength && played.length >= lemmataLength) {
    const dailyTotal = played.reduce((s, g) => s + g.total, 0)
    const dailyMedal = getDailyMedal(dailyTotal)
    saveToHistory(todayDateStr(), dailyMedal.label, dailyTotal, played.length * 10)
  }
}

export default function App() {
  const [lemmata, setLemmata]   = useState(null)
  const [apiError, setApiError] = useState(null)
  const [zeitreise, setZeitreise] = useState(null)   // DiaCollo data for today

  const [phase, setPhase]            = useState('home')
  const [selectedLemma, setSelected] = useState(null)
  const [currentRound, setRound]     = useState(0)
  const [roundScores, setScores]     = useState([])
  const [bonusQuestion, setBonusQ]   = useState(null)

  const [zrPlayed, setZrPlayed] = useState(() => getZRToday())
  const appRef = useRef(null)

  // Fokus bei Screen-Wechsel an Anfang der neuen Seite setzen
  useEffect(() => {
    appRef.current?.focus()
  }, [phase])

  useEffect(() => {
    fetch(`${API_BASE}/api/heute`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then(setLemmata)
      .catch(err => setApiError(err.message))
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/zeitreise`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setZeitreise(data) })
      .catch(() => {}) // Zeitreise ist optional
  }, [])

  // Ergebnis in localStorage speichern (Kollokationen)
  useEffect(() => {
    if (phase !== 'results' || !selectedLemma || roundScores.length === 0) return
    const total = roundScores.reduce((a, b) => a + b, 0)
    const medal = getMedal(total).label
    savePlayedGame(selectedLemma.id, selectedLemma.lemma, total, medal, lemmata?.length)
  }, [phase])

  const handleLemmaSelect = useCallback((lemma) => {
    setSelected(lemma)
    setRound(0)
    setScores([])
    setBonusQ(null)
    setPhase('quiz')
  }, [])

  const handleRoundComplete = useCallback((score) => {
    setScores(prev => {
      const next = [...prev, score]
      if (next.length === 3) {
        fetch(`${API_BASE}/api/bonus?id=${selectedLemma?.id}`)
          .then(r => r.json())
          .then(bonus => {
            if (bonus && bonus.options) {
              setBonusQ(bonus)
            } else {
              setBonusQ({ skipped: true })
            }
            setRound(3)
          })
          .catch(() => { setBonusQ({ skipped: true }); setRound(3) })
      } else if (next.length === 4) {
        setPhase('results')
      } else {
        setRound(r => r + 1)
      }
      return next
    })
  }, [selectedLemma])

  const handleRestart = useCallback(() => {
    setSelected(null)
    setRound(0)
    setScores([])
    setBonusQ(null)
    setPhase('home')
  }, [])

  // Zeitreise Ergebnis speichern
  const handleZeitreiseFinish = useCallback((score) => {
    if (!zeitreise) return
    const medal = getMedal(score).label
    const entry = { lemma: zeitreise.lemma, total: score, medal }
    localStorage.setItem(todayZRKey(), JSON.stringify(entry))
    setZrPlayed(entry)
  }, [zeitreise])

  const playedGames = getPlayedToday()
  const playedIds   = playedGames.map(g => g.id)
  const allPlayed   = lemmata && lemmata.every(l => playedIds.includes(l.id))

  return (
    <ErrorBoundary>
    <div className="app" ref={appRef} tabIndex={-1} style={{ outline: 'none' }}>
      {phase === 'home' && (
        <Home
          onStart={() => setPhase(lemmata && !apiError ? 'selection' : 'home')}
          loading={!lemmata && !apiError}
          error={apiError}
          playedGames={playedGames}
          allPlayed={!!allPlayed}
          zeitreise={zeitreise}
          zrPlayed={zrPlayed}
          onPlayZeitreise={() => setPhase('zeitreise')}
        />
      )}
      {phase === 'selection' && lemmata && (
        <LemmaSelection
          lemmata={lemmata}
          playedIds={playedIds}
          onSelect={handleLemmaSelect}
          onBack={() => setPhase('home')}
        />
      )}
      {phase === 'quiz' && selectedLemma && (
        <Quiz
          key={currentRound}
          lemma={selectedLemma}
          currentRound={currentRound}
          bonusQuestion={bonusQuestion}
          onRoundComplete={handleRoundComplete}
        />
      )}
      {phase === 'results' && selectedLemma && (
        <Results
          lemma={selectedLemma}
          roundScores={roundScores}
          onRestart={handleRestart}
          onToSelection={() => setPhase('selection')}
        />
      )}
      {phase === 'zeitreise' && zeitreise && (
        <Suspense fallback={<div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p style={{ color: 'var(--muted)' }}>Lade …</p></div>}>
          <Zeitreise
            data={zeitreise}
            onBack={() => setPhase('home')}
            onFinish={handleZeitreiseFinish}
          />
        </Suspense>
      )}
    </div>
    </ErrorBoundary>
  )
}
