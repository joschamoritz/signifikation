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
  loggedIn,
  serverDatum,
  setActiveTab,
}) {
  const [wzViewOnly, setWzViewOnly] = useState(false)
  const [zwViewOnly, setZwViewOnly] = useState(false)
  const [lfViewOnly, setLfViewOnly] = useState(false)
  const [swWzViewOnly, setSwWzViewOnly] = useState(false)
  const [swZwViewOnly, setSwZwViewOnly] = useState(false)
  const [swLfViewOnly, setSwLfViewOnly] = useState(false)

  // Stabile Callback-Identitaeten (F-M2): die frueheren Inline-Literale
  // ({ play: () => … }) wurden bei JEDEM Render neu erzeugt — zusammen mit
  // dem direkten Funktionsaufruf von AppTabScreens bekam <Home> damit bei
  // jedem State-Tick des App-Modells neue Props und renderte komplett neu
  // (inkl. computeStreak()-localStorage-Scan).
  const canStart = !!(lemmata && !apiError)
  const onStart = useCallback(
    () => startVT(() => setPhase(canStart ? 'selection' : 'home')),
    [startVT, setPhase, canStart],
  )
  const onPlayWortzwilling = useMemo(() => ({
    play: () => startVT(() => {
      setWzViewOnly(false)
      setPhase('wortzwilling-selection')
    }),
  }), [startVT, setPhase])
  const onPlayZeitenwende = useMemo(() => ({
    play: () => startVT(() => {
      setZwViewOnly(false)
      setPhase('zeitenwende-selection')
    }),
  }), [startVT, setPhase])
  const hasLueckenfueller = !!lueckenfuellerLemma?.lueckenfueller
  const onPlayLueckenfueller = useMemo(() => hasLueckenfueller ? {
    play: () => startVT(() => {
      setLfViewOnly(false)
      setPhase('lueckenfueller-selection')
    }),
  } : null, [hasLueckenfueller, startVT, setPhase])
  const onNavigateToKonto = useCallback(() => setActiveTab('profil'), [setActiveTab])
  // Archiv „Heutiges Wort spielen" → zurück zum Spielmodi-Tag.
  const onGoToSpielmodi = useCallback(() => startVT(() => {
    setPhase('home')
    setActiveTab('spielmodi')
  }), [startVT, setPhase, setActiveTab])

  // useMemo statt Komponenten-Aufruf pro Render: die Elemente behalten ihre
  // Identitaet, solange sich keine Abhaengigkeit aendert — React bailed dann
  // beim Re-Render des Parents komplett aus (memo auf Home/KursTab greift
  // zusaetzlich bei geaenderten, aber gleichen Props).
  const tabScreens = useMemo(() => AppTabScreens({
    phase,
    lemmata,
    apiError,
    thema,
    playedGames,
    allPlayed,
    onStart,
    wortzwilling,
    wortzwillingError,
    onRetryWortzwilling: retryWortzwilling,
    wzPlayed,
    onPlayWortzwilling,
    zeitenwende,
    zeitenwendeError,
    zeitenwendeMissing,
    onRetryZeitenwende: retryZeitenwende,
    zwPlayed,
    onPlayZeitenwende,
    lueckenfuellerLemma,
    lfPlayed,
    onPlayLueckenfueller,
    gesamtausgabeUnlocked,
    loggedIn,
    serverDatum,
    onNavigateToKonto,
    onGoToSpielmodi,
  }), [
    phase, lemmata, apiError, thema, playedGames, allPlayed, onStart,
    wortzwilling, wortzwillingError, retryWortzwilling, wzPlayed, onPlayWortzwilling,
    zeitenwende, zeitenwendeError, zeitenwendeMissing, retryZeitenwende, zwPlayed, onPlayZeitenwende,
    lueckenfuellerLemma, lfPlayed, onPlayLueckenfueller,
    gesamtausgabeUnlocked, loggedIn, serverDatum, onNavigateToKonto, onGoToSpielmodi,
  ])

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
