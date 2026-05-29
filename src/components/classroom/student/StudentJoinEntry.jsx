// T-5.2 — S1 Code-Eingabe.
//
// Eine einfache Code-Eingabe (keine Slots, weil D16-Decision die Wortliste
// behält — Wörter zwischen 4 und 10 Buchstaben). Paste-Support: alles, was
// nicht a-z0-9- ist, wird gefiltert; Groß-/Kleinschreibung wird normalisiert.
//
// Ein Submit fuehrt KEIN /join aus — das passiert erst in NameState mit
// dem dann ebenfalls gewünschten Namen. Hier nur Routing nach /c/:code.

import { useState, useRef } from 'react'
import { navigate } from '../routing'
import KioskShell from './KioskShell'

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30)
}

export default function StudentJoinEntry({ initialNotice = null }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState(initialNotice || null)
  const [shake, setShake]     = useState(false)
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

  function handleSubmit(e) {
    e.preventDefault()
    const c = normalizeCode(code)
    if (c.length < 4) {
      setError('Zugangscode zu kurz.')
      triggerShake()
      return
    }
    navigate(`/c/${encodeURIComponent(c)}`)
  }

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 320)
    try { inputRef.current?.focus() } catch {}
  }

  return (
    <KioskShell confirmExit={false}>
      <p className="cr2-kiosk__dropcap">K</p>
      <h1 className="cr2-kiosk__title">Klassenraum</h1>
      <p className="cr2-kiosk__lead">
        Tipp den Zugangscode deiner Lehrkraft ein.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="cr2-kiosk-code" style={{ position: 'absolute', left: -9999 }}>
          Zugangscode
        </label>
        <input
          id="cr2-kiosk-code"
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className={`cr2-kiosk__input ${shake ? 'cr2-kiosk__input--shake' : ''}`}
          style={{ textTransform: 'uppercase' }}
          value={code}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder="z. B. MORGENTAU"
          maxLength={30}
          data-testid="cr2-kiosk-code-input"
        />
        {error && (
          <p className="cr2-kiosk__hint cr2-kiosk__hint--error" data-testid="cr2-kiosk-code-error">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="cr2-kiosk__btn cr2-kiosk__btn--primary"
          disabled={code.length < 4}
          data-testid="cr2-kiosk-code-submit"
        >
          Beitreten
        </button>
      </form>
    </KioskShell>
  )
}
