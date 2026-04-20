import { useState, useCallback, useEffect, lazy, useRef } from 'react'
import { flushSync } from 'react-dom'
import { API } from './config'
import { lsGet, lsSet, lsParse } from './utils/storage'
import ErrorBoundary from './components/ErrorBoundary'
import AppGameScreens from './components/AppGameScreens'
import AppTabScreens from './components/AppTabScreens'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import ClassroomTab from './components/ClassroomTab'
import { useEntitlements } from './hooks/useEntitlements'
import { useDailyContent } from './hooks/useDailyContent'
import { getMedal, getDailyMedal, getZRMedal } from './utils/gameLogic'
import {
  getPlayedToday,
  makeDailyKeys,
  markActivity,
  savePlayedGame,
  saveWZHistory,
  saveZRHistory,
  saveZWHistory,
} from './utils/dailyProgress'

function startVT(callback) {
  if (typeof document === 'undefined' || !document.startViewTransition) {
    callback(); return
  }
  document.startViewTransition(() => flushSync(callback))
}

const Zeitreise    = lazy(() => import('./components/Zeitreise'))
const WortZwilling = lazy(() => import('./components/WortZwilling'))
const Zeitenwende  = lazy(() => import('./components/Zeitenwende'))

export default function App() {
  const {
    lemmata,
    apiError,
    serverDatum,
    serverYear,
    zeitreise,
    zeitreiseError,
    retryZeitreise,
    wortzwilling,
    wortzwillingError,
    retryWortzwilling,
    zeitenwende,
    zeitenwendeError,
    retryZeitenwende,
    zrPlayed,
    setZrPlayed,
    wzPlayed,
    setWzPlayed,
    zwPlayed,
    setZwPlayed,
  } = useDailyContent()
  const { gesamtausgabeUnlocked, refreshEntitlements, unlockGesamtausgabe } = useEntitlements()

  const [activeTab, setActiveTab]  = useState('spielmodi')
  const [classroomLive, setClassroomLive] = useState(false)
  const [classroomInSession, setClassroomInSession] = useState(false)
  const [phase, setPhase]         = useState('home')
  const [selectedLemma, setSelected] = useState(null)
  const [currentRound, setRound]  = useState(0)
  const [roundScores, setScores]  = useState([])
  const [bonusQuestion, setBonusQ] = useState(null)

  const appRef = useRef(null)
  const freshKollRef = useRef(false)
  const inGameRef = useRef(false)
  const classroomSubmitRef = useRef(null)
  const getRetroResultsRef = useRef(null)

  // Schlüssel aus Server-Datum ableiten (oder Fallback auf lokales Datum + Jahr)
  const keys = serverDatum
    ? makeDailyKeys(serverDatum, serverYear ?? new Date().getFullYear())
    : makeDailyKeys(`${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`)

  const [zrViewOnly, setZrViewOnly] = useState(false)
  const [wzViewOnly, setWzViewOnly] = useState(false)

  const [zwViewOnly, setZwViewOnly] = useState(false)

  useEffect(() => {
    if (activeTab !== 'profil') return
    refreshEntitlements()
  }, [activeTab, refreshEntitlements])

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

  // Ergebnis in localStorage speichern (Kollokationen)
  useEffect(() => {
    if (phase !== 'results' || !selectedLemma || roundScores.length === 0) return
    const total = roundScores.reduce((a, b) => a + b, 0)
    const hasBonus = roundScores.length >= 4
    const maxPoints = hasBonus ? 10 : 9
    const medal = getMedal(total, maxPoints)
    savePlayedGame({
      keys,
      lemmaId: selectedLemma.id,
      lemmaName: selectedLemma.lemma,
      lemmaPos: selectedLemma.pos || 'Substantiv',
      total,
      medal,
      lemmataLength: lemmata?.length,
      scores: roundScores,
    })
    if (freshKollRef.current && serverDatum) {
      freshKollRef.current = false
      fetch(`${API}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'kollokationen', datum: serverDatum, score: total, max: 10 }),
      }).catch(() => {})
      classroomSubmitRef.current?.({ game: 'kollokationen', score: total, maxScore: maxPoints })
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
    classroomSubmitRef.current?.({ game: 'wortzwilling', score, maxScore: 10 })
  }, [wortzwilling, serverDatum, keys.dateStr]) // eslint-disable-line

  const handleZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!zeitenwende || !serverDatum) return
    const medal = getMedal(score, 10)
    const entry = { lemma: zeitenwende.lemma, total: score, medal, answers }
    lsSet(`sig_zw_${serverDatum}`, JSON.stringify(entry))
    setZwPlayed(entry)
    markActivity(keys.dateStr)
    saveZWHistory(keys.dateStr, medal.label, medal.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitenwende', datum: serverDatum, score, max: 10 }),
    }).catch(() => {})
    classroomSubmitRef.current?.({ game: 'zeitenwende', score, maxScore: 10 })
  }, [zeitenwende, serverDatum, keys.dateStr]) // eslint-disable-line

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
    classroomSubmitRef.current?.({ game: 'zeitreise', score, maxScore: max })
  }, [zeitreise, keys.todayZRKey, keys.dateStr]) // eslint-disable-line

  const handleTabChange = useCallback((tab) => {
    if (tab === activeTab) return
    
    // Beim Verlassen von Spielmodi während eines Spiels: zurück zu Home
    if (activeTab === 'spielmodi' && phase !== 'home') {
      startVT(() => {
        setSelected(null); setRound(0); setScores([]); setBonusQ(null); setPhase('home')
      })
    }
    
    setActiveTab(tab)
  }, [activeTab, phase])

  const playedGames = getPlayedToday(keys.todayKey)
  const playedIds   = playedGames.map(g => g.id)
  const allPlayed   = lemmata?.length > 0 && lemmata.every(l => playedIds.includes(l.id))

  // ③ Retro-Submit: aktuelle Spielstände für nachträglichen Klassenraum-Beitritt bereitstellen
  useEffect(() => {
    getRetroResultsRef.current = () => {
      const results = []
      // Kollokationen: alle gespielten Lemmata des Tages (letztes überschreibt wie Live-Submit)
      const played = getPlayedToday(keys.todayKey)
      for (const g of played) {
        if (g.total != null) {
          const maxScore = Array.isArray(g.scores) && g.scores.length >= 4 ? 10 : 9
          results.push({ game: 'kollokationen', score: g.total, maxScore })
        }
      }
      if (zrPlayed?.total != null) {
        results.push({ game: 'zeitreise', score: zrPlayed.total, maxScore: zrPlayed.max ?? 10 })
      }
      if (wzPlayed?.total != null) {
        results.push({ game: 'wortzwilling', score: wzPlayed.total, maxScore: 10 })
      }
      if (zwPlayed?.total != null) {
        results.push({ game: 'zeitenwende', score: zwPlayed.total, maxScore: 10 })
      }
      return results
    }
  }, [keys.todayKey, zrPlayed, wzPlayed, zwPlayed])

  // Bonus-Phase: direkt in App rendern (kein Hooks-Verstoß in Quiz)
  const isBonus = phase === 'quiz' && currentRound === 3 && bonusQuestion
  const showTabBar = phase === 'home' || activeTab !== 'spielmodi'
  const tabScreens = AppTabScreens({
    phase,
    lemmata,
    apiError,
    playedGames,
    allPlayed,
    zeitreise,
    zeitreiseError,
    onRetryZeitreise: retryZeitreise,
    zrPlayed,
    onPlayZeitreise: {
      homeStart: () => startVT(() => setPhase(lemmata && !apiError ? 'selection' : 'home')),
      play: () => startVT(() => { setZrViewOnly(false); setPhase('zeitreise') }),
    },
    onViewZeitreise: () => startVT(() => { setZrViewOnly(true); setPhase('zeitreise') }),
    wortzwilling,
    wortzwillingError,
    onRetryWortzwilling: retryWortzwilling,
    wzPlayed,
    onPlayWortzwilling: {
      play: () => startVT(() => { setWzViewOnly(false); setPhase('wortzwilling') }),
    },
    onViewWortzwilling: () => startVT(() => { setWzViewOnly(true); setPhase('wortzwilling') }),
    zeitenwende,
    zeitenwendeError,
    onRetryZeitenwende: retryZeitenwende,
    zwPlayed,
    onPlayZeitenwende: {
      play: () => startVT(() => { setZwViewOnly(false); setPhase('zeitenwende') }),
    },
    onViewZeitenwende: () => startVT(() => { setZwViewOnly(true); setPhase('zeitenwende') }),
    gesamtausgabeUnlocked,
    classroomInSession,
    unlockGesamtausgabe,
    refreshEntitlements,
    onProfilUnlock: () => {
      unlockGesamtausgabe()
      setActiveTab('spielmodi')
    },
  })

  return (
    <ErrorBoundary>
    <div
      id="main-content"
      className={`app${phase === 'home' ? ' app--home' : ''}${showTabBar ? ' app--has-tabbar' : ''}${activeTab === 'klassenraum' ? ' app--tab-klassenraum' : ''}`}
      ref={appRef}
      tabIndex={-1}
      style={{ outline: 'none' }}
    >
      {/* Spielmodi-Screens (ohne TabTransition, haben eigene startVT-Logik) */}
      <AppGameScreens
        phase={phase}
        lemmata={lemmata}
        playedIds={playedIds}
        handleLemmaSelect={handleLemmaSelect}
        handleViewResult={handleViewResult}
        onBackToHome={() => startVT(() => setPhase('home'))}
        selectedLemma={selectedLemma}
        currentRound={currentRound}
        isBonus={isBonus}
        handleRoundComplete={handleRoundComplete}
        onBackToSelection={() => startVT(() => setPhase('selection'))}
        bonusQuestion={bonusQuestion}
        roundScores={roundScores}
        handleRestart={handleRestart}
        zeitreise={zeitreise}
        onZeitreiseBack={() => startVT(() => setPhase('home'))}
        handleZeitreiseFinish={handleZeitreiseFinish}
        zrViewOnly={zrViewOnly}
        zrPlayed={zrPlayed}
        Zeitreise={Zeitreise}
        wortzwilling={wortzwilling}
        onWortzwillingBack={() => startVT(() => setPhase('home'))}
        handleWZFinish={handleWZFinish}
        wzViewOnly={wzViewOnly}
        wzPlayed={wzPlayed}
        WortZwilling={WortZwilling}
        zeitenwende={zeitenwende}
        onZeitenwendeBack={() => startVT(() => setPhase('home'))}
        handleZeitenwendeFinish={handleZeitenwendeFinish}
        zwViewOnly={zwViewOnly}
        zwPlayed={zwPlayed}
        Zeitenwende={Zeitenwende}
      />

      {/* Tab-Screens (mit TabTransition für Umblätter-Effekt) */}
      <TabTransition activeTab={activeTab} tabs={tabScreens} />

      {/*
        ClassroomTab: IMMER gemountet — nie unmounten.
        Grund: Socket-Verbindung, submitRef und Teilnehmer-State
        müssen Tab-Wechsel überleben. display:none versteckt
        den Tab visuell, lässt aber den React-Tree intakt.
      */}
      <div
        aria-hidden={activeTab !== 'klassenraum' ? 'true' : undefined}
        style={activeTab !== 'klassenraum' ? { display: 'none' } : undefined}
      >
        <ClassroomTab onLiveChange={setClassroomLive} onInSessionChange={setClassroomInSession} submitRef={classroomSubmitRef} getRetroResultsRef={getRetroResultsRef} />
      </div>
    </div>
    {showTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} classroomLive={classroomLive} />}
    </ErrorBoundary>
  )
}
