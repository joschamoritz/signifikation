// F5 — In-App-QR-Scanner (Schueler-Einstieg).
//
// Oeffnet die Rueckkamera (getUserMedia, facingMode 'environment'), liest
// periodisch ein Frame in ein Offscreen-Canvas und decodiert es mit jsQR.
// Erkennt sowohl volle Beitritts-URLs (…/c/CODE) als auch reine Codes.
//
// iOS-Hinweis: getUserMedia laeuft in der WKWebView ab iOS 14.3, benoetigt
// aber NSCameraUsageDescription (siehe ios/App/App/Info.plist) und `playsinline`
// am <video>. Der native Pfad ist nur in TestFlight verifizierbar.

import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

/** Extrahiert den Beitritts-Code aus einem gescannten QR-Text. */
export function extractCode(text) {
  if (!text) return null
  try {
    const u = new URL(text)
    const m = u.pathname.match(/\/c\/([^/]+)/i)
    if (m) return decodeURIComponent(m[1]).toLowerCase().replace(/[^a-z0-9-]/g, '') || null
  } catch { /* kein gueltiger URL-Text → als reinen Code behandeln */ }
  const norm = String(text).trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  return norm.length >= 4 ? norm : null
}

export default function QrScanner({ onResult, onClose }) {
  const videoRef  = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)
  // Callbacks ueber Refs, damit der Kamera-Effect nur EINMAL laeuft (kein Neustart).
  const onResultRef = useRef(onResult)
  const onCloseRef  = useRef(onClose)
  onResultRef.current = onResult
  onCloseRef.current  = onClose

  const [error, setError] = useState(null)

  useEffect(() => {
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    function stop() {
      stopped = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const s = streamRef.current
      if (s) s.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    function tick() {
      const video = videoRef.current
      if (stopped || !video) return
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        const code = found?.data ? extractCode(found.data) : null
        if (code) { stop(); onResultRef.current?.(code); return }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Kamera wird hier nicht unterstützt. Tippe den Code ein.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        setError(
          err?.name === 'NotAllowedError'
            ? 'Kein Kamera-Zugriff erlaubt. Tippe den Code ein.'
            : 'Kamera nicht verfügbar. Tippe den Code ein.',
        )
      }
    }

    start()
    return stop
  }, [])

  return (
    <div className="cr2-qr-scanner" role="dialog" aria-label="QR-Code scannen" aria-modal="true">
      <div className="cr2-qr-scanner__frame">
        <video
          ref={videoRef}
          className="cr2-qr-scanner__video"
          muted
          playsInline
          aria-hidden="true"
        />
        <div className="cr2-qr-scanner__reticle" aria-hidden="true" />
      </div>
      <p className="cr2-qr-scanner__hint" aria-live="polite">
        {error || 'Richte die Kamera auf den QR-Code deiner Lehrkraft.'}
      </p>
      <button
        type="button"
        className="cr2-qr-scanner__cancel"
        onClick={() => onCloseRef.current?.()}
      >
        Abbrechen
      </button>
    </div>
  )
}
