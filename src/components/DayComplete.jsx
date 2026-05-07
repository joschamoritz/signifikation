import { useState, useEffect } from 'react'
import { WEEKDAYS, MONTHS, computeStreak, buildShareText, localDateStr } from '../utils/homeUtils'
import { getMedal } from '../utils/gameLogic'
import { shareAsImage } from '../utils/shareImage'
import { API } from '../config.js'

export default function DayComplete({ onClose, playedGames = [], wzPlayed = null, zwPlayed = null, lfPlayed = null }) {
  const [closing,    setClosing]    = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [sharing,    setSharing]    = useState(false)
  const [imgState,   setImgState]   = useState(null) // 'shared' | 'downloaded' | null
  const [percentiles, setPercentiles] = useState({})

  const today   = new Date()
  const datum   = localDateStr(today)
  const weekday = WEEKDAYS[today.getDay()]
  const date    = `${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`
  const streak  = computeStreak()

  const kollTotal = playedGames.reduce((s, g) => s + g.total, 0)
  const kollMax   = playedGames.length * 10
  const kollMedal = getMedal(kollTotal, kollMax)

  useEffect(() => {
    const queries = []
    if (playedGames.length > 0) queries.push({ game: 'kollokationen', score: kollTotal, max: kollMax })
    if (wzPlayed)  queries.push({ game: 'wortzwilling',  score: wzPlayed.total,  max: 10 })
    if (zwPlayed)  queries.push({ game: 'zeitenwende',   score: zwPlayed.total,  max: 10 })
    if (lfPlayed)  queries.push({ game: 'lueckenfueller', score: lfPlayed.total, max: 10 })

    Promise.all(queries.map(({ game, score, max }) =>
      fetch(`${API}/percentile?datum=${datum}&game=${game}&score=${score}&max=${max}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => [game, data?.available ? data.percentile : null])
        .catch(() => [game, null])
    )).then(results => {
      setPercentiles(Object.fromEntries(results))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function close() {
    setClosing(true)
  }

  async function share() {
    const text = buildShareText(playedGames, wzPlayed, streak, zwPlayed, lfPlayed)
    if (navigator.share) { try { await navigator.share({ text }); return } catch {} }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {}
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
    <div className="feedback-overlay" onClick={close}>
      <div
        className={`feedback-sheet dc-sheet${closing ? ' feedback-sheet--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-title"
        onAnimationEnd={(e) => {
          if (closing && e.target === e.currentTarget) onClose()
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="dc-grip" aria-hidden="true" />

        <header className="dc-header">
          <span className="dc-weekday">{weekday}</span>
          <h2 className="dc-date" id="dc-title">{date}</h2>
        </header>

        <div className="dc-rule" />

        <div className="dc-medals">
          <div className="dc-medal-item">
            <span className="dc-medal-emoji" aria-label={kollMedal.label}>{kollMedal.emoji}</span>
            <span className="dc-medal-label">Kollokationen</span>
            {percentiles.kollokationen != null && (
              <span className="dc-percentile">besser als {percentiles.kollokationen} %</span>
            )}
          </div>
          {wzPlayed && (
            <div className="dc-medal-item">
              <span className="dc-medal-emoji" aria-label={wzPlayed.medal?.label}>{wzPlayed.medal?.emoji}</span>
              <span className="dc-medal-label">Wort-Zwilling</span>
              {percentiles.wortzwilling != null && (
                <span className="dc-percentile">besser als {percentiles.wortzwilling} %</span>
              )}
            </div>
          )}
          {zwPlayed && (
            <div className="dc-medal-item">
              <span className="dc-medal-emoji" aria-label={zwPlayed.medal?.label}>{zwPlayed.medal?.emoji}</span>
              <span className="dc-medal-label">Zeitenwende</span>
              {percentiles.zeitenwende != null && (
                <span className="dc-percentile">besser als {percentiles.zeitenwende} %</span>
              )}
            </div>
          )}
          {lfPlayed && (
            <div className="dc-medal-item">
              <span className="dc-medal-emoji" aria-label={lfPlayed.medal?.label}>{lfPlayed.medal?.emoji}</span>
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
          <button className="btn-ghost" type="button" onClick={close}>Schließen</button>
        </div>
      </div>
    </div>
  )
}
