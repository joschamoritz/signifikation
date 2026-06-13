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
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'

function joinUrl(code) {
  if (typeof window === 'undefined' || !code) return ''
  const origin = window.location.origin.replace(/\/$/, '')
  return `${origin}/c/${encodeURIComponent(code)}`
}

export default function SessionCodeCard({ code }) {
  const [copied, setCopied] = useState(false)
  const [qrSvg, setQrSvg]   = useState('')
  const [zoomed, setZoomed] = useState(false)
  const url = joinUrl(code)

  // Esc schließt das Vollbild; body-scroll sperren, solange offen.
  useEffect(() => {
    if (!zoomed) return undefined
    function onKey(e) { if (e.key === 'Escape') setZoomed(false) }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [zoomed])

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

  // Schriftgröße an Code-Länge koppeln → höchstens ~2 Zeilen, auch bei langen
  // Codes wie „nomen-redaktion".
  const len = code.length
  const codeSize =
    len <= 7  ? 'clamp(44px, 11vw, 104px)' :
    len <= 10 ? 'clamp(34px, 8.5vw, 78px)' :
    len <= 13 ? 'clamp(28px, 6.8vw, 60px)' :
                'clamp(24px, 5.4vw, 48px)'

  return (
    <section className="classroom-code-card" aria-label="Zugangscode">
      <p className="classroom-code-card__label">Zugangscode</p>
      <div className="classroom-code-card__display" aria-live="polite" style={{ fontSize: codeSize }}>
        {code.split('').map((char, i) => (
          <span key={i} className="classroom-code-card__char">{char}</span>
        ))}
      </div>

      {qrSvg && (
        <button
          type="button"
          className="classroom-code-card__qr classroom-code-card__qr--button"
          // eslint-disable-next-line react/no-danger -- SVG kommt aus der qrcode-Lib, kein User-Input
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          onClick={() => setZoomed(true)}
          aria-label="QR-Code zum Beitreten — tippen für Vollbild"
          data-testid="classroom-code-qr-button"
        />
      )}

      {zoomed && typeof document !== 'undefined' && createPortal(
        <div
          className="classroom-qr-fullscreen"
          role="dialog"
          aria-modal="true"
          aria-label="QR-Code Vollbild"
          onClick={() => setZoomed(false)}
          data-testid="classroom-qr-fullscreen"
        >
          <button
            type="button"
            className="classroom-qr-fullscreen__close"
            onClick={() => setZoomed(false)}
            aria-label="Vollbild schließen"
          >
            ×
          </button>
          <div className="classroom-qr-fullscreen__inner" onClick={(e) => e.stopPropagation()}>
            <p className="classroom-qr-fullscreen__code">{code}</p>
            <div
              className="classroom-qr-fullscreen__qr"
              // eslint-disable-next-line react/no-danger -- SVG aus qrcode-Lib, kein User-Input
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              role="img"
              aria-label="QR-Code zum Beitreten"
            />
            <p className="classroom-qr-fullscreen__hint">Tippen zum Schließen</p>
          </div>
        </div>,
        document.body,
      )}

      <div className="classroom-code-card__actions">
        <button
          type="button"
          className="classroom-link-cta"
          onClick={copyCode}
        >
          {copied ? '✓ Kopiert' : 'Code kopieren'}
        </button>
        {url && (
          <a className="classroom-link-cta" href={url} target="_blank" rel="noreferrer">
            Beitrittsseite öffnen
            <span className="test-cta-arrow" aria-hidden="true"> ↗</span>
          </a>
        )}
      </div>
    </section>
  )
}
