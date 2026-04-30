import { useRef } from 'react'
import { WortZwillingScreen, ZeitenwendeScreen, ZeitreiseScreen } from '../components/AppLazyScreens'
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

export function useAppModel() {
  const {
    lemmata,
    apiError,
    serverDatum,
    serverYear,
    thema,
    themaKurz,
    themaQuelle,
    zeitreise,
    zeitreiseError,
    retryZeitreise,
    wortzwilling,
    wortzwillingError,
    retryWortzwilling,
    zeitenwende,
    zeitenwendeError,
    zeitenwendeMissing,
    retryZeitenwende,
    zrPlayed,
    setZrPlayed,
    wzPlayed,
    setWzPlayed,
    zwPlayed,
    setZwPlayed,
  } = useDailyContent()
  const { gesamtausgabeUnlocked, gesamtausgabePermanent, freeAccessToday, freeAccessLabel, refreshEntitlements } = useEntitlements()
  usePaywall({ refreshEntitlements })

  const appRef = useRef(null)
  const classroomSubmitRef = useRef(null)
  const getRetroResultsRef = useRef(null)

  const keys = serverDatum
    ? makeDailyKeys(serverDatum, serverYear ?? new Date().getFullYear())
    : makeDailyKeys(`${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`)

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

  const navigation = useAppNavigation({
    activePhase: phase,
    backToHome,
    startVT,
  })

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
    zeitenwendeMissing,
    retryZeitenwende,
    zwPlayed,
    gesamtausgabeUnlocked,
    gesamtausgabePermanent,
    freeAccessToday,
    freeAccessLabel,
    classroomInSession: navigation.classroomInSession,
    refreshEntitlements,
    setActiveTab: navigation.setActiveTab,
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
      currentRound,
      isBonus,
      handleRoundComplete,
      onBackToSelection: gameScreenActions.onBackToSelection,
      bonusQuestion,
      roundScores,
      handleRestart: gameScreenActions.onRestart,
      zeitreise,
      onZeitreiseBack: tabState.goToZeitreise,
      onZeitreiseSelectionBack: gameScreenActions.onZeitreiseSelectionBack,
      onZeitreisePlay: tabState.goToZeitreiseGame,
      handleZeitreiseFinish,
      zrViewOnly: tabState.zrViewOnly,
      zrPlayed,
      Zeitreise: ZeitreiseScreen,
      wortzwilling,
      onWortzwillingBack: gameScreenActions.onWortzwillingBack,
      onWortzwillingSelectionBack: gameScreenActions.onWortzwillingSelectionBack,
      onWortzwillingPlay: tabState.goToWortzwillingGame,
      handleWZFinish,
      wzViewOnly: tabState.wzViewOnly,
      wzPlayed,
      WortZwilling: WortZwillingScreen,
      zeitenwende,
      onZeitenwendeBack: gameScreenActions.onZeitenwendeBack,
      onZeitenwendeSelectionBack: gameScreenActions.onZeitenwendeSelectionBack,
      onZeitenwendePlay: tabState.goToZeitenwendeGame,
      handleZeitenwendeFinish,
      zwViewOnly: tabState.zwViewOnly,
      zwPlayed,
      Zeitenwende: ZeitenwendeScreen,
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
