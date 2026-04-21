import { useMemo } from 'react'
import { getPlayedToday } from '../utils/dailyProgress'

export function useAppDailyState({ todayKey, lemmata }) {
  return useMemo(() => {
    const playedGames = getPlayedToday(todayKey)
    const playedIds = playedGames.map((game) => game.id)
    const allPlayed = lemmata?.length > 0 && lemmata.every((lemma) => playedIds.includes(lemma.id))

    return {
      playedGames,
      playedIds,
      allPlayed,
    }
  }, [lemmata, todayKey])
}
