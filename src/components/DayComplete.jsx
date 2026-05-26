import { useState, useEffect, useRef } from 'react'
import { WEEKDAYS, MONTHS, computeStreak, buildShareText, localDateStr } from '../utils/homeUtils'
import { getMedal } from '../utils/gameLogic'
import { shareAsImage } from '../utils/shareImage'
import { API } from '../config.js'
import { logError } from '../utils/logError'
import Sheet from './ui/Sheet'

export default function DayComplete({ onClose, playedGames = [], wzPlayed = null, zwPlayed = null, lfPlayed = null, serverDatum = null }) {
  const [open,        setOpen]        = useState(true)
  const [copied,      setCopied]      = useState(false)
  const [sharing,     setSharing]     = useState(false)
  const [imgState,    setImgState]    = useState(null) // 'shared' | 'downloaded' | null
  const [percentiles, setPercentiles] = useState({})

  const today   = new Date()
  const datum   = serverDatum ?? localDateStr(today)
  const weekday = WEEKDAYS[today.getDay()]
  const date    = `${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`
  const streak  = computeStreak()

  const kollTotal = playedGames.reduce((s, g) => s + g.total, 0)
  const kollMax   = playedGames.length * 10
  const kollMedal = getMedal(kollTotal, kollMax)

  // „Perfekter Tag": alle gespielten Modi mit Goldmedaille
  const isPerfect =
    kollMedal.label === 'Gold' &&
    (!wzPlayed || wzPlayed.medal?.label === 'Gold') &&
    (!zwPlayed || zwPlayed.medal?.label === 'Gold') &&
    (!lfPlayed || lfPlayed.medal?.label === 'Gold')

  // Mount-Only-Snapshot: Sheet ist modal, während es offen ist ändern sich
  // die Spiel-Ergebnisse nicht. Ref hält Werte vom ersten Render fest, damit
  // späteres Parent-Re-Render (z. B. Stats-Update) keinen erneuten Fetch
  // auslöst. Ohne Ref wäre die Effect-Logik abhängig von Array-Identity der
  // playedGames-Prop.
  const initialQueryDataRef = useRef({
    playedGames, kollTotal, kollMax, wzPlayed, zwPlayed, lfPlayed, datum,
  })

  useEffect(() => {
    const {
      playedGames: pg, kollTotal: kt, kollMax: km,
      wzPlayed: wz, zwPlayed: zw, lfPlayed: lf, datum: d,
    } = initialQueryDataRef.current

    const queries = []
    if (pg.length > 0) queries.push({ game: 'kollokationen', score: kt, max: km })
    if (wz) queries.push({ game: 'wortzwilling',  score: wz.total, max: 10 })
    if (zw) queries.push({ game: 'zeitenwende',   score: zw.total, max: 10 })
    if (lf) queries.push({ game: 'lueckenfueller', score: lf.total, max: 10 })

    Promise.all(queries.map(({ game, score, max }) =>
      fetch(`${API}/percentile?datum=${d}&game=${game}&score=${score}&max=${max}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => [game, data?.available ? data.percentile : null])
        .catch(() => [game, null])
    )).then(results => {
      setPercentiles(Object.fromEntries(results))
    })
  }, [])

  async function share() {
    const text = buildShareText(playedGames, wzPlayed, streak, zwPlayed, lfPlayed)
    if (navigator.share) {
      try { await navigator.share({ text }); return } catch {
        // User-Abbruch oder unsupported – fällt auf clipboard zurück.
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch (err) {
      logError('DayComplete.share.clipboard', err)
    }
  }

  async function shareImg() {
    if (sharing) return
    setSharing(true)
    try {
      const result = await shareAsImage(playedGames, wzPlayed, streak, zwPlayed, lfPlayed)
      if (result === 'shared' || result === 'downloaded') {
        setImgState(result)
        setTimeout(() => setImgState(null), 2500)
      }
    } catch {
      // still show text fallback silently
    } finally {
      setSharing(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} aria-labelledby="dc-title">
      <Sheet.Header />

      <header className="dc-header">
        <span className="dc-weekday">{weekday}</span>
        <h2 className="dc-date" id="dc-title">{date}</h2>
      </header>

      <div className="dc-rule" />

      <div className="dc-medals">
        <div className="dc-medal-item" aria-label={`${kollMedal.label}: Kollokationen`}>
          <span className="dc-medal-emoji" aria-hidden="true">{kollMedal.emoji}</span>
          <span className="dc-medal-label">Kollokationen</span>
          {percentiles.kollokationen != null && (
            <span className="dc-percentile">besser als {percentiles.kollokationen} %</span>
          )}
        </div>
        {wzPlayed && (
          <div className="dc-medal-item" aria-label={wzPlayed.medal ? `${wzPlayed.medal.label}: Wort-Zwilling` : 'Wort-Zwilling'}>
            <span className="dc-medal-emoji" aria-hidden="true">{wzPlayed.medal?.emoji}</span>
            <span className="dc-medal-label">Wort-Zwilling</span>
            {percentiles.wortzwilling != null && (
              <span className="dc-percentile">besser als {percentiles.wortzwilling} %</span>
            )}
          </div>
        )}
        {zwPlayed && (
          <div className="dc-medal-item" aria-label={zwPlayed.medal ? `${zwPlayed.medal.label}: Zeitenwende` : 'Zeitenwende'}>
            <span className="dc-medal-emoji" aria-hidden="true">{zwPlayed.medal?.emoji}</span>
            <span className="dc-medal-label">Zeitenwende</span>
            {percentiles.zeitenwende != null && (
              <span className="dc-percentile">besser als {percentiles.zeitenwende} %</span>
            )}
          </div>
        )}
        {lfPlayed && (
          <div className="dc-medal-item" aria-label={lfPlayed.medal ? `${lfPlayed.medal.label}: Lückenfüller` : 'Lückenfüller'}>
            <span className="dc-medal-emoji" aria-hidden="true">{lfPlayed.medal?.emoji}</span>
            <span className="dc-medal-label">Lückenfüller</span>
            {percentiles.lueckenfueller != null && (
              <span className="dc-percentile">besser als {percentiles.lueckenfueller} %</span>
            )}
          </div>
        )}
      </div>

      <div className="dc-rule" />

      <div className="dc-footer">
        {streak > 0 && (
          <p className="dc-streak">🔥 {streak} {streak === 1 ? 'Tag' : 'Tage'}</p>
        )}
        <p className="dc-ornament" aria-hidden="true">· · ·</p>
        <p className="dc-colophon">Der Eintrag für diesen Tag ist beschlossen.</p>
        {isPerfect && (
          <span className="dc-stamp" aria-label="Bestleistung in allen Modi">rev. &amp; approb.</span>
        )}
      </div>

      <div className="dc-actions">
        <button
          className={`btn-ghost dc-share-btn${imgState ? ' dc-share-btn--copied' : ''}${sharing ? ' dc-share-btn--loading' : ''}`}
          type="button"
          onClick={shareImg}
          disabled={sharing}
        >
          {sharing ? 'Wird erstellt…' : imgState === 'shared' ? 'Geteilt ✓' : imgState === 'downloaded' ? 'Gespeichert ✓' : 'Als Bild teilen'}
        </button>
        <button
          className={`btn-ghost dc-share-btn${copied ? ' dc-share-btn--copied' : ''}`}
          type="button"
          onClick={share}
        >
          {copied ? 'Kopiert ✓' : 'Text kopieren'}
        </button>
        <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>Schließen</button>
      </div>
    </Sheet>
  )
}
