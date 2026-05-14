import { useCallback } from 'react'
import { lsSet } from '../utils/storage'
import { getMedal } from '../utils/gameLogic'
import { postStat } from '../api/stats'

export function useSpezialwocheResults({
  spezialwoche,
  setSwWzPlayed,
  setSwZwPlayed,
  setSwLfPlayed,
}) {
  const handleSwWZFinish = useCallback(({ score, zoneA, zoneB }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = {
      lemma: `${spezialwoche.wortzwilling.wortA} / ${spezialwoche.wortzwilling.wortB}`,
      total: score, medal, zoneA, zoneB,
    }
    lsSet(`sig_sw_wz_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwWzPlayed(entry)
    postStat('wortzwilling', spezialwoche.von, score, 10)
  }, [spezialwoche, setSwWzPlayed])

  const handleSwZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.zeitenwende.lemma, total: score, medal, answers }
    lsSet(`sig_sw_zw_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwZwPlayed(entry)
    postStat('zeitenwende', spezialwoche.von, score, 10)
  }, [spezialwoche, setSwZwPlayed])

  const handleSwLFFinish = useCallback(({ score, scores }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.lueckenfuellerLemma?.lemma ?? '', total: score, scores, medal }
    lsSet(`sig_sw_lf_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwLfPlayed(entry)
    postStat('lueckenfueller', spezialwoche.von, score, 10)
  }, [spezialwoche, setSwLfPlayed])

  return {
    handleSwWZFinish,
    handleSwZeitenwendeFinish,
    handleSwLFFinish,
  }
}
