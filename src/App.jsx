import { useState, useCallback, useEffect, Suspense, lazy, useRef } from 'react'
import { flushSync } from 'react-dom'
import { API } from './config'
import { lsGet, lsSet, lsParse } from './utils/storage'
import Home from './components/Home'
import LemmaSelection from './components/LemmaSelection'
import Quiz from './components/Quiz'
import { BonusRound, FreeBonusRound } from './components/BonusRound'
import Results from './components/Results'
import ErrorBoundary from './components/ErrorBoundary'
import FeedbackModal from './components/FeedbackModal'
import { getMedal, getDailyMedal, getZRMedal } from './utils/gameLogic'
import { fetchWithRetry } from './utils/fetchWithRetry'

const FEEDBACK_INTERVAL = 30 * 24 * 60 * 60 * 1000 // 30 Tage


function shouldShowFeedback(game) {
  const last = lsGet(`sig_fb_${game}`)
  if (!last) return true
  return Date.now() - parseInt(last) > FEEDBACK_INTERVAL
}

function markFeedbackShown(game) {
  lsSet(`sig_fb_${game}`, Date.now().toString())
}

function startVT(callback) {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    callback(); return
  }
  document.startViewTransition(() => flushSync(callback))
}

const Zeitreise    = lazy(() => import('./components/Zeitreise'))
const WortZwilling = lazy(() => import('./components/WortZwilling'))

// ── localStorage-Schlüssel aus Server-Datum (verhindert Zeitzonen-Mismatch) ──
function makeKeys(datum, year = new Date().getFullYear()) {
  // datum = "MM-DD" vom Server (Europe/Berlin), z.B. "03-16"
  return {
    todayKey:   `sig_${datum}`,
    todayZRKey: `sig_zr_${datum}`,
    dateStr:    `${year}-${datum}`,   // für History (YYYY-MM-DD)
  }
}

function getPlayedToday(key) {
  const val = lsParse(lsGet(key), [])
  return Array.isArray(val) ? val : []
}

function getZRToday(key) {
  return lsParse(lsGet(key), null)
}

function getWZToday(key) {
  return lsParse(lsGet(key), null)
}

function markActivity(dateStr) {
  const activity = lsParse(lsGet('sig_activity'), [])
  if (!activity.includes(dateStr)) {
    lsSet('sig_activity', JSON.stringify([dateStr, ...activity].slice(0, 365)))
  }
}

function saveKollHistory(dateStr, medal, emoji) {
  const history = lsParse(lsGet('sig_koll_history'), [])
  const idx = history.findIndex(h => h.date === dateStr)
  const entry = { date: dateStr, medal, emoji }
  if (idx >= 0) history[idx] = entry
  else history.unshift(entry)
  lsSet('sig_koll_history', JSON.stringify(history.slice(0, 365)))
}

function saveZRHistory(dateStr, medal, emoji) {
  const history = lsParse(lsGet('sig_zr_history'), [])
  const idx = history.findIndex(h => h.date === dateStr)
  const entry = { date: dateStr, medal, emoji }
  if (idx >= 0) history[idx] = entry
  else history.unshift(entry)
  lsSet('sig_zr_history', JSON.stringify(history.slice(0, 365)))
}

function saveWZHistory(dateStr, medal, emoji) {
  const history = lsParse(lsGet('sig_wz_history'), [])
  const idx = history.findIndex(h => h.date === dateStr)
  const entry = { date: dateStr, medal, emoji }
  if (idx >= 0) history[idx] = entry
  else history.unshift(entry)
  lsSet('sig_wz_history', JSON.stringify(history.slice(0, 365)))
}

function savePlayedGame(keys, lemmaId, lemmaName, lemmaPos, total, medal, lemmataLength, scores) {
  const played = getPlayedToday(keys.todayKey)
  const idx    = played.findIndex(p => p.id === lemmaId)
  const entry  = { id: lemmaId, lemma: lemmaName, pos: lemmaPos, total, medal, scores }
  if (idx >= 0) played[idx] = entry
  else played.push(entry)
  lsSet(keys.todayKey, JSON.stringify(played))

  // Jedes einzelne gespielte Spiel zählt für den Streak
  markActivity(keys.dateStr)

  // Koll-History erst wenn alle Wörter gespielt
  if (lemmataLength && played.length >= lemmataLength) {
    const dailyTotal = played.reduce((s, g) => s + g.total, 0)
    const dailyMedal = getDailyMedal(dailyTotal)
    saveKollHistory(keys.dateStr, dailyMedal.label, dailyMedal.emoji)
  }
}

