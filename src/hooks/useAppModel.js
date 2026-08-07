import { useRef, useState, useCallback, useMemo } from 'react'
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
    apiErrorKind,
    retryDailyContent,
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
  const { gesamtausgabeUnlocked, gesamtausgabePermanent, loggedIn, classroomTeacher, customLemma: customLemmaQuota, refreshEntitlements } = useEntitlements()
  usePaywall({ refreshEntitlements })

  const appRef = useRef(null)

  // Memoized: keys wird als Dependency durch useKollokationenGame &
  // useAppDailyState gereicht — ohne useMemo erzeugte jeder State-Tick
  // ein neues Objekt und löste dort Effekte/Callbacks unnötig neu aus
  // (Review 2026-06-10).
  const keys = useMemo(
    () => makeDailyKeys(serverDatum || new Intl.DateTimeFormat('en-CA').format(new Date())),
    [serverDatum],
  )

  const {
    phase,
    setPhase,
    selectedLemma,
    savedSelected,
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

  // Premium-Funnel aus dem Spielkontext: führt zum Konto-Tab (dort sitzt der
  // Gesamtausgabe-Kauf). handleTabChange verlässt vorher sauber die Spiel-Phase.
  const onShowPremium = useCallback(() => {
    navigation.handleTabChange('profil')
  }, [navigation.handleTabChange])

  // ── Eigenes Lemma: isolierter Custom-Spielpfad (reines Üben) ─────
  // Zeitenwende/Wort-Zwilling/Lückenfüller laufen über eine eigene
  // 'custom-play'-Phase mit injizierten Daten und ephemerem Finish (keine
  // Tageswertung). Kollokationen nutzt den normalen Pfad (handleLemmaSelect),
  // wobei das Lemma als isCustom markiert ist und persistResults es überspringt.
  const [customGame, setCustomGame] = useState(null) // { mode, data } | null
  const playCustomGame = useCallback((mode, data) => {
    startVT(() => { setCustomGame({ mode, data }); setPhase('custom-play') })
  }, [setPhase])
  const exitCustomGame = useCallback(() => {
    const back = customGame?.mode ? `${customGame.mode}-selection` : 'home'
    startVT(() => { setCustomGame(null); setPhase(back) })
  }, [customGame, setPhase])
  const handleCustomPlay = useCallback((result) => {
    if (!result?.usable) return
    if (result.mode === 'kollokationen') handleLemmaSelect(result.lemma)
    else playCustomGame(result.mode, result.data)
    // Verbrauch wurde server-seitig gezählt – Kontingent neu laden, damit der
    // Zähler nach Rückkehr zur Auswahl stimmt.
    refreshEntitlements()
  }, [handleLemmaSelect, playCustomGame, refreshEntitlements])

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
    apiErrorKind,
    retryDailyContent,
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
    loggedIn,
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
    savedSelected,
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
    gesamtausgabe: gesamtausgabeUnlocked,
    customLemmaQuota,
    onCustomPlay: handleCustomPlay,
    onShowPremium,
    customGame,
    onExitCustomGame: exitCustomGame,
    serverDatum,
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
      onAuthStateChange: refreshEntitlements,
    },
  }
}
