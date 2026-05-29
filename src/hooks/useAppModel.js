import { useRef } from 'react'
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
import { useSpezialwocheResults } from './useSpezialwocheResults'
import { useGameScreenProps } from './useGameScreenProps'
import { makeDailyKeys } from '../utils/dailyProgress'
import { startVT } from '../utils/viewTransition'

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
  const { gesamtausgabeUnlocked, gesamtausgabePermanent, freeAccessToday, freeAccessLabel, classroomTeacher, refreshEntitlements } = useEntitlements()
  usePaywall({ refreshEntitlements })

  const appRef = useRef(null)

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
    setWzPlayed,
    setZwPlayed,
    setLfPlayed,
  })

  // ── Spezialwoche Finish-Handler ─────────────────────────────────
  const {
    handleSwWZFinish,
    handleSwZeitenwendeFinish,
    handleSwLFFinish,
  } = useSpezialwocheResults({ spezialwoche, setSwWzPlayed, setSwZwPlayed, setSwLfPlayed })

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
    freeAccessToday,
    freeAccessLabel,
    serverDatum,
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
  })

  useAppEffects({
    activeTab: navigation.activeTab,
    refreshEntitlements,
    phase,
    appRef,
    persistResults,
  })

  const appGameScreensProps = useGameScreenProps({
    phase,
    thema,
    themaKurz,
    themaQuelle,
    lemmata,
    playedIds,
    selectedLemma,
    handleRoundComplete,
    roundScores,
    wortzwilling,
    wzPlayed,
    zeitenwende,
    zwPlayed,
    lueckenfuellerLemma,
    lfPlayed,
    spezialwoche,
    swWzPlayed,
    swZwPlayed,
    swLfPlayed,
    handleWZFinish,
    handleZeitenwendeFinish,
    handleLFFinish,
    handleSwWZFinish,
    handleSwZeitenwendeFinish,
    handleSwLFFinish,
    gameScreenActions,
    tabState,
  })

  return {
    appRef,
    activeTab: navigation.activeTab,
    kontoMounted: navigation.kontoMounted,
    handleTabChange: navigation.handleTabChange,
    showTabBar: navigation.showTabBar,
    classroomTeacher,
    phase,
    tabScreens: tabState.tabScreens,
    appGameScreensProps,
    persistentKontoProps: {
      activeTab: navigation.activeTab,
      gesamtausgabe: gesamtausgabeUnlocked,
      gesamtausgabePermanent,
      freeAccessToday,
      freeAccessLabel,
      onAuthStateChange: refreshEntitlements,
    },
  }
}
