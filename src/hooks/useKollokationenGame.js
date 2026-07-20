import { useCallback, useEffect, useRef, useState } from 'react'
import { getMedal } from '../utils/gameLogic'
import { getPlayedToday, savePlayedGame } from '../utils/dailyProgress'
import { postStat } from '../api/stats'

export function useKollokationenGame({ keys, serverDatum, lemmata }) {
  const [phase, setPhase] = useState('home')
  const [selectedLemma, setSelectedLemma] = useState(null)
  const [roundScores, setRoundScores] = useState([])
  // Ansicht einer bereits gespielten Runde (Klick auf "Ergebnis ansehen"):
  // Quiz zeigt sich dann direkt im ausgewerteten Zustand, keine eigene
  // Ergebnis-Phase mehr.
  const [savedSelected, setSavedSelected] = useState(null)

  const inGameRef = useRef(false)

  useEffect(() => {
    if (phase === 'home') {
      inGameRef.current = false
      return
    }
    if (!inGameRef.current) {
      window.history.pushState({ sig: true }, '')
      inGameRef.current = true
    }
  }, [phase])

  useEffect(() => {
    function onPop() {
      inGameRef.current = false
      setPhase('home')
      setSelectedLemma(null)
      setRoundScores([])
      setSavedSelected(null)
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const handleLemmaSelect = useCallback((lemma) => {
    setSelectedLemma(lemma)
    setRoundScores([])
    setSavedSelected(null)
    setPhase('quiz')
  }, [])

  // Wird direkt beim Auswerten in Quiz aufgerufen (kein Extra-Klick/Phase
  // mehr) — persistiert das Ergebnis und meldet die Tagesstatistik.
  const handleRoundComplete = useCallback((score, selectedWords) => {
    setRoundScores([score])

    if (!selectedLemma || selectedLemma.isCustom) return

    const total     = score
    const maxPoints = 10
    const medal     = getMedal(total, maxPoints)

    savePlayedGame({
      keys,
      lemmaId: selectedLemma.id,
      lemmaName: selectedLemma.lemma,
      lemmaPos: selectedLemma.pos || 'Substantiv',
      total,
      medal,
      lemmataLength: lemmata?.length,
      scores: [score],
      selected: selectedWords,
    })

    if (serverDatum) postStat('kollokationen', serverDatum, total, 10)
  }, [keys, lemmata, selectedLemma, serverDatum])

  const openPlayedResult = useCallback((lemmaId) => {
    const played = getPlayedToday(keys.todayKey).find((entry) => entry.id === lemmaId)
    const lemma = lemmata?.find((entry) => entry.id === lemmaId)
    if (!played || !lemma) return

    setSelectedLemma(lemma)
    setRoundScores(played.scores ?? [])
    setSavedSelected(played.selected ?? [])
    setPhase('quiz')
  }, [keys.todayKey, lemmata])

  const resetToHome = useCallback(() => {
    setSelectedLemma(null)
    setRoundScores([])
    setSavedSelected(null)
    setPhase('home')
  }, [])

  return {
    phase,
    setPhase,
    selectedLemma,
    currentRound: 0,
    roundScores,
    savedSelected,
    bonusQuestion: null,
    isBonus: false,
    handleLemmaSelect,
    handleRoundComplete,
    handleViewResult: openPlayedResult,
    handleRestart: resetToHome,
    backToSelection: () => setPhase('selection'),
    backToHome: resetToHome,
  }
}
