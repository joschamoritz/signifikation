import { useCallback, useRef, useState } from 'react'
import { WortZwillingScreen, ZeitenwendeScreen, LueckenfuellerScreen } from '../components/AppLazyScreens'
import { useAppDailyState } from './useAppDailyState'
import { useAppEffects } from './useAppEffects'
import { useAppGameScreens } from './useAppGameScreens'
import { useAppNavigation } from './useAppNavigation'
import { useEntitlements } from './useEntitlements'
import { usePaywall } from './usePaywall'
import { useDailyContent } from './useDailyContent'
import { useAppTabScreens } from './useAppTabScreens'
import { useKollokationenGame } from './useKollokationenGame'
import { useSecondaryGameResults } from './useSecondaryGameResults'
import { makeDailyKeys } from '../utils/dailyProgress'
import { startVT } from '../utils/viewTransition'
import { getMedal } from '../utils/gameLogic'
import { lsSet } from '../utils/storage'
import { API } from '../config'

export function useAppModel() {
  const {
    lemmata,
    apiError,
    serverDatum,
    thema,
    themaKurz,
    themaQuelle,
    wortzwilling,
    wortzwillingError,
    retryWortzwilling,
    zeitenwende,
    zeitenwendeError,
    zeitenwendeMissing,
    retryZeitenwende,
    wzPlayed,
    setWzPlayed,
    zwPlayed,
    setZwPlayed,
    lfPlayed,
    setLfPlayed,
    lueckenfuellerLemma,
    // Spezialwoche
    spezialwoche,
    swWzPlayed,
    setSwWzPlayed,
    swZwPlayed,
    setSwZwPlayed,
    swLfPlayed,
    setSwLfPlayed,
  } = useDailyContent()
  const { gesamtausgabeUnlocked, gesamtausgabePermanent, freeAccessToday, freeAccessLabel, refreshEntitlements } = useEntitlements()
  usePaywall({ refreshEntitlements })

  const appRef = useRef(null)
  const classroomSubmitRef = useRef(null)
  const getRetroResultsRef = useRef(null)

  const keys = serverDatum
    ? makeDailyKeys(serverDatum)
    : makeDailyKeys(new Intl.DateTimeFormat('en-CA').format(new Date()))

  const {
    phase,
    setPhase,
    selectedLemma,
    roundScores,
    persistResults,
    handleLemmaSelect,
    handleRoundComplete,
    handleViewResult,
    handleRestart,
    backToSelection,
    backToHome,
  } = useKollokationenGame({ keys, serverDatum, lemmata })

  const navigation = useAppNavigation({
    activePhase: phase,
    backToHome,
    startVT,
  })

  const [lfProgress, setLfProgress] = useState(null)
  const [zwProgress, setZwProgress] = useState(null)

  const {
    handleWZFinish,
    handleZeitenwendeFinish,
    handleLFFinish,
  } = useSecondaryGameResults({
    keys,
    serverDatum,
    wortzwilling,
    zeitenwende,
    lueckenfuellerLemma,
    wzPlayed,
    zwPlayed,
    lfPlayed,
    setWzPlayed,
    setZwPlayed,
    setLfPlayed,
    classroomSubmitRef,
    getRetroResultsRef,
  })

  // ── Spezialwoche Finish-Handler ─────────────────────────────────
  const handleSwWZFinish = useCallback(({ score, zoneA, zoneB }) => {
    if (!spezialwoche) return
    const medal  = getMedal(score, 10)
    const entry  = {
      lemma: `${spezialwoche.wortzwilling.wortA} / ${spezialwoche.wortzwilling.wortB}`,
      total: score, medal, zoneA, zoneB,
    }
    lsSet(`sig_sw_wz_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwWzPlayed(entry)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'wortzwilling', datum: spezialwoche.von, score, max: 10 }),
    }).catch(() => {})
  }, [spezialwoche, setSwWzPlayed])

  const handleSwZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.zeitenwende.lemma, total: score, medal, answers }
    lsSet(`sig_sw_zw_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwZwPlayed(entry)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitenwende', datum: spezialwoche.von, score, max: 10 }),
    }).catch(() => {})
  }, [spezialwoche, setSwZwPlayed])

  const handleSwLFFinish = useCallback(({ score, scores }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.lueckenfuellerLemma?.lemma ?? '', total: score, scores, medal }
    lsSet(`sig_sw_lf_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwLfPlayed(entry)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'lueckenfueller', datum: spezialwoche.von, score, max: 10 }),
    }).catch(() => {})
  }, [spezialwoche, setSwLfPlayed])

  const { playedGames, playedIds, allPlayed } = useAppDailyState({
    todayKey: keys.todayKey,
    lemmata,
  })

  const tabState = useAppTabScreens({
    startVT,
    phase,
    setPhase,
    lemmata,
    apiError,
    thema,
    playedGames,
    allPlayed,
    wortzwilling,
    wortzwillingError,
    retryWortzwilling,
    wzPlayed,
    zeitenwende,
    zeitenwendeError,
    zeitenwendeMissing,
    retryZeitenwende,
    zwPlayed,
    lueckenfuellerLemma,
    lfPlayed,
    gesamtausgabeUnlocked,
    gesamtausgabePermanent,
    freeAccessToday,
    freeAccessLabel,
    classroomInSession: navigation.classroomInSession,
    refreshEntitlements,
    setActiveTab: navigation.setActiveTab,
    // Spezialwoche
    spezialwoche,
    swWzPlayed,
    swZwPlayed,
    swLfPlayed,
  })

  const gameScreenActions = useAppGameScreens({
    startVT,
    setPhase,
    handleLemmaSelect,
    handleViewResult,
    backToHome,
    backToSelection,
    handleRestart,
    setLfProgress,
    setZwProgress,
  })

  useAppEffects({
    activeTab: navigation.activeTab,
    refreshEntitlements,
    phase,
    appRef,
    persistResults,
    classroomSubmitRef,
  })

  return {
    appRef,
    activeTab: navigation.activeTab,
    classroomLive: navigation.classroomLive,
    classroomMounted:
      navigation.activeTab === 'klassenraum' || navigation.classroomInSession || navigation.classroomLive,
    handleTabChange: navigation.handleTabChange,
    showTabBar: navigation.showTabBar,
    phase,
    tabScreens: tabState.tabScreens,
    appGameScreensProps: {
      phase,
      thema,
      themaKurz,
      themaQuelle,
      lemmata,
      playedIds,
      handleLemmaSelect: gameScreenActions.onLemmaSelect,
      handleViewResult: gameScreenActions.onViewResult,
      onBackToHome: gameScreenActions.onBackToHome,
      selectedLemma,
      handleRoundComplete,
      onBackToSelection: gameScreenActions.onBackToSelection,
      roundScores,
      handleRestart: gameScreenActions.onRestart,
      wortzwilling,
      onWortzwillingBack: gameScreenActions.onWortzwillingBack,
      onWortzwillingSelectionBack: gameScreenActions.onWortzwillingSelectionBack,
      onWortzwillingPlay: tabState.goToWortzwillingGame,
      onWortzwillingViewResult: tabState.viewWortzwillingResult,
      handleWZFinish,
      wzViewOnly: tabState.wzViewOnly,
      wzPlayed,
      WortZwilling: WortZwillingScreen,
      zeitenwende,
      onZeitenwendeBack: gameScreenActions.onZeitenwendeBack,
      onZeitenwendeSelectionBack: gameScreenActions.onZeitenwendeSelectionBack,
      onZeitenwendePlay: tabState.goToZeitenwendeGame,
      onZeitenwendeViewResult: tabState.viewZeitenwendeResult,
      handleZeitenwendeFinish,
      zwViewOnly: tabState.zwViewOnly,
      zwPlayed,
      zwProgress,
      Zeitenwende: ZeitenwendeScreen,
      lueckenfuellerLemma,
      onLueckenfuellerSelectionBack: gameScreenActions.onLueckenfuellerSelectionBack,
      onLueckenfuellerPlay: tabState.goToLueckenfuellerGame,
      onLueckenfuellerViewResult: tabState.viewLueckenfuellerResult,
      onLueckenfuellerBack: gameScreenActions.onLueckenfuellerBack,
      handleLFFinish,
      lfViewOnly: tabState.lfViewOnly,
      lfPlayed,
      lfProgress,
      Lueckenfueller: LueckenfuellerScreen,
      // Spezialwoche
      spezialwoche,
      swWzPlayed,
      swZwPlayed,
      swLfPlayed,
      handleSwWZFinish,
      handleSwZeitenwendeFinish,
      handleSwLFFinish,
      swWzViewOnly: tabState.swWzViewOnly,
      swZwViewOnly: tabState.swZwViewOnly,
      swLfViewOnly: tabState.swLfViewOnly,
      onSwWzPlay: tabState.goToSwWzGame,
      onSwZwPlay: tabState.goToSwZeitenwendeGame,
      onSwLfPlay: tabState.goToSwLfGame,
      onViewSwWz: tabState.viewSwWz,
      onViewSwZw: tabState.viewSwZw,
      onViewSwLf: tabState.viewSwLf,
      onSwBack: gameScreenActions.onBackToHome,
    },
    persistentClassroomProps: {
      activeTab: navigation.activeTab,
      onLiveChange: navigation.setClassroomLive,
      onInSessionChange: navigation.setClassroomInSession,
      submitRef: classroomSubmitRef,
      getRetroResultsRef,
    },
  }
}
