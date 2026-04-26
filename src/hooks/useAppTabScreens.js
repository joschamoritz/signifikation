import { useCallback, useMemo, useState } from 'react'
import AppTabScreens from '../components/AppTabScreens'

export function useAppTabScreens({
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
  classroomInSession,
  unlockGesamtausgabe,
  openPaywall,
  refreshEntitlements,
  setActiveTab,
}) {
  const [zrViewOnly, setZrViewOnly] = useState(false)
  const [wzViewOnly, setWzViewOnly] = useState(false)
  const [zwViewOnly, setZwViewOnly] = useState(false)

  const tabScreens = useMemo(() => AppTabScreens({
    phase,
    lemmata,
    apiError,
    thema,
    playedGames,
    allPlayed,
    zeitreise,
    zeitreiseError,
    onRetryZeitreise: retryZeitreise,
    zrPlayed,
    onPlayZeitreise: {
      homeStart: () => startVT(() => setPhase(lemmata && !apiError ? 'selection' : 'home')),
      play: () => startVT(() => {
        setZrViewOnly(false)
        setPhase('zeitreise-selection')
      }),
    },
    onViewZeitreise: () => startVT(() => {
      setZrViewOnly(true)
      setPhase('zeitreise')
    }),
    wortzwilling,
    wortzwillingError,
    onRetryWortzwilling: retryWortzwilling,
    wzPlayed,
    onPlayWortzwilling: {
      play: () => startVT(() => {
        setWzViewOnly(false)
        setPhase('wortzwilling-selection')
      }),
    },
    onViewWortzwilling: () => startVT(() => {
      setWzViewOnly(true)
      setPhase('wortzwilling')
    }),
    zeitenwende,
    zeitenwendeError,
    zeitenwendeMissing,
    onRetryZeitenwende: retryZeitenwende,
    zwPlayed,
    onPlayZeitenwende: {
      play: () => startVT(() => {
        setZwViewOnly(false)
        setPhase('zeitenwende-selection')
      }),
    },
    onViewZeitenwende: () => startVT(() => {
      setZwViewOnly(true)
      setPhase('zeitenwende')
    }),
    gesamtausgabeUnlocked,
    classroomInSession,
    unlockGesamtausgabe: openPaywall,
    refreshEntitlements,
    onProfilUnlock: openPaywall,
  }), [
    phase,
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
    classroomInSession,
    unlockGesamtausgabe,
    openPaywall,
    refreshEntitlements,
    setActiveTab,
    setPhase,
    startVT,
  ])

  const goToZeitreise = useCallback(() => {
    startVT(() => setPhase('home'))
  }, [setPhase, startVT])

  const goToZeitreiseGame = useCallback(() => startVT(() => {
    setZrViewOnly(false)
    setPhase('zeitreise')
  }), [setPhase, startVT])

  const goToWortzwillingGame = useCallback(() => startVT(() => {
    setWzViewOnly(false)
    setPhase('wortzwilling')
  }), [setPhase, startVT])

  const goToZeitenwendeGame = useCallback(() => startVT(() => {
    setZwViewOnly(false)
    setPhase('zeitenwende')
  }), [setPhase, startVT])

  return {
    tabScreens,
    zrViewOnly,
    wzViewOnly,
    zwViewOnly,
    goToZeitreise,
    goToZeitreiseGame,
    goToWortzwillingGame,
    goToZeitenwendeGame,
  }
}