export default function App() {
  const [lemmata, setLemmata]   = useState(null)
  const [apiError, setApiError] = useState(null)
  const [zeitreise, setZeitreise] = useState(null)
  const [zeitreiseError, setZeitreiseError] = useState(false)
  const [zeitreiseRetry, setZeitreiseRetry] = useState(0)
  const [wortzwilling, setWortzwilling] = useState(null)
  const [wortzwillingError, setWortzwillingError] = useState(false)
  const [wortzwillingRetry, setWortzwillingRetry] = useState(0)
  const [serverDatum, setServerDatum] = useState(null)  // "MM-DD" vom Server
  const [serverYear,  setServerYear]  = useState(null)  // Jahreszahl vom Server

  const [phase, setPhase]         = useState('home')
  const [selectedLemma, setSelected] = useState(null)
  const [currentRound, setRound]  = useState(0)
  const [roundScores, setScores]  = useState([])
  const [bonusQuestion, setBonusQ] = useState(null)

  const appRef = useRef(null)
  const freshKollRef = useRef(false)
  const inGameRef = useRef(false)
  const [feedbackGame, setFeedbackGame] = useState(null)

  function triggerFeedback(game) {
    if (!shouldShowFeedback(game)) return
    markFeedbackShown(game)
    setTimeout(() => setFeedbackGame(game), 900)
  }

  // Schlüssel aus Server-Datum ableiten (oder Fallback auf lokales Datum + Jahr)
  const keys = serverDatum
    ? makeKeys(serverDatum, serverYear ?? new Date().getFullYear())
    : makeKeys(`${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`)

  const [zrViewOnly, setZrViewOnly] = useState(false)
  const [zrPlayed, setZrPlayed] = useState(null)

  const [wzViewOnly, setWzViewOnly] = useState(false)
  const [wzPlayed, setWzPlayed] = useState(null)

  // Fokus bei Screen-Wechsel
  useEffect(() => { appRef.current?.focus() }, [phase])

  // iOS/Browser Swipe-Back: ein History-Eintrag beim Verlassen von Home
  useEffect(() => {
    if (phase === 'home') {
      inGameRef.current = false
      return
    }
    if (!inGameRef.current) {
      window.history.pushState({ sig: true }, '')
      inGameRef.current = true
    }
  }, [phase])

  useEffect(() => {
    function onPop() {
      inGameRef.current = false
      startVT(() => {
        setPhase('home')
        setSelected(null)
        setRound(0)
        setScores([])
        setBonusQ(null)
      })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Lemmata + Server-Datum laden
  useEffect(() => {
    fetchWithRetry(`${API}/heute`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(new Error(d.error || `HTTP ${r.status}`))))
      .then(({ datum, year, lemmata }) => {
        setServerDatum(datum)
        if (year) setServerYear(year)
        setLemmata(lemmata)
        // ZR- und WZ-Key jetzt mit echtem Server-Datum prüfen
        setZrPlayed(getZRToday(`sig_zr_${datum}`))
        setWzPlayed(getWZToday(`sig_wz_${datum}`))
      })
      .catch(err => setApiError(err.message))
  }, [])

  useEffect(() => {
    setZeitreiseError(false)
    setZeitreise(null)
    fetchWithRetry(`${API}/zeitreise`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => { if (data) setZeitreise(data) })
      .catch(() => setZeitreiseError(true))
  }, [zeitreiseRetry]) // eslint-disable-line

  useEffect(() => {
    setWortzwillingError(false)
    setWortzwilling(null)
    fetchWithRetry(`${API}/wortzwilling`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => { if (data) setWortzwilling(data) })
      .catch(() => setWortzwillingError(true))
  }, [wortzwillingRetry]) // eslint-disable-line

  const retryZeitreise = useCallback(() => {
    setZeitreiseRetry(n => n + 1)
  }, [])

  const retryWortzwilling = useCallback(() => {
    setWortzwillingRetry(n => n + 1)
  }, [])

  // Ergebnis in localStorage speichern (Kollokationen)
  useEffect(() => {
    if (phase !== 'results' || !selectedLemma || roundScores.length === 0) return
    const total = roundScores.reduce((a, b) => a + b, 0)
    const hasBonus = roundScores.length >= 4
    const maxPoints = hasBonus ? 10 : 9
    const medal = getMedal(total, maxPoints)
    savePlayedGame(keys, selectedLemma.id, selectedLemma.lemma, selectedLemma.pos || 'Substantiv', total, medal, lemmata?.length, roundScores)
    if (freshKollRef.current && serverDatum) {
      freshKollRef.current = false
      fetch(`${API}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'kollokationen', datum: serverDatum, score: total, max: 10 }),
      }).catch(() => {})
    }
  }, [phase, selectedLemma, roundScores, lemmata]) // eslint-disable-line

  const handleLemmaSelect = useCallback((lemma) => {
    startVT(() => {
      setSelected(lemma)
      setRound(0)
      setScores([])
      setBonusQ(null)
      setPhase('quiz')
    })
  }, [])

  // Bonus-Fetch sauber in useEffect statt im State-Updater
  const [fetchBonus, setFetchBonus] = useState(false)
  useEffect(() => {
    if (!fetchBonus || !selectedLemma) return
    setFetchBonus(false)
    fetch(`${API}/bonus?id=${selectedLemma.id}`)
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
      else if (next.length < 4) setRound(r => r + 1)
      return next
    })
  }, [])

  // Übergang zu Results nach Bonusrunde (außerhalb des setState-Updaters)
  useEffect(() => {
    if (roundScores.length === 4 && phase === 'quiz') {
      freshKollRef.current = true
      startVT(() => setPhase('results'))
      triggerFeedback('kollokationen')
    }
  }, [roundScores.length]) // eslint-disable-line

  const handleViewResult = useCallback((lemmaId) => {
    const played = getPlayedToday(keys.todayKey).find(p => p.id === lemmaId)
    const lemma  = lemmata?.find(l => l.id === lemmaId)
    if (!played || !lemma) return
    setSelected(lemma)
    setScores(played.scores ?? [])
    setBonusQ(null)
    setPhase('results')
  }, [keys.todayKey, lemmata])

  const handleRestart = useCallback(() => {
    startVT(() => {
      setSelected(null)
      setRound(0)
      setScores([])
      setBonusQ(null)
      setPhase('home')
    })
  }, [])

  const handleWZFinish = useCallback(({ score, zoneA, zoneB }) => {
    if (!wortzwilling || !serverDatum) return
    const medal = getMedal(score, 10)
    const entry = {
      lemma:  `${wortzwilling.wortA} / ${wortzwilling.wortB}`,
      total:  score,
      medal,
      wortA:  wortzwilling.wortA,
      wortB:  wortzwilling.wortB,
      zoneA,
      zoneB,
    }
    lsSet(`sig_wz_${serverDatum}`, JSON.stringify(entry))
    setWzPlayed(entry)
    markActivity(keys.dateStr)
    saveWZHistory(keys.dateStr, medal.label, medal.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'wortzwilling', datum: serverDatum, score, max: 10 }),
    }).catch(() => {})
    triggerFeedback('wortzwilling')
  }, [wortzwilling, serverDatum, keys.dateStr]) // eslint-disable-line

  const handleZeitreiseFinish = useCallback((score, placements) => {
    if (!zeitreise) return
    const max   = zeitreise.paare.length * 2
    const zrMed = getZRMedal(score, max)
    const entry = { lemma: zeitreise.lemma, total: score, max, medal: zrMed, placements }
    lsSet(keys.todayZRKey, JSON.stringify(entry))
    setZrPlayed(entry)
    markActivity(keys.dateStr)
    saveZRHistory(keys.dateStr, zrMed.label, zrMed.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitreise', datum: serverDatum, score, max }),
    }).catch(() => {})
    triggerFeedback('zeitreise')
  }, [zeitreise, keys.todayZRKey, keys.dateStr]) // eslint-disable-line

  const playedGames = getPlayedToday(keys.todayKey)
  const playedIds   = playedGames.map(g => g.id)
  const allPlayed   = lemmata?.length > 0 && lemmata.every(l => playedIds.includes(l.id))

  // Bonus-Phase: direkt in App rendern (kein Hooks-Verstoß in Quiz)
  const isBonus = phase === 'quiz' && currentRound === 3 && bonusQuestion

  return (
    <ErrorBoundary>
    <div id="main-content" className={`app${phase === 'home' ? ' app--home' : ''}`} ref={appRef} tabIndex={-1} style={{ outline: 'none' }}>
      {phase === 'home' && (
        <Home
          onStart={() => startVT(() => setPhase(lemmata && !apiError ? 'selection' : 'home'))}
          loading={!lemmata && !apiError}
          error={apiError}
          lemmata={lemmata || []}
          playedGames={playedGames}
          allPlayed={!!allPlayed}
          zeitreise={zeitreise}
          zeitreiseError={zeitreiseError}
          onRetryZeitreise={retryZeitreise}
          zrPlayed={zrPlayed}
          onPlayZeitreise={() => startVT(() => { setZrViewOnly(false); setPhase('zeitreise') })}
          onViewZeitreise={() => startVT(() => { setZrViewOnly(true); setPhase('zeitreise') })}
          wortzwilling={wortzwilling}
          wortzwillingError={wortzwillingError}
          onRetryWortzwilling={retryWortzwilling}
          wzPlayed={wzPlayed}
          onPlayWortzwilling={() => startVT(() => { setWzViewOnly(false); setPhase('wortzwilling') })}
          onViewWortzwilling={() => startVT(() => { setWzViewOnly(true);  setPhase('wortzwilling') })}
        />
      )}
      {phase === 'selection' && lemmata && (
        <LemmaSelection
          lemmata={lemmata}
          playedIds={playedIds}
          onSelect={handleLemmaSelect}
          onViewResult={handleViewResult}
          onBack={() => startVT(() => setPhase('home'))}
        />
      )}
      {phase === 'quiz' && selectedLemma && !isBonus && (
        <Quiz
          key={currentRound}
          lemma={selectedLemma}
          currentRound={currentRound}
          onRoundComplete={handleRoundComplete}
          onBack={() => startVT(() => setPhase('selection'))}
        />
      )}
      {isBonus && selectedLemma && (
        bonusQuestion.skipped
          ? <FreeBonusRound onComplete={handleRoundComplete} onBack={() => startVT(() => setPhase('selection'))} />
          : <BonusRound bonus={bonusQuestion} lemma={selectedLemma} onComplete={handleRoundComplete} onBack={() => startVT(() => setPhase('selection'))} />
      )}
      {phase === 'results' && selectedLemma && (
        <Results
          lemma={selectedLemma}
          roundScores={roundScores}
          onRestart={handleRestart}
          onToSelection={() => startVT(() => setPhase('selection'))}
        />
      )}
      {phase === 'zeitreise' && zeitreise && (
        <Suspense fallback={<div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p style={{ color: 'var(--muted)' }}>Lade …</p></div>}>
          <Zeitreise
            data={zeitreise}
            onBack={() => startVT(() => setPhase('home'))}
            onFinish={handleZeitreiseFinish}
            savedResult={zrViewOnly ? zrPlayed : null}
          />
        </Suspense>
      )}
      {phase === 'wortzwilling' && wortzwilling && (
        <Suspense fallback={<div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}><p style={{ color: 'var(--muted)' }}>Lade …</p></div>}>
          <WortZwilling
            data={wortzwilling}
            onBack={() => startVT(() => setPhase('home'))}
            onFinish={handleWZFinish}
            savedResult={wzViewOnly ? wzPlayed : null}
          />
        </Suspense>
      )}
      {feedbackGame && (
        <FeedbackModal game={feedbackGame} onClose={() => setFeedbackGame(null)} />
      )}
    </div>
    </ErrorBoundary>
  )
}
