import { useCallback } from 'react'
import { lsSet } from '../utils/storage'
import { getMedal } from '../utils/gameLogic'
import { postStat } from '../api/stats'

// Statistik: Spiele zum Wort der Woche gehen unter `woche_<modus>` und mit dem Tag, an dem gespielt wurde, an den
// Server (nicht mehr auf den Montag der Woche unter dem Tagesmodus). Sonst mischte der Montag zwei verschiedene
// Spiele, und die Auswertung konnte die Wochenspiele nicht vom Tagesspiel trennen. Ältere App-Versionen melden
// weiter auf den Montag; der Server nimmt beides an.
export function useSpezialwocheResults({
  spezialwoche,
  serverDatum,
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
    if (serverDatum) postStat('woche_wortzwilling', serverDatum, score, 10)
  }, [spezialwoche, serverDatum, setSwWzPlayed])

  const handleSwZeitenwendeFinish = useCallback(({ score, answers }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.zeitenwende.lemma, total: score, medal, answers }
    lsSet(`sig_sw_zw_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwZwPlayed(entry)
    if (serverDatum) postStat('woche_zeitenwende', serverDatum, score, 10)
  }, [spezialwoche, serverDatum, setSwZwPlayed])

  const handleSwLFFinish = useCallback(({ score, scores }) => {
    if (!spezialwoche) return
    const medal = getMedal(score, 10)
    const entry = { lemma: spezialwoche.lueckenfuellerLemma?.lemma ?? '', total: score, scores, medal }
    lsSet(`sig_sw_lf_${spezialwoche.woche}`, JSON.stringify(entry))
    setSwLfPlayed(entry)
    if (serverDatum) postStat('woche_lueckenfueller', serverDatum, score, 10)
  }, [spezialwoche, serverDatum, setSwLfPlayed])

  return {
    handleSwWZFinish,
    handleSwZeitenwendeFinish,
    handleSwLFFinish,
  }
}
