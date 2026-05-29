import { useCallback } from 'react'
import { lsSet } from '../utils/storage'
import { getMedal } from '../utils/gameLogic'
import { markActivity, saveWZHistory, saveZWHistory, saveLFHistory } from '../utils/dailyProgress'
import { postStat } from '../api/stats'

export function useSecondaryGameResults({
  keys,
  serverDatum,
  wortzwilling,
  zeitenwende,
  lueckenfuellerLemma,
  setWzPlayed,
  setZwPlayed,
  setLfPlayed,
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
    postStat('wortzwilling', serverDatum, score, 10)
  }, [keys.dateStr, serverDatum, setWzPlayed, wortzwilling])

  const handleLFFinish = useCallback(({ score, scores }) => {
    if (!serverDatum) return
    const medal = getMedal(score, 10)
    const entry = {
      lemma: lueckenfuellerLemma?.lemma ?? '',
      total: score,
      scores,
      medal,
    }
    lsSet(`sig_lf_${serverDatum}`, JSON.stringify(entry))
    setLfPlayed(entry)
    markActivity(keys.dateStr)
    saveLFHistory(keys.dateStr, medal.label, medal.emoji)
    postStat('lueckenfueller', serverDatum, score, 10)
  }, [keys.dateStr, lueckenfuellerLemma, serverDatum, setLfPlayed])

  const handleZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!zeitenwende || !serverDatum) return

    const medal = getMedal(score, 10)
    const entry = { lemma: zeitenwende.lemma, total: score, medal, answers }

    lsSet(`sig_zw_${serverDatum}`, JSON.stringify(entry))
    setZwPlayed(entry)
    markActivity(keys.dateStr)
    saveZWHistory(keys.dateStr, medal.label, medal.emoji)
    postStat('zeitenwende', serverDatum, score, 10)
  }, [keys.dateStr, serverDatum, setZwPlayed, zeitenwende])

  return {
    handleWZFinish,
    handleZeitenwendeFinish,
    handleLFFinish,
  }
}
