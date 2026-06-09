import { useCallback, useEffect, useRef, useState } from 'react'
import { getMedal } from '../utils/gameLogic'
import { getPlayedToday, savePlayedGame } from '../utils/dailyProgress'
import { postStat } from '../api/stats'

export function useKollokationenGame({ keys, serverDatum, lemmata }) {
  const [phase, setPhase] = useState('home')
  const [selectedLemma, setSelectedLemma] = useState(null)
  const [roundScores, setRoundScores] = useState([])

  const freshKollRef = useRef(false)
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
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (roundScores.length === 1 && phase === 'quiz') {
      freshKollRef.current = true
      setPhase('results')
    }
  }, [phase, roundScores.length])

  const persistResults = useCallback(() => {
    if (phase !== 'results' || !selectedLemma || roundScores.length === 0) return
    // Selbst gewählte Lemmata (Eigenes Lemma) sind reines Üben: nicht in die
    // Tageswertung/Statistik schreiben.
    if (selectedLemma.isCustom) return

    const total     = roundScores.reduce((sum, value) => sum + value, 0)
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
      scores: roundScores,
    })

    if (freshKollRef.current && serverDatum) {
      freshKollRef.current = false
      postStat('kollokationen', serverDatum, total, 10)
    }
  }, [keys, lemmata?.length, phase, roundScores, selectedLemma, serverDatum])

  const handleLemmaSelect = useCallback((lemma) => {
    setSelectedLemma(lemma)
    setRoundScores([])
    setPhase('quiz')
  }, [])

  const handleRoundComplete = useCallback((score) => {
    setRoundScores((prev) => [...prev, score])
  }, [])

  const openPlayedResult = useCallback((lemmaId) => {
    const played = getPlayedToday(keys.todayKey).find((entry) => entry.id === lemmaId)
    const lemma = lemmata?.find((entry) => entry.id === lemmaId)
    if (!played || !lemma) return

    setSelectedLemma(lemma)
    setRoundScores(played.scores ?? [])
    setPhase('results')
  }, [keys.todayKey, lemmata])

  const resetToHome = useCallback(() => {
    setSelectedLemma(null)
    setRoundScores([])
    setPhase('home')
  }, [])

  return {
    phase,
    setPhase,
    selectedLemma,
    currentRound: 0,
    roundScores,
    bonusQuestion: null,
    isBonus: false,
    persistResults,
    handleLemmaSelect,
    handleRoundComplete,
    handleViewResult: openPlayedResult,
    handleRestart: resetToHome,
    backToSelection: () => setPhase('selection'),
    backToHome: resetToHome,
  }
}
