// T-4.5 / F6 — Code-Karte fuer die Lobby.
//
// Der Code MUSS aus 5m lesbar sein (Beamer-Setting). Wir nutzen
// clamp(48px, 12vw, 120px), Gentium Plus und ein dezentes Gold-Underscore
// pro Zeichen — das macht den Code als Logo lesbar, nicht als Code-Block.
//
// F6 (Praxistest): QR-Code zur Beitritts-URL. Schueler scannen ihn mit der
// Handy-Kamera (oder dem In-App-Scanner) und landen direkt im Kiosk. SVG wird
// per `qrcode` erzeugt — dunkelrot (#9b1c1c) auf Pergament fuer CD-Konsistenz
// bei genug Kontrast; Fehlerkorrektur 'M' macht das Scannen robust.

import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

function joinUrl(code) {
  if (typeof window === 'undefined' || !code) return ''
  const origin = window.location.origin.replace(/\/$/, '')
  return `${origin}/c/${encodeURIComponent(code)}`
}

export default function SessionCodeCard({ code }) {
  const [copied, setCopied] = useState(false)
  const [qrSvg, setQrSvg]   = useState('')
  const url = joinUrl(code)

  useEffect(() => {
    let cancelled = false
    if (!url) { setQrSvg(''); return }
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#9b1c1cff', light: '#faf9f7ff' },
    })
      .then((svg) => { if (!cancelled) setQrSvg(svg) })
      .catch(() => { if (!cancelled) setQrSvg('') })
    return () => { cancelled = true }
  }, [url])

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

      {qrSvg && (
        <div
          className="cr2-code-card__qr"
          // eslint-disable-next-line react/no-danger -- SVG kommt aus der qrcode-Lib, kein User-Input
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          role="img"
          aria-label="QR-Code zum Beitreten"
        />
      )}

      <div className="cr2-code-card__actions">
        <button
          type="button"
          className="cr2-link-cta"
          onClick={copyCode}
        >
          {copied ? '✓ Kopiert' : 'Code kopieren'}
        </button>
        {url && (
          <a className="cr2-link-cta" href={url} target="_blank" rel="noreferrer">
            Beitrittsseite öffnen
            <span className="test-cta-arrow" aria-hidden="true"> ↗</span>
          </a>
        )}
      </div>
    </section>
  )
}
