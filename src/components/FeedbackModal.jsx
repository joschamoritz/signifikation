import { useState } from 'react'
import { API } from '../config'

const EMOJIS = ['😕', '😐', '🙂', '😄', '🤩']

const GAME_LABELS = {
  kollokation: 'Kollokationen',
  zeitreise:   'Zeitreise',
  wortzwilling: 'Wort-Zwilling',
}

export default function FeedbackModal({ game, onClose }) {
  const [emoji, setEmoji] = useState(null)
  const [text, setText]   = useState('')
  const [sent, setSent]   = useState(false)

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
      <div className="feedback-sheet" onClick={e => e.stopPropagation()}>
        {sent ? (
          <p className="feedback-thanks">Danke für dein Feedback! 🙏</p>
        ) : (
          <>
            <p className="feedback-question">
              Wie hat dir <strong>{GAME_LABELS[game]}</strong> gefallen?
            </p>
            <div className="feedback-emojis">
              {EMOJIS.map(e => (
                <button
                  key={e}
                  className={`feedback-emoji${emoji === e ? ' feedback-emoji--selected' : ''}`}
                  onClick={() => setEmoji(e)}
                  aria-label={e}
                >{e}</button>
              ))}
            </div>
            <textarea
              className="feedback-text"
              placeholder="Was möchtest du uns sagen? (optional)"
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
