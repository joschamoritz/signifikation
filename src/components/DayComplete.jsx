import { useState } from 'react'
import { WEEKDAYS, MONTHS, computeStreak, buildShareText } from '../utils/homeUtils'
import { getMedal } from '../utils/gameLogic'
import { shareAsImage } from '../utils/shareImage'

export default function DayComplete({ onClose, playedGames = [], wzPlayed = null, zwPlayed = null, lfPlayed = null }) {
  const [closing,  setClosing]  = useState(false)
  const [copied,   setCopied]   = useState(false)
  const [sharing,  setSharing]  = useState(false)
  const [imgState, setImgState] = useState(null) // 'shared' | 'downloaded' | null

  const today   = new Date()
  const weekday = WEEKDAYS[today.getDay()]
  const date    = `${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`
  const streak  = computeStreak()

  const kollTotal = playedGames.reduce((s, g) => s + g.total, 0)
  const kollMax   = playedGames.length * 10
  const kollMedal = getMedal(kollTotal, kollMax)

  function close() {
    setClosing(true)
    setTimeout(onClose, 200)
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
          </div>
          {wzPlayed && (
            <div className="dc-medal-item">
              <span className="dc-medal-emoji" aria-label={wzPlayed.medal?.label}>{wzPlayed.medal?.emoji}</span>
              <span className="dc-medal-label">Wort-Zwilling</span>
            </div>
          )}
          {zwPlayed && (
            <div className="dc-medal-item">
              <span className="dc-medal-emoji" aria-label={zwPlayed.medal?.label}>{zwPlayed.medal?.emoji}</span>
              <span className="dc-medal-label">Zeitenwende</span>
            </div>
          )}
          {lfPlayed && (
            <div className="dc-medal-item">
              <span className="dc-medal-emoji" aria-label={lfPlayed.medal?.label}>{lfPlayed.medal?.emoji}</span>
              <span className="dc-medal-label">Lückenfüller</span>
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
            onClick={shareImg}
            disabled={sharing}
          >
            {sharing ? 'Wird erstellt…' : imgState === 'shared' ? 'Geteilt ✓' : imgState === 'downloaded' ? 'Gespeichert ✓' : 'Als Bild teilen'}
          </button>
          <button
            className={`btn-ghost dc-share-btn${copied ? ' dc-share-btn--copied' : ''}`}
            onClick={share}
          >
            {copied ? 'Kopiert ✓' : 'Text kopieren'}
          </button>
          <button className="btn-ghost" onClick={close}>Schließen</button>
        </div>
      </div>
    </div>
  )
}
