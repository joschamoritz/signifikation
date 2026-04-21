import { useCallback, useMemo, useState } from 'react'
import AppTabScreens from '../components/AppTabScreens'

export function useAppTabScreens({
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
}) {
  const [zrViewOnly, setZrViewOnly] = useState(false)
  const [wzViewOnly, setWzViewOnly] = useState(false)
  const [zwViewOnly, setZwViewOnly] = useState(false)

  const tabScreens = useMemo(() => AppTabScreens({
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
      play: () => startVT(() => {
        setZrViewOnly(false)
        setPhase('zeitreise')
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
        setPhase('wortzwilling')
      }),
    },
    onViewWortzwilling: () => startVT(() => {
      setWzViewOnly(true)
      setPhase('wortzwilling')
    }),
    zeitenwende,
    zeitenwendeError,
    onRetryZeitenwende: retryZeitenwende,
    zwPlayed,
    onPlayZeitenwende: {
      play: () => startVT(() => {
        setZwViewOnly(false)
        setPhase('zeitenwende')
      }),
    },
    onViewZeitenwende: () => startVT(() => {
      setZwViewOnly(true)
      setPhase('zeitenwende')
    }),
    gesamtausgabeUnlocked,
    classroomInSession,
    unlockGesamtausgabe,
    refreshEntitlements,
    onProfilUnlock: () => {
      unlockGesamtausgabe()
      setActiveTab('spielmodi')
    },
  }), [
    phase,
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
    setPhase,
    startVT,
  ])

  const goToZeitreise = useCallback(() => {
    startVT(() => setPhase('home'))
  }, [setPhase, startVT])

  return {
    tabScreens,
    zrViewOnly,
    wzViewOnly,
    zwViewOnly,
    goToZeitreise,
  }
}
