import { useMemo } from 'react'

export function useAppGameScreens({
  startVT,
  setPhase,
  handleLemmaSelect,
  handleViewResult,
  backToHome,
  backToSelection,
  handleRestart,
}) {
  return useMemo(() => ({
    onLemmaSelect: (lemma) => startVT(() => handleLemmaSelect(lemma)),
    onViewResult: (lemmaId) => startVT(() => handleViewResult(lemmaId)),
    onBackToHome: () => startVT(() => backToHome()),
    onBackToSelection: () => startVT(() => backToSelection()),
    onRestart: () => startVT(() => handleRestart()),
    onWortzwillingBack: () => startVT(() => setPhase('home')),
    onZeitenwendeBack: () => startVT(() => backToHome()),
  }), [
    backToHome,
    backToSelection,
    handleLemmaSelect,
    handleRestart,
    handleViewResult,
    setPhase,
    startVT,
  ])
}
