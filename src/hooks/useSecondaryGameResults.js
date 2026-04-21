import { useCallback, useEffect } from 'react'
import { API } from '../config'
import { lsSet } from '../utils/storage'
import { getMedal, getZRMedal } from '../utils/gameLogic'
import { getPlayedToday, markActivity, saveWZHistory, saveZRHistory, saveZWHistory } from '../utils/dailyProgress'

export function useSecondaryGameResults({
  keys,
  serverDatum,
  zeitreise,
  wortzwilling,
  zeitenwende,
  zrPlayed,
  wzPlayed,
  zwPlayed,
  setZrPlayed,
  setWzPlayed,
  setZwPlayed,
  classroomSubmitRef,
  getRetroResultsRef,
}) {
  const handleWZFinish = useCallback(({ score, zoneA, zoneB }) => {
    if (!wortzwilling || !serverDatum) return

    const medal = getMedal(score, 10)
    const entry = {
      lemma: `${wortzwilling.wortA} / ${wortzwilling.wortB}`,
      total: score,
      medal,
      wortA: wortzwilling.wortA,
      wortB: wortzwilling.wortB,
      zoneA,
      zoneB,
    }

    lsSet(`sig_wz_${serverDatum}`, JSON.stringify(entry))
    setWzPlayed(entry)
    markActivity(keys.dateStr)
    saveWZHistory(keys.dateStr, medal.label, medal.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'wortzwilling', datum: serverDatum, score, max: 10 }),
    }).catch(() => {})
    classroomSubmitRef.current?.({ game: 'wortzwilling', score, maxScore: 10 })
  }, [classroomSubmitRef, keys.dateStr, serverDatum, setWzPlayed, wortzwilling])

  const handleZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!zeitenwende || !serverDatum) return

    const medal = getMedal(score, 10)
    const entry = { lemma: zeitenwende.lemma, total: score, medal, answers }

    lsSet(`sig_zw_${serverDatum}`, JSON.stringify(entry))
    setZwPlayed(entry)
    markActivity(keys.dateStr)
    saveZWHistory(keys.dateStr, medal.label, medal.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitenwende', datum: serverDatum, score, max: 10 }),
    }).catch(() => {})
    classroomSubmitRef.current?.({ game: 'zeitenwende', score, maxScore: 10 })
  }, [classroomSubmitRef, keys.dateStr, serverDatum, setZwPlayed, zeitenwende])

  const handleZeitreiseFinish = useCallback((score, placements) => {
    if (!zeitreise) return

    const max = zeitreise.paare.length * 2
    const medal = getZRMedal(score, max)
    const entry = { lemma: zeitreise.lemma, total: score, max, medal, placements }

    lsSet(keys.todayZRKey, JSON.stringify(entry))
    setZrPlayed(entry)
    markActivity(keys.dateStr)
    saveZRHistory(keys.dateStr, medal.label, medal.emoji)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitreise', datum: serverDatum, score, max }),
    }).catch(() => {})
    classroomSubmitRef.current?.({ game: 'zeitreise', score, maxScore: max })
  }, [classroomSubmitRef, keys.dateStr, keys.todayZRKey, serverDatum, setZrPlayed, zeitreise])

  useEffect(() => {
    getRetroResultsRef.current = () => {
      const results = []
      const played = getPlayedToday(keys.todayKey)

      for (const game of played) {
        if (game.total != null) {
          const maxScore = Array.isArray(game.scores) && game.scores.length >= 4 ? 10 : 9
          results.push({ game: 'kollokationen', score: game.total, maxScore })
        }
      }

      if (zrPlayed?.total != null) results.push({ game: 'zeitreise', score: zrPlayed.total, maxScore: zrPlayed.max ?? 10 })
      if (wzPlayed?.total != null) results.push({ game: 'wortzwilling', score: wzPlayed.total, maxScore: 10 })
      if (zwPlayed?.total != null) results.push({ game: 'zeitenwende', score: zwPlayed.total, maxScore: 10 })

      return results
    }
  }, [getRetroResultsRef, keys.todayKey, zrPlayed, wzPlayed, zwPlayed])

  return {
    handleWZFinish,
    handleZeitenwendeFinish,
    handleZeitreiseFinish,
  }
}
