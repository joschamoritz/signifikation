import { useState, useRef, useEffect } from 'react'
import { API } from '../config'

const EMOJIS = ['😕', '😐', '🙂', '😄', '🤩']
const EMOJI_LABELS = {
  '😕': 'Sehr schlecht',
  '😐': 'Schlecht',
  '🙂': 'Okay',
  '😄': 'Gut',
  '🤩': 'Sehr gut',
}

const GAME_LABELS = {
  kollokationen: 'Kollokationen',
  zeitreise:     'Zeitreise',
  wortzwilling:  'Wort-Zwilling',
}

export default function FeedbackModal({ game, onClose }) {
  const [emoji, setEmoji] = useState(null)
  const [text, setText]   = useState('')
  const [sent, setSent]   = useState(false)

  const dialogRef   = useRef(null)
  const firstBtnRef = useRef(null)

  // Fokus beim Öffnen auf ersten Button, beim Schließen zurück
  useEffect(() => {
    const prev = document.activeElement
    firstBtnRef.current?.focus()
    return () => prev?.focus()
  }, [])

  // Escape schließt Modal
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSend() {
    if (!emoji) return
    try {
      await fetch(`${API}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, emoji, text: text.trim() }),
      })
    } catch {}
    setSent(true)
    setTimeout(onClose, 1400)
  }

  return (
    <div className="feedback-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="feedback-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fb-title"
        onClick={e => e.stopPropagation()}
      >
        {sent ? (
          <p className="feedback-thanks">Danke für dein Feedback! 🙏</p>
        ) : (
          <>
            <p id="fb-title" className="feedback-question">
              Wie hat dir <strong>{GAME_LABELS[game] ?? game}</strong> gefallen?
            </p>
            <div className="feedback-emojis" role="group" aria-label="Bewertung auswählen">
              {EMOJIS.map((e, i) => (
                <button
                  key={e}
                  ref={i === 0 ? firstBtnRef : undefined}
                  className={`feedback-emoji${emoji === e ? ' feedback-emoji--selected' : ''}`}
                  onClick={() => setEmoji(e)}
                  aria-label={EMOJI_LABELS[e]}
                  aria-pressed={emoji === e}
                >{e}</button>
              ))}
            </div>
            <textarea
              className="feedback-text"
              placeholder="Was möchtest du uns sagen? (optional) – Bitte keine persönlichen Daten angeben."
              value={text}
              onChange={e => setText(e.target.value)}
              rows={2}
            />
            <div className="feedback-actions">
              <button className="btn-ghost" onClick={onClose}>Überspringen</button>
              <button className="btn-primary" onClick={handleSend} disabled={!emoji}>Senden</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
