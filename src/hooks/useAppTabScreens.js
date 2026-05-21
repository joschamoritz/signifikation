import { useCallback, useState } from 'react'
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
  freeAccessToday,
  freeAccessLabel,
  serverDatum,
  classroomInSession,
  setActiveTab,
  // Spezialwoche
  spezialwoche,
  swWzPlayed,
  swZwPlayed,
  swLfPlayed,
}) {
  const [wzViewOnly, setWzViewOnly] = useState(false)
  const [zwViewOnly, setZwViewOnly] = useState(false)
  const [lfViewOnly, setLfViewOnly] = useState(false)
  const [swWzViewOnly, setSwWzViewOnly] = useState(false)
  const [swZwViewOnly, setSwZwViewOnly] = useState(false)
  const [swLfViewOnly, setSwLfViewOnly] = useState(false)

  const tabScreens = AppTabScreens({
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
    lueckenfuellerLemma,
    lfPlayed,
    onPlayLueckenfueller: lueckenfuellerLemma?.lueckenfueller ? {
      play: () => startVT(() => {
        setLfViewOnly(false)
        setPhase('lueckenfueller-selection')
      }),
    } : null,
    gesamtausgabeUnlocked,
    freeAccessToday,
    freeAccessLabel,
    serverDatum,
    classroomInSession,
    onNavigateToKonto: () => setActiveTab('profil'),
  })

  const goToWortzwillingGame = useCallback(() => startVT(() => {
    setWzViewOnly(false)
    setPhase('wortzwilling')
  }), [setPhase, startVT])

  const viewWortzwillingResult = useCallback(() => startVT(() => {
    setWzViewOnly(true)
    setPhase('wortzwilling')
  }), [setPhase, startVT])

  const goToZeitenwendeGame = useCallback(() => startVT(() => {
    setZwViewOnly(false)
    setPhase('zeitenwende')
  }), [setPhase, startVT])

  const viewZeitenwendeResult = useCallback(() => startVT(() => {
    setZwViewOnly(true)
    setPhase('zeitenwende')
  }), [setPhase, startVT])

  const goToSwWzGame = useCallback(() => startVT(() => {
    setSwWzViewOnly(false)
    setPhase('sw-wz')
  }), [setPhase, startVT])

  const goToSwZeitenwendeGame = useCallback(() => startVT(() => {
    setSwZwViewOnly(false)
    setPhase('sw-zeitenwende')
  }), [setPhase, startVT])

  const goToLueckenfuellerGame = useCallback(() => startVT(() => {
    setLfViewOnly(false)
    setPhase('lueckenfueller')
  }), [setPhase, startVT])

  const viewLueckenfuellerResult = useCallback(() => startVT(() => {
    setLfViewOnly(true)
    setPhase('lueckenfueller')
  }), [setPhase, startVT])

  const goToSwLfGame = useCallback(() => startVT(() => {
    setSwLfViewOnly(false)
    setPhase('sw-lf')
  }), [setPhase, startVT])

  const viewSwWz = useCallback(() => startVT(() => {
    setSwWzViewOnly(true)
    setPhase('sw-wz')
  }), [setPhase, startVT])

  const viewSwZw = useCallback(() => startVT(() => {
    setSwZwViewOnly(true)
    setPhase('sw-zeitenwende')
  }), [setPhase, startVT])

  const viewSwLf = useCallback(() => startVT(() => {
    setSwLfViewOnly(true)
    setPhase('sw-lf')
  }), [setPhase, startVT])

  return {
    tabScreens,
    wzViewOnly,
    zwViewOnly,
    lfViewOnly,
    goToWortzwillingGame,
    viewWortzwillingResult,
    goToZeitenwendeGame,
    viewZeitenwendeResult,
    goToLueckenfuellerGame,
    viewLueckenfuellerResult,
    swWzViewOnly,
    swZwViewOnly,
    swLfViewOnly,
    goToSwWzGame,
    goToSwZeitenwendeGame,
    goToSwLfGame,
    viewSwWz,
    viewSwZw,
    viewSwLf,
  }
}
