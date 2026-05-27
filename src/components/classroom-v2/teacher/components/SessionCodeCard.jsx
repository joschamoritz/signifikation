// T-4.5 — Code-Karte fuer die Lobby.
//
// Der Code MUSS aus 5m lesbar sein (Beamer-Setting). Wir nutzen
// clamp(48px, 12vw, 120px), Gentium Plus und ein dezentes Gold-Underscore
// pro Zeichen — das macht den Code als Logo lesbar, nicht als Code-Block.
//
// QR-Code: bewusst KEIN externer Library-Import. Statt ein QR-Renderer-Paket
// einzuziehen (>20KB), liefert der Server eine Beitritts-URL — der Teacher
// kann den Tab auf dem Beamer projizieren und der Schueler tippt den Code
// ein. Wenn der Pilot zeigt, dass QR gefragt ist, kommt das in Welle 2 dazu.

import { useState } from 'react'

function joinUrl(code) {
  if (typeof window === 'undefined' || !code) return ''
  const origin = window.location.origin.replace(/\/$/, '')
  return `${origin}/c/${encodeURIComponent(code)}`
}

export default function SessionCodeCard({ code }) {
  const [copied, setCopied] = useState(false)
  const url = joinUrl(code)

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ohne Clipboard-API kein Fallback noetig: Schueler tippt eh den Code */ }
  }

  if (!code) return null

  return (
    <section className="cr2-code-card" aria-label="Zugangscode">
      <p className="cr2-code-card__label">Zugangscode</p>
      <div className="cr2-code-card__display" aria-live="polite">
        {code.split('').map((char, i) => (
          <span key={i} className="cr2-code-card__char">{char}</span>
        ))}
      </div>
      <div className="cr2-code-card__actions">
        <button
          type="button"
          className="cr2-btn cr2-btn--ghost"
          onClick={copyCode}
        >
          {copied ? 'Kopiert' : 'Code kopieren'}
        </button>
        {url && (
          <a className="cr2-btn cr2-btn--ghost" href={url} target="_blank" rel="noreferrer">
            Beitrittsseite öffnen
          </a>
        )}
      </div>
    </section>
  )
}
