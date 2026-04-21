import { useState, useCallback, useEffect, lazy, useRef } from 'react'
import { flushSync } from 'react-dom'
import ErrorBoundary from './components/ErrorBoundary'
import AppShell from './components/AppShell'
import AppGameScreens from './components/AppGameScreens'
import TabBar from './components/TabBar'
import TabTransition from './components/TabTransition'
import ClassroomTab from './components/ClassroomTab'
import { useAppGameScreens } from './hooks/useAppGameScreens'
import { useEntitlements } from './hooks/useEntitlements'
import { useDailyContent } from './hooks/useDailyContent'
import { useAppTabScreens } from './hooks/useAppTabScreens'
import { useKollokationenGame } from './hooks/useKollokationenGame'
import { useSecondaryGameResults } from './hooks/useSecondaryGameResults'
import {
  getPlayedToday,
  makeDailyKeys,
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

  const appRef = useRef(null)
  const classroomSubmitRef = useRef(null)
  const getRetroResultsRef = useRef(null)

  // Schlüssel aus Server-Datum ableiten (oder Fallback auf lokales Datum + Jahr)
  const keys = serverDatum
    ? makeDailyKeys(serverDatum, serverYear ?? new Date().getFullYear())
    : makeDailyKeys(`${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`)

  const {
    phase,
    setPhase,
    selectedLemma,
    currentRound,
    roundScores,
    bonusQuestion,
    isBonus,
    persistResults,
    handleLemmaSelect,
    handleRoundComplete,
    handleViewResult,
    handleRestart,
    backToSelection,
    backToHome,
  } = useKollokationenGame({ keys, serverDatum, lemmata })

  const {
    handleWZFinish,
    handleZeitenwendeFinish,
    handleZeitreiseFinish,
  } = useSecondaryGameResults({
    keys,
    serverDatum,
    zeitreise,
    wortzwilling,
    zeitenwende,
    zrPlayed,
    wzPlayed,
    zwPlayed,
    setZrPlayed,
    setWzPlayed,
    setZwPlayed,
    classroomSubmitRef,
    getRetroResultsRef,
  })

  useEffect(() => {
    if (activeTab !== 'profil') return
    refreshEntitlements()
  }, [activeTab, refreshEntitlements])

  // Fokus bei Screen-Wechsel
  useEffect(() => { appRef.current?.focus() }, [phase])

  // Ergebnis in localStorage speichern (Kollokationen)
  useEffect(() => {
    persistResults(classroomSubmitRef.current)
  }, [persistResults])

  const playedGames = getPlayedToday(keys.todayKey)
  const playedIds = playedGames.map((game) => game.id)
  const allPlayed = lemmata?.length > 0 && lemmata.every((lemma) => playedIds.includes(lemma.id))

  const {
    tabScreens,
    zrViewOnly,
    wzViewOnly,
    zwViewOnly,
    goToZeitreise,
  } = useAppTabScreens({
    startVT,
    phase,
    setPhase,
    lemmata,
    apiError,
    playedGames,
    allPlayed,
    zeitreise,
    zeitreiseError,
    retryZeitreise,
    zrPlayed,
    wortzwilling,
    wortzwillingError,
    retryWortzwilling,
    wzPlayed,
    zeitenwende,
    zeitenwendeError,
    retryZeitenwende,
    zwPlayed,
    gesamtausgabeUnlocked,
    classroomInSession,
    unlockGesamtausgabe,
    refreshEntitlements,
    setActiveTab,
  })

  const gameScreenActions = useAppGameScreens({
    startVT,
    setPhase,
    handleLemmaSelect,
    handleViewResult,
    backToHome,
    backToSelection,
    handleRestart,
  })

  const handleTabChange = useCallback((tab) => {
    if (tab === activeTab) return

    // Beim Verlassen von Spielmodi während eines Spiels: zurück zu Home
    if (activeTab === 'spielmodi' && phase !== 'home') {
      startVT(() => backToHome())
    }

    setActiveTab(tab)
  }, [activeTab, backToHome, phase])

  const showTabBar = phase === 'home' || activeTab !== 'spielmodi'

  return (
    <ErrorBoundary>
    <AppShell phase={phase} showTabBar={showTabBar} activeTab={activeTab} appRef={appRef}>
      {/* Spielmodi-Screens (ohne TabTransition, haben eigene startVT-Logik) */}
      <AppGameScreens
        phase={phase}
        lemmata={lemmata}
        playedIds={playedIds}
        handleLemmaSelect={gameScreenActions.onLemmaSelect}
        handleViewResult={gameScreenActions.onViewResult}
        onBackToHome={gameScreenActions.onBackToHome}
        selectedLemma={selectedLemma}
        currentRound={currentRound}
        isBonus={isBonus}
        handleRoundComplete={handleRoundComplete}
        onBackToSelection={gameScreenActions.onBackToSelection}
        bonusQuestion={bonusQuestion}
        roundScores={roundScores}
        handleRestart={gameScreenActions.onRestart}
        zeitreise={zeitreise}
        onZeitreiseBack={goToZeitreise}
        handleZeitreiseFinish={handleZeitreiseFinish}
        zrViewOnly={zrViewOnly}
        zrPlayed={zrPlayed}
        Zeitreise={Zeitreise}
        wortzwilling={wortzwilling}
        onWortzwillingBack={gameScreenActions.onWortzwillingBack}
        handleWZFinish={handleWZFinish}
        wzViewOnly={wzViewOnly}
        wzPlayed={wzPlayed}
        WortZwilling={WortZwilling}
        zeitenwende={zeitenwende}
        onZeitenwendeBack={gameScreenActions.onZeitenwendeBack}
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
    </AppShell>
    {showTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} classroomLive={classroomLive} />}
    </ErrorBoundary>
  )
}
