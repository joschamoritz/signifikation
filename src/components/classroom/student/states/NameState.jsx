// T-5.3 — S2 Spitzname-Eingabe.
//
// D15: Pflicht, max 20 Zeichen. Skip-Link nutzt vom Server den Default
// „Schüler:in N" (wenn displayName beim /join leer übergeben wird).
//
// Submit ruft kioskFetch.joinSession({ code, displayName }). Bei 409 (Name
// vergeben) bleibt der Schüler auf S2 mit Fehler-Hint. Bei 404 (INVALID_CODE)
// navigieren wir zurück zu /c.

import { useState, useRef } from 'react'
import { useStudentKiosk, KIOSK_STATES } from '../StudentKioskContext'
import { joinSession, KioskApiError } from '../kioskFetch'
import { navigate } from '../../routing'

const MAX_NAME = 20

export default function NameState() {
  const { state, dispatch } = useStudentKiosk()
  const [name, setName]         = useState(state.displayName || '')
  const [submitting, setSubmit] = useState(false)
  const [localError, setError]  = useState(null)
  const inputRef                = useRef(null)

  function handleChange(e) {
    setName(String(e.target.value || '').slice(0, MAX_NAME))
    if (localError) setError(null)
  }

  async function doJoin(displayName) {
    if (submitting) return
    setSubmit(true)
    setError(null)
    try {
      const payload = await joinSession({
        code: state.code,
        displayName: displayName || undefined,
      })
      // Persistenz wird in useStudentSession beim JOINED-Effect erledigt.
      dispatch({
        type: 'JOINED',
        sessionId:     payload.sessionId,
        sessionStatus: payload.sessionStatus,
        participantId: payload.participantId,
        token:         payload.token,
        displayName:   displayName || '',
      })
    } catch (err) {
      if (err instanceof KioskApiError && (err.status === 404 || err.status === 409)) {
        if (err.status === 404) {
          // Code ungültig — zurück nach /c mit Hinweis.
          navigate('/c')
          return
        }
        // 409 → Konflikt (Name oder Session voll/SESSION_FULL/NO_ASSIGNMENT).
        setError(err.message || 'Beitritt abgelehnt.')
      } else {
        setError(err?.message || 'Beitritt fehlgeschlagen.')
      }
    } finally {
      setSubmit(false)
    }
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('Bitte einen Spitznamen eingeben oder „Ohne Namen beitreten" anklicken.')
      try { inputRef.current?.focus() } catch {}
      return
    }
    doJoin(trimmed)
  }

  function handleSkip() {
    // Leerer displayName → Server vergibt Default „Schüler:in N".
    doJoin('')
  }

  return (
    <>
      <p className="cr2-kiosk__code-line">
        Zugangscode: <strong>{state.code}</strong>
      </p>
      <p className="cr2-kiosk__dropcap">N</p>
      <h1 className="cr2-kiosk__title">Wie heißt du?</h1>
      <p className="cr2-kiosk__lead">
        Spitzname reicht — wird nur deiner Lehrkraft angezeigt.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="cr2-kiosk-name" style={{ position: 'absolute', left: -9999 }}>
          Spitzname
        </label>
        <input
          id="cr2-kiosk-name"
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="cr2-kiosk__input"
          style={{ fontSize: '1.2rem', textAlign: 'left' }}
          value={name}
          onChange={handleChange}
          placeholder="Spitzname"
          maxLength={MAX_NAME}
          disabled={submitting}
          data-testid="cr2-kiosk-name-input"
        />
        <p className="cr2-kiosk__counter">{name.length} / {MAX_NAME}</p>
        {localError && (
          <p className="cr2-kiosk__hint cr2-kiosk__hint--error" data-testid="cr2-kiosk-name-error">
            {localError}
          </p>
        )}
        <button
          type="submit"
          className="cr2-kiosk__btn cr2-kiosk__btn--primary"
          disabled={submitting}
          data-testid="cr2-kiosk-name-submit"
        >
          {submitting ? 'Beitritt …' : 'Beitreten'}
        </button>
        <button
          type="button"
          className="cr2-kiosk__btn cr2-kiosk__btn--ghost"
          onClick={handleSkip}
          disabled={submitting}
          data-testid="cr2-kiosk-name-skip"
        >
          Ohne Namen beitreten
        </button>
      </form>
    </>
  )
}

// Test-Hilfe — nicht in Prod-Builds verwendet
export { KIOSK_STATES as __KIOSK_STATES }
