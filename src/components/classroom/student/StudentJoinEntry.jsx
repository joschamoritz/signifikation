// T-5.2 / F5 — S1 Code-Eingabe (Schueler-Einstieg).
//
// Eine einfache Code-Eingabe (keine Slots, weil D16-Decision die Wortliste
// behält — Wörter zwischen 4 und 10 Buchstaben). Paste-Support: alles, was
// nicht a-z0-9- ist, wird gefiltert; Groß-/Kleinschreibung wird normalisiert.
//
// Ein Submit fuehrt KEIN /join aus — das passiert erst in NameState mit
// dem dann ebenfalls gewünschten Namen. Hier nur Routing nach /c/:code.
//
// F5: `embedded` rendert die Eingabe IM Klassenraum-Tab (ohne KioskShell-
// Vollbild, TabBar bleibt sichtbar). Zusaetzlich ein „QR-Code scannen"-Button
// (In-App-Scanner) — beide Wege navigieren nach /c/:code, wo der Kiosk
// uebernimmt.

import { useState, useRef, lazy, Suspense } from 'react'
import { navigate } from '../routing'
import KioskShell from './KioskShell'
import TabHeader from '../../TabHeader'

const QrScanner = lazy(() => import('./QrScanner'))

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30)
}

export default function StudentJoinEntry({ initialNotice = null, embedded = false }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState(initialNotice || null)
  const [shake, setShake]     = useState(false)
  const [scanning, setScanning] = useState(false)
  const inputRef              = useRef(null)

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

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 320)
    try { inputRef.current?.focus() } catch {}
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

  const inner = (
    <div className="classroom-kiosk__panel">
      <p className="classroom-kiosk__overline">Live-Session · Beitreten</p>
      <h1 className="classroom-kiosk__title">Klassenraum</h1>
      <p className="classroom-kiosk__lead">
        Tipp den Zugangscode deiner Lehrkraft ein – oder scanne den QR-Code.
      </p>

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
          autoCapitalize="characters"
          spellCheck={false}
          className={`classroom-kiosk__code-field ${shake ? 'classroom-kiosk__input--shake' : ''}`}
          value={code}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder="z. B. MORGENTAU"
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
        className="btn-ghost classroom-kiosk__skip"
        onClick={() => { setError(null); setScanning(true) }}
        data-testid="classroom-kiosk-scan-btn"
      >
        QR-Code scannen
      </button>
    </div>
  )

  if (embedded) {
    // Einstieg im Klassenraum-Tab → gleicher App-Header wie alle Tabs.
    // test-page liefert die --t-*-Tokens + das Mobil-Layout, das der geteilte
    // Header (test-title-section) braucht; classroom-kiosk bleibt für die --k-*-Tokens
    // der inneren classroom-kiosk__*-Elemente.
    return (
      <div className="classroom-kiosk test-page classroom-student-entry" data-testid="classroom-student-tab">
        <div className="test-wrapper">
          <TabHeader />
          <nav className="test-raster" aria-label="Klassenraum">
            <span className="test-raster-label" aria-hidden="true">Klassenraum</span>
            <div className="test-raster-words">
              <span className="test-raster-word">Live-Session beitreten</span>
            </div>
            <div className="test-raster-end">
              <span className="test-raster-folio" aria-hidden="true">Schüler:in</span>
            </div>
          </nav>
          <div className="test-rule--double" role="separator" aria-hidden="true" />
          <main className="classroom-kiosk__main">{inner}</main>
        </div>
      </div>
    )
  }
  return <KioskShell confirmExit={false}>{inner}</KioskShell>
}
