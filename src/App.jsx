import { useState, useCallback, useEffect, Suspense, lazy, useRef } from 'react'
import { API_BASE } from './config'
import Home from './components/Home'
import LemmaSelection from './components/LemmaSelection'
import Quiz from './components/Quiz'
import { BonusRound, FreeBonusRound } from './components/BonusRound'
import Results from './components/Results'
import ErrorBoundary from './components/ErrorBoundary'
import { getMedal, getDailyMedal } from './utils/gameLogic'

const Zeitreise = lazy(() => import('./components/Zeitreise'))

// ── localStorage-Schlüssel aus Server-Datum (verhindert Zeitzonen-Mismatch) ──
function makeKeys(datum) {
  // datum = "MM-DD" vom Server (Europe/Berlin), z.B. "03-16"
  return {
    todayKey:   `sig_${datum}`,
    todayZRKey: `sig_zr_${datum}`,
    dateStr:    `2026-${datum}`,   // für History (YYYY-MM-DD)
  }
}

function getPlayedToday(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return []
  const val = JSON.parse(raw)
  return Array.isArray(val) ? val : []
}

function getZRToday(key) {
  const raw = localStorage.getItem(key)
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

function savePlayedGame(keys, lemmaId, lemmaName, total, medal, lemmataLength) {
  const played = getPlayedToday(keys.todayKey)
  const idx    = played.findIndex(p => p.id === lemmaId)
  const entry  = { id: lemmaId, lemma: lemmaName, total, medal }
  if (idx >= 0) played[idx] = entry
  else played.push(entry)
  localStorage.setItem(keys.todayKey, JSON.stringify(played))

  // History nur schreiben wenn alle Wörter gespielt → Streak erscheint am selben Tag
  if (lemmataLength && played.length >= lemmataLength) {
    const dailyTotal = played.reduce((s, g) => s + g.total, 0)
    const dailyMedal = getDailyMedal(dailyTotal)
    saveToHistory(keys.dateStr, dailyMedal.label, dailyTotal, played.length * 10)
  }
}

export default function App() {
  const [lemmata, setLemmata]   = useState(null)
  const [apiError, setApiError] = useState(null)
  const [zeitreise, setZeitreise] = useState(null)
  const [serverDatum, setServerDatum] = useState(null)  // "MM-DD" vom Server

  const [phase, setPhase]         = useState('home')
  const [selectedLemma, setSelected] = useState(null)
  const [currentRound, setRound]  = useState(0)
  const [roundScores, setScores]  = useState([])
  const [bonusQuestion, setBonusQ] = useState(null)

  const appRef = useRef(null)

  // Schlüssel aus Server-Datum ableiten (oder Fallback auf lokales Datum)
  const keys = serverDatum
    ? makeKeys(serverDatum)
    : makeKeys(`${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`)

  const [zrPlayed, setZrPlayed] = useState(() => getZRToday(`sig_zr_${
    `${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`
  }`))

  // Fokus bei Screen-Wechsel
  useEffect(() => { appRef.current?.focus() }, [phase])

  // Lemmata + Server-Datum laden
  useEffect(() => {
    fetch(`${API_BASE}/api/heute`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then(({ datum, lemmata }) => {
        setServerDatum(datum)
        setLemmata(lemmata)
        // ZR-Key jetzt mit echtem Server-Datum prüfen
        setZrPlayed(getZRToday(`sig_zr_${datum}`))
      })
      .catch(err => setApiError(err.message))
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/api/zeitreise`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setZeitreise(data) })
      .catch(() => {})
  }, [])

  // Ergebnis in localStorage speichern (Kollokationen)
  useEffect(() => {
    if (phase !== 'results' || !selectedLemma || roundScores.length === 0) return
    const total = roundScores.reduce((a, b) => a + b, 0)
    const medal = getMedal(total).label
    savePlayedGame(keys, selectedLemma.id, selectedLemma.lemma, total, medal, lemmata?.length)
  }, [phase, selectedLemma, roundScores, lemmata]) // eslint-disable-line

  const handleLemmaSelect = useCallback((lemma) => {
    setSelected(lemma)
    setRound(0)
    setScores([])
    setBonusQ(null)
    setPhase('quiz')
  }, [])

  // Bonus-Fetch sauber in useEffect statt im State-Updater
  const [fetchBonus, setFetchBonus] = useState(false)
  useEffect(() => {
    if (!fetchBonus || !selectedLemma) return
    setFetchBonus(false)
    fetch(`${API_BASE}/api/bonus?id=${selectedLemma.id}`)
      .then(r => r.json())
      .then(bonus => {
        setBonusQ(bonus?.options ? bonus : { skipped: true })
        setRound(3)
      })
      .catch(() => { setBonusQ({ skipped: true }); setRound(3) })
  }, [fetchBonus, selectedLemma])

  const handleRoundComplete = useCallback((score) => {
    setScores(prev => {
      const next = [...prev, score]
      if (next.length === 3) setFetchBonus(true)
      else if (next.length === 4) setPhase('results')
      else setRound(r => r + 1)
      return next
    })
  }, [])

  const handleRestart = useCallback(() => {
    setSelected(null)
    setRound(0)
    setScores([])
    setBonusQ(null)
    setPhase('home')
  }, [])

  const handleZeitreiseFinish = useCallback((score) => {
    if (!zeitreise) return
    const medal = getMedal(score).label
    const entry = { lemma: zeitreise.lemma, total: score, medal }
    localStorage.setItem(keys.todayZRKey, JSON.stringify(entry))
    setZrPlayed(entry)
  }, [zeitreise, keys.todayZRKey])

  const playedGames = getPlayedToday(keys.todayKey)
  const playedIds   = playedGames.map(g => g.id)
  const allPlayed   = lemmata?.length > 0 && lemmata.every(l => playedIds.includes(l.id))

  // Bonus-Phase: direkt in App rendern (kein Hooks-Verstoß in Quiz)
  const isBonus = phase === 'quiz' && currentRound === 3 && bonusQuestion

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
      {phase === 'quiz' && selectedLemma && !isBonus && (
        <Quiz
          key={currentRound}
          lemma={selectedLemma}
          currentRound={currentRound}
          onRoundComplete={handleRoundComplete}
        />
      )}
      {isBonus && selectedLemma && (
        bonusQuestion.skipped
          ? <FreeBonusRound onComplete={handleRoundComplete} />
          : <BonusRound bonus={bonusQuestion} lemma={selectedLemma} onComplete={handleRoundComplete} />
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
