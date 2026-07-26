// Wiederverwendbares Code-Eingabe-Formular fürs Klassenraum-Beitreten: Text-
// Feld (mit Paste-Normalisierung) + Submit + „QR-Code scannen“-Button, der
// auf den Vollbild-Scanner umschaltet (QrScanner ist selbst fixed/inset:0,
// deckt also unabhängig von der Einbettung den ganzen Viewport ab).
//
// Genutzt vom Schüler-Einstieg (StudentJoinEntry, Vollroute + eingebettete
// Karte) UND vom Lehrer-Index (ClassroomIndexStep „① Beitreten“ — Ausprobieren
// ohne Extra-Klick zur separaten Beitritts-Seite).
import { useState, useRef, lazy, Suspense } from 'react'
import { navigate } from '../routing'

const QrScanner = lazy(() => import('./QrScanner'))

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30)
}

export default function JoinCodeForm({ initialError = null, scanButtonClassName = 'btn-ghost classroom-kiosk__skip' }) {
  const [code, setCode]         = useState('')
  const [error, setError]       = useState(initialError)
  const [shake, setShake]       = useState(false)
  const [scanning, setScanning] = useState(false)
  const inputRef                = useRef(null)

  function handleChange(e) {
    const v = normalizeCode(e.target.value)
    setCode(v)
    if (error) setError(null)
  }

  function handlePaste(e) {
    const txt = (e.clipboardData || window.clipboardData)?.getData('text') || ''
    if (!txt) return
    e.preventDefault()
    setCode(normalizeCode(txt))
  }

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 320)
    try { inputRef.current?.focus() } catch {}
  }

  function go(raw) {
    const c = normalizeCode(raw)
    if (c.length < 4) {
      setError('Zugangscode zu kurz.')
      triggerShake()
      return
    }
    navigate(`/c/${encodeURIComponent(c)}`)
  }

  function handleSubmit(e) {
    e.preventDefault()
    go(code)
  }

  if (scanning) {
    return (
      <Suspense fallback={null}>
        <QrScanner
          onResult={(c) => { setScanning(false); go(c) }}
          onClose={() => setScanning(false)}
        />
      </Suspense>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="classroom-kiosk-code" style={{ position: 'absolute', left: -9999 }}>
          Zugangscode
        </label>
        <input
          id="classroom-kiosk-code"
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className={`classroom-kiosk__code-field ${shake ? 'classroom-kiosk__input--shake' : ''}`}
          value={code}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder="hier eintippen"
          maxLength={30}
          data-testid="classroom-kiosk-code-input"
        />
        {error && (
          <p className="classroom-kiosk__hint classroom-kiosk__hint--error" data-testid="classroom-kiosk-code-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn-primary btn-full"
          disabled={code.length < 4}
          data-testid="classroom-kiosk-code-submit"
        >
          Beitreten
        </button>
      </form>
      <button
        type="button"
        className={scanButtonClassName}
        onClick={() => { setError(null); setScanning(true) }}
        data-testid="classroom-kiosk-scan-btn"
      >
        QR-Code scannen
      </button>
    </>
  )
}
