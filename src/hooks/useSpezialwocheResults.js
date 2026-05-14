import { useCallback } from 'react'
import { API } from '../config'
import { lsSet } from '../utils/storage'
import { getMedal } from '../utils/gameLogic'

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
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'wortzwilling', datum: spezialwoche.von, score, max: 10 }),
    }).catch(() => {})
  }, [spezialwoche, setSwWzPlayed])

  const handleSwZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.zeitenwende.lemma, total: score, medal, answers }
    lsSet(`sig_sw_zw_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwZwPlayed(entry)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'zeitenwende', datum: spezialwoche.von, score, max: 10 }),
    }).catch(() => {})
  }, [spezialwoche, setSwZwPlayed])

  const handleSwLFFinish = useCallback(({ score, scores }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.lueckenfuellerLemma?.lemma ?? '', total: score, scores, medal }
    lsSet(`sig_sw_lf_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwLfPlayed(entry)
    fetch(`${API}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'lueckenfueller', datum: spezialwoche.von, score, max: 10 }),
    }).catch(() => {})
  }, [spezialwoche, setSwLfPlayed])

  return {
    handleSwWZFinish,
    handleSwZeitenwendeFinish,
    handleSwLFFinish,
  }
}
