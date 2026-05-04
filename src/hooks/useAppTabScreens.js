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
  classroomInSession,
  refreshEntitlements,
  setActiveTab,
}) {
  const [wzViewOnly, setWzViewOnly] = useState(false)
  const [zwViewOnly, setZwViewOnly] = useState(false)
  const [lfViewOnly, setLfViewOnly] = useState(false)

  const tabScreens = useMemo(() => AppTabScreens({
    phase,
    lemmata,
    apiError,
    thema,
    playedGames,
    allPlayed,
    onStart: () => startVT(() => setPhase(lemmata && !apiError ? 'selection' : 'home')),
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
    lueckenfuellerLemma,
    lfPlayed,
    onPlayLueckenfueller: lueckenfuellerLemma ? {
      play: () => startVT(() => {
        setLfViewOnly(false)
        setPhase('lueckenfueller')
      }),
    } : null,
    onViewLueckenfueller: () => startVT(() => {
      setLfViewOnly(true)
      setPhase('lueckenfueller')
    }),
    gesamtausgabeUnlocked,
    gesamtausgabePermanent,
    freeAccessToday,
    freeAccessLabel,
    classroomInSession,
    onNavigateToKonto: () => setActiveTab('profil'),
    refreshEntitlements,
  }), [
    phase,
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
    classroomInSession,
    refreshEntitlements,
    setActiveTab,
    setPhase,
    startVT,
  ])

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
    wzViewOnly,
    zwViewOnly,
    lfViewOnly,
    goToWortzwillingGame,
    goToZeitenwendeGame,
  }
}
