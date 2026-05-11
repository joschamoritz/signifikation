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
    onPlayLueckenfueller: lueckenfuellerLemma?.lueckenfueller ? {
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
    // Spezialwoche
    spezialwoche,
    swWzPlayed,
    swZwPlayed,
    swLfPlayed,
    onPlaySwKoll: () => startVT(() => setPhase('selection')),  // nutzt reguläre LemmaSelection
    onViewSwKoll: () => startVT(() => setPhase('selection')),
    onPlaySwWz: spezialwoche?.wortzwilling ? {
      play: () => startVT(() => { setSwWzViewOnly(false); setPhase('sw-wz-selection') }),
    } : null,
    onViewSwWz: () => startVT(() => { setSwWzViewOnly(true); setPhase('sw-wz') }),
    onPlaySwZw: {
      play: () => startVT(() => { setSwZwViewOnly(false); setPhase('sw-zeitenwende-selection') }),
    },
    onViewSwZw: () => startVT(() => { setSwZwViewOnly(true); setPhase('sw-zeitenwende') }),
    onPlaySwLf: spezialwoche?.lueckenfuellerLemma?.lueckenfueller ? {
      play: () => startVT(() => { setSwLfViewOnly(false); setPhase('sw-lf') }),
    } : null,
    onViewSwLf: () => startVT(() => { setSwLfViewOnly(true); setPhase('sw-lf') }),
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
    spezialwoche,
    swWzPlayed,
    swZwPlayed,
    swLfPlayed,
    setSwWzViewOnly,
    setSwZwViewOnly,
    setSwLfViewOnly,
  ])

  const goToWortzwillingGame = useCallback(() => startVT(() => {
    setWzViewOnly(false)
    setPhase('wortzwilling')
  }), [setPhase, startVT])

  const goToZeitenwendeGame = useCallback(() => startVT(() => {
    setZwViewOnly(false)
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

  return {
    tabScreens,
    wzViewOnly,
    zwViewOnly,
    lfViewOnly,
    goToWortzwillingGame,
    goToZeitenwendeGame,
    swWzViewOnly,
    swZwViewOnly,
    swLfViewOnly,
    goToSwWzGame,
    goToSwZeitenwendeGame,
  }
}
