import { useCallback, useEffect, useRef, useState } from 'react'
import { API } from '../config'
import { getMedal } from '../utils/gameLogic'
import { getPlayedToday, savePlayedGame } from '../utils/dailyProgress'

export function useKollokationenGame({ keys, serverDatum, lemmata }) {
  const [phase, setPhase] = useState('home')
  const [selectedLemma, setSelectedLemma] = useState(null)
  const [currentRound, setCurrentRound] = useState(0)
  const [roundScores, setRoundScores] = useState([])
  const [bonusQuestion, setBonusQuestion] = useState(null)
  const [fetchBonus, setFetchBonus] = useState(false)

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
      setCurrentRound(0)
      setRoundScores([])
      setBonusQuestion(null)
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!fetchBonus || !selectedLemma) return

    setFetchBonus(false)
    fetch(`${API}/bonus?id=${selectedLemma.id}`)
      .then((response) => response.json())
      .then((bonus) => {
        setBonusQuestion(bonus?.options ? bonus : { skipped: true })
        setCurrentRound(3)
      })
      .catch(() => {
        setBonusQuestion({ skipped: true })
        setCurrentRound(3)
      })
  }, [fetchBonus, selectedLemma])

  useEffect(() => {
    if (roundScores.length === 4 && phase === 'quiz') {
      freshKollRef.current = true
      setPhase('results')
    }
  }, [phase, roundScores.length])

  const persistResults = useCallback((submitRetro) => {
    if (phase !== 'results' || !selectedLemma || roundScores.length === 0) return

    const total = roundScores.reduce((sum, value) => sum + value, 0)
    const hasBonus = roundScores.length >= 4
    const maxPoints = hasBonus ? 10 : 9
    const medal = getMedal(total, maxPoints)

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
      fetch(`${API}/stats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'kollokationen', datum: serverDatum, score: total, max: 10 }),
      }).catch(() => {})

      submitRetro?.({ game: 'kollokationen', score: total, maxScore: maxPoints })
    }
  }, [keys, lemmata?.length, phase, roundScores, selectedLemma, serverDatum])

  const handleLemmaSelect = useCallback((lemma) => {
    setSelectedLemma(lemma)
    setCurrentRound(0)
    setRoundScores([])
    setBonusQuestion(null)
    setPhase('quiz')
  }, [])

  const handleRoundComplete = useCallback((score) => {
    setRoundScores((prev) => {
      const next = [...prev, score]
      if (next.length === 3) setFetchBonus(true)
      else if (next.length < 4) setCurrentRound((round) => round + 1)
      return next
    })
  }, [])

  const handleViewResult = useCallback(() => {}, [])

  const openPlayedResult = useCallback((lemmaId) => {
    const played = getPlayedToday(keys.todayKey).find((entry) => entry.id === lemmaId)
    const lemma = lemmata?.find((entry) => entry.id === lemmaId)
    if (!played || !lemma) return

    setSelectedLemma(lemma)
    setRoundScores(played.scores ?? [])
    setBonusQuestion(null)
    setPhase('results')
  }, [keys.todayKey, lemmata])

  const resetToHome = useCallback(() => {
    setSelectedLemma(null)
    setCurrentRound(0)
    setRoundScores([])
    setBonusQuestion(null)
    setPhase('home')
  }, [])

  return {
    phase,
    setPhase,
    selectedLemma,
    currentRound,
    roundScores,
    bonusQuestion,
    isBonus: phase === 'quiz' && currentRound === 3 && !!bonusQuestion,
    persistResults,
    handleLemmaSelect,
    handleRoundComplete,
    handleViewResult: openPlayedResult,
    handleRestart: resetToHome,
    backToSelection: () => setPhase('selection'),
    backToHome: resetToHome,
  }
}
