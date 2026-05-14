import { useMemo, useState } from 'react'

export function useAppGameScreens({
  startVT,
  setPhase,
  handleLemmaSelect,
  handleViewResult,
  backToHome,
  backToSelection,
  handleRestart,
}) {
  const [lfProgress, setLfProgress] = useState(null)
  const [zwProgress, setZwProgress] = useState(null)

  const actions = useMemo(() => ({
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
  ])

  return { ...actions, lfProgress, zwProgress }
}
