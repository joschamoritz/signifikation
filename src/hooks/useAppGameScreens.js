import { useMemo } from 'react'

export function useAppGameScreens({
  startVT,
  setPhase,
  handleLemmaSelect,
  handleViewResult,
  backToHome,
  backToSelection,
  handleRestart,
  setLfProgress,
  setZwProgress,
}) {
  return useMemo(() => ({
    onLemmaSelect: (lemma) => startVT(() => handleLemmaSelect(lemma)),
    onViewResult: (lemmaId) => startVT(() => handleViewResult(lemmaId)),
    onBackToHome: () => startVT(() => backToHome()),
    onBackToSelection: () => startVT(() => backToSelection()),
    onRestart: () => startVT(() => handleRestart()),
    onWortzwillingBack: () => startVT(() => setPhase('home')),
    onZeitenwendeBack: (progress) => startVT(() => { setZwProgress(progress ?? null); backToHome() }),
    onWortzwillingSelectionBack: () => startVT(() => setPhase('home')),
    onZeitenwendeSelectionBack: () => startVT(() => setPhase('home')),
    onLueckenfuellerSelectionBack: () => startVT(() => setPhase('home')),
    onLueckenfuellerBack: (progress) => startVT(() => { setLfProgress(progress ?? null); setPhase('home') }),
  }), [
    backToHome,
    backToSelection,
    handleLemmaSelect,
    handleRestart,
    handleViewResult,
    setPhase,
    startVT,
    setLfProgress,
    setZwProgress,
  ])
}
