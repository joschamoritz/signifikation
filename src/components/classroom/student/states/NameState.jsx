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

// Schuelerfreundliche Beitritts-Fehlermeldungen je stabilem Server-Code
// (statt der technischen mapError-Texte). Code kommt aus der Join-Response.
const JOIN_ERROR_TEXT = {
  SESSION_FULL:       'Die Sitzung ist voll (höchstens 50 Teilnehmende).',
  LATE_JOIN_DISABLED: 'Die Sitzung hat schon begonnen — frag deine Lehrkraft, ob du noch beitreten kannst.',
  INVALID_STATE:      'Diese Sitzung ist gerade nicht aktiv.',
  NO_ASSIGNMENT:      'Die Sitzung ist noch nicht bereit. Bitte kurz warten.',
}

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
          // Code ungültig — schülerfreundlichen Hinweis hinterlegen, dann
          // zurück nach /c. Der Mini-Router kennt nur pathname (keine Query/
          // State), daher via sessionStorage; StudentJoinEntry liest + löscht
          // ihn einmalig beim Mount. Ohne das landete der Schüler stumm auf der
          // leeren Code-Eingabe und wüsste nicht, was schiefging.
          try {
            sessionStorage.setItem(
              'classroom:joinNotice',
              'Dieser Code stimmt nicht — bitte prüfen und neu eingeben.',
            )
          } catch {}
          navigate('/c')
          return
        }
        // 409 → Konflikt. Bevorzugt die schülerfreundliche Meldung je Code,
        // Fallback auf die Server-Meldung.
        setError(JOIN_ERROR_TEXT[err.code] || err.message || 'Beitritt abgelehnt.')
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
    <div className="classroom-kiosk__panel">
      <p className="classroom-kiosk__overline">Klassenraum · Beitritt</p>
      <h1 className="classroom-kiosk__title">Wie heißt du?</h1>
      <p className="classroom-kiosk__lead">
        Kein echter Name nötig — ein Spitzname reicht. Er wird nur deiner Lehrkraft
        angezeigt und nach der Stunde gelöscht.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="classroom-kiosk-name" style={{ position: 'absolute', left: -9999 }}>
          Spitzname
        </label>
        <input
          id="classroom-kiosk-name"
          ref={inputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="classroom-kiosk__name-field"
          value={name}
          onChange={handleChange}
          placeholder="Spitzname"
          maxLength={MAX_NAME}
          disabled={submitting}
          data-testid="classroom-kiosk-name-input"
        />
        <p className="classroom-kiosk__counter">{name.length} / {MAX_NAME}</p>
        {localError && (
          <p className="classroom-kiosk__hint classroom-kiosk__hint--error" data-testid="classroom-kiosk-name-error">
            {localError}
          </p>
        )}
        <button
          type="submit"
          className="btn-primary btn-full"
          disabled={submitting}
          data-testid="classroom-kiosk-name-submit"
        >
          {submitting ? 'Beitritt …' : 'Beitreten'}
        </button>
        <button
          type="button"
          className="btn-ghost classroom-kiosk__skip"
          onClick={handleSkip}
          disabled={submitting}
          data-testid="classroom-kiosk-name-skip"
        >
          Ohne Namen beitreten
        </button>
      </form>

      <p className="classroom-kiosk__code-line">
        Zugangscode: <strong>{state.code}</strong>
      </p>
    </div>
  )
}

// Test-Hilfe — nicht in Prod-Builds verwendet
export { KIOSK_STATES as __KIOSK_STATES }
