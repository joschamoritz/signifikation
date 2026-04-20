import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'
import {
  WEEKDAYS, MONTHS,
  localDateStr, computeStreak,
} from '../utils/homeUtils'

function TabHeader() {
  const streak = computeStreak()
  const today = new Date()
  const dateStr = localDateStr(today)

  return (
    <>
      <header className="test-title-section" role="banner">
        <p className="test-overline">Tägliches Wortspiel · Linguistik</p>
        <h1 className="test-title">Signifikation</h1>
        <p className="test-subtitle">
          <time dateTime={dateStr}>
            {`${WEEKDAYS[today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`}
          </time>
        </p>
        {streak > 0 && (
          <span className="test-title-streak" aria-label={`${streak} Tage Streak`}>
            🔥 {streak}
          </span>
        )}
      </header>
    </>
  )
}

export default function KontoTab({ gesamtausgabe, onUnlock, onAuthStateChange = () => {} }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authOptions, setAuthOptions] = useState({
    googleEnabled: false,
    appleEnabled: false,
    passwordResetEnabled: false,
  })
  const [resetEmail, setResetEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({ name: '', email: '', password: '' })
  const [resetErrors, setResetErrors] = useState({ email: '', token: '', password: '', confirm: '' })
  const [sessionData, setSessionData] = useState(null)
  const [accountData, setAccountData] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [notice, setNotice] = useState(null)

  const isLoggedIn = !!sessionData?.user?.email
  const showNameField = mode === 'register'
  const isResetMode = mode === 'reset'

  const readJsonSafe = useCallback(async (response) => {
    try {
      return await response.json()
    } catch {
      return null
    }
  }, [])

  const translateAuthError = useCallback((rawMessage, authMode) => {
    const fallback = authMode === 'register'
      ? 'Registrierung fehlgeschlagen.'
      : authMode === 'logout'
        ? 'Abmeldung fehlgeschlagen.'
        : authMode === 'reset-request'
          ? 'Zuruecksetzen konnte nicht angefragt werden.'
          : authMode === 'reset-complete'
            ? 'Passwort konnte nicht geaendert werden.'
            : 'Anmeldung fehlgeschlagen.'

    if (!rawMessage) return fallback

    const message = String(rawMessage).trim()
    const normalized = message.toLowerCase()

    if (
      normalized.includes('invalid email or password') ||
      normalized.includes('invalid credentials') ||
      normalized.includes('wrong password') ||
      normalized.includes('incorrect password')
    ) {
      return 'E-Mail oder Passwort ist falsch.'
    }

    if (
      normalized.includes('user already exists') ||
      normalized.includes('already registered') ||
      normalized.includes('email already in use') ||
      normalized.includes('email has already been taken')
    ) {
      return 'Diese E-Mail ist bereits registriert.'
    }

    if (
      normalized.includes('invalid email') ||
      normalized.includes('email is invalid')
    ) {
      return 'Bitte eine gueltige E-Mail-Adresse eingeben.'
    }

    if (
      normalized.includes('password must be at least') ||
      normalized.includes('password too short')
    ) {
      return 'Passwort muss mindestens 8 Zeichen haben.'
    }

    if (normalized.includes('too many requests') || normalized.includes('rate limit')) {
      return 'Zu viele Versuche. Bitte kurz warten und erneut probieren.'
    }

    if (normalized.includes('invalid token')) {
      return 'Der Reset-Token ist ungueltig oder abgelaufen.'
    }

    return fallback
  }, [])

  const getErrorMessage = useCallback(async (response, authMode) => {
    const payload = await readJsonSafe(response)
    if (payload?.error?.message) return translateAuthError(payload.error.message, authMode)
    if (payload?.error) return translateAuthError(payload.error, authMode)
    if (payload?.message) return translateAuthError(payload.message, authMode)
    if (payload?.details) return translateAuthError(payload.details, authMode)
    return translateAuthError('', authMode)
  }, [readJsonSafe, translateAuthError])

  const clearFieldError = useCallback((field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      return { ...prev, [field]: '' }
    })
  }, [])

  const loadSession = useCallback(async () => {
    setIsChecking(true)
    try {
      const sessionRes = await fetch(`${API}/auth/get-session`, {
        credentials: 'include',
      })

      if (!sessionRes.ok) {
        setSessionData(null)
        setAccountData(null)
        return
      }

      const sessionPayload = await readJsonSafe(sessionRes)
      setSessionData(sessionPayload)

      if (!sessionPayload?.user?.id) {
        setAccountData(null)
        return
      }

      const accountRes = await fetch(`${API}/account/me`, {
        credentials: 'include',
      })

      if (!accountRes.ok) {
        setAccountData(null)
        return
      }

      const accountPayload = await readJsonSafe(accountRes)
      setAccountData(accountPayload)
    } catch {
      setSessionData(null)
      setAccountData(null)
      setNotice({ type: 'error', text: 'Konto konnte gerade nicht geladen werden.' })
    } finally {
      setIsChecking(false)
    }
  }, [readJsonSafe])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    let active = true

    fetch(`${API}/account/auth-options`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active || !payload) return
        setAuthOptions({
          googleEnabled: !!payload.googleEnabled,
          appleEnabled: !!payload.appleEnabled,
          passwordResetEnabled: !!payload.passwordResetEnabled,
        })
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token) return

    setMode('reset')
    setResetToken(token)
    setNotice({ type: 'success', text: 'Bitte neues Passwort setzen.' })
  }, [])

  const handleAuthSubmit = useCallback(async (event) => {
    event.preventDefault()
    if (isBusy) return

    const cleanEmail = email.trim().toLowerCase()
    const nextErrors = { name: '', email: '', password: '' }

    if (showNameField && !name.trim()) {
      nextErrors.name = 'Bitte einen Namen eingeben.'
    }

    if (!cleanEmail) {
      nextErrors.email = 'Bitte eine E-Mail eingeben.'
    } else if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      nextErrors.email = 'Bitte eine gueltige E-Mail eingeben.'
    }

    if (!password) {
      nextErrors.password = 'Bitte ein Passwort eingeben.'
    } else if (password.length < 8) {
      nextErrors.password = 'Passwort muss mindestens 8 Zeichen haben.'
    }

    if (nextErrors.name || nextErrors.email || nextErrors.password) {
      setFieldErrors(nextErrors)
      setNotice(null)
      return
    }

    setIsBusy(true)
    setFieldErrors({ name: '', email: '', password: '' })
    setNotice(null)

    try {
      const isRegister = mode === 'register'
      const endpoint = isRegister ? `${API}/auth/sign-up/email` : `${API}/auth/sign-in/email`
      const payload = isRegister
        ? { name: name.trim(), email: cleanEmail, password }
        : { email: cleanEmail, password }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const message = await getErrorMessage(response, mode)

        if (/email/i.test(message)) {
          setFieldErrors((prev) => ({ ...prev, email: message }))
        } else if (/passwort|password/i.test(message)) {
          setFieldErrors((prev) => ({ ...prev, password: message }))
        } else if (/name/i.test(message)) {
          setFieldErrors((prev) => ({ ...prev, name: message }))
        }

        setNotice({ type: 'error', text: message })
        return
      }

      setPassword('')
      setShowPassword(false)
      if (isRegister) setName('')
      setNotice({ type: 'success', text: isRegister ? 'Konto erstellt und angemeldet.' : 'Erfolgreich angemeldet.' })
      await loadSession()
      onAuthStateChange()
    } catch {
      setNotice({ type: 'error', text: 'Netzwerkfehler. Bitte erneut versuchen.' })
    } finally {
      setIsBusy(false)
    }
  }, [email, getErrorMessage, isBusy, loadSession, mode, name, onAuthStateChange, password, showNameField])

  const clearResetError = useCallback((field) => {
    setResetErrors((prev) => {
      if (!prev[field]) return prev
      return { ...prev, [field]: '' }
    })
  }, [])

  const handlePasswordResetRequest = useCallback(async (event) => {
    event.preventDefault()
    if (isBusy) return

    const cleanEmail = resetEmail.trim().toLowerCase()
    const nextErrors = { email: '', token: '', password: '', confirm: '' }

    if (!cleanEmail) {
      nextErrors.email = 'Bitte eine E-Mail eingeben.'
    } else if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      nextErrors.email = 'Bitte eine gueltige E-Mail eingeben.'
    }

    if (nextErrors.email) {
      setResetErrors(nextErrors)
      return
    }

    setIsBusy(true)
    setResetErrors({ email: '', token: '', password: '', confirm: '' })
    setNotice(null)

    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`
      const response = await fetch(`${API}/auth/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: cleanEmail,
          redirectTo,
        }),
      })

      if (!response.ok) {
        const message = await getErrorMessage(response, 'reset-request')
        setNotice({ type: 'error', text: message })
        return
      }

      setNotice({
        type: 'success',
        text: 'Wenn die E-Mail existiert, wurde ein Link zum Zuruecksetzen versendet.',
      })
    } catch {
      setNotice({ type: 'error', text: 'Netzwerkfehler. Bitte erneut versuchen.' })
    } finally {
      setIsBusy(false)
    }
  }, [getErrorMessage, isBusy, resetEmail])

  const handlePasswordResetComplete = useCallback(async (event) => {
    event.preventDefault()
    if (isBusy) return

    const token = resetToken.trim()
    const nextErrors = { email: '', token: '', password: '', confirm: '' }

    if (!token) {
      nextErrors.token = 'Bitte einen Reset-Token eingeben.'
    }

    if (!resetPassword) {
      nextErrors.password = 'Bitte ein neues Passwort eingeben.'
    } else if (resetPassword.length < 8) {
      nextErrors.password = 'Passwort muss mindestens 8 Zeichen haben.'
    }

    if (!resetPasswordConfirm) {
      nextErrors.confirm = 'Bitte Passwort wiederholen.'
    } else if (resetPassword !== resetPasswordConfirm) {
      nextErrors.confirm = 'Die Passwoerter stimmen nicht ueberein.'
    }

    if (nextErrors.token || nextErrors.password || nextErrors.confirm) {
      setResetErrors(nextErrors)
      return
    }

    setIsBusy(true)
    setResetErrors({ email: '', token: '', password: '', confirm: '' })
    setNotice(null)

    try {
      const response = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token,
          newPassword: resetPassword,
        }),
      })

      if (!response.ok) {
        const message = await getErrorMessage(response, 'reset-complete')
        setNotice({ type: 'error', text: message || 'Zuruecksetzen fehlgeschlagen.' })
        return
      }

      setResetToken('')
      setResetPassword('')
      setResetPasswordConfirm('')
      setShowResetPassword(false)
      setMode('login')
      setNotice({ type: 'success', text: 'Passwort erfolgreich geaendert. Bitte anmelden.' })

      const params = new URLSearchParams(window.location.search)
      if (params.has('token')) {
        params.delete('token')
        const nextSearch = params.toString()
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
        window.history.replaceState(null, '', nextUrl)
      }
    } catch {
      setNotice({ type: 'error', text: 'Netzwerkfehler. Bitte erneut versuchen.' })
    } finally {
      setIsBusy(false)
    }
  }, [getErrorMessage, isBusy, resetPassword, resetPasswordConfirm, resetToken])

  const handleSocialSignIn = useCallback(async (provider) => {
    if (isBusy) return

    setIsBusy(true)
    setNotice(null)

    try {
      const callbackURL = `${window.location.origin}${window.location.pathname}`
      const response = await fetch(`${API}/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider,
          callbackURL,
          disableRedirect: true,
        }),
      })

      const payload = await readJsonSafe(response)

      if (!response.ok || !payload?.url) {
        setNotice({ type: 'error', text: 'Social-Login ist gerade nicht verfuegbar.' })
        return
      }

      window.location.assign(payload.url)
    } catch {
      setNotice({ type: 'error', text: 'Netzwerkfehler. Bitte erneut versuchen.' })
    } finally {
      setIsBusy(false)
    }
  }, [isBusy, readJsonSafe])

  const handleSignOut = useCallback(async () => {
    if (isBusy) return
    setIsBusy(true)
    setNotice(null)

    try {
      const response = await fetch(`${API}/auth/sign-out`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok) {
        const message = await getErrorMessage(response, 'logout')
        setNotice({ type: 'error', text: message })
        return
      }

      setSessionData(null)
      setAccountData(null)
      setPassword('')
      setShowPassword(false)
      setNotice({ type: 'success', text: 'Du wurdest abgemeldet.' })
      onAuthStateChange()
    } catch {
      setNotice({ type: 'error', text: 'Netzwerkfehler. Bitte erneut versuchen.' })
    } finally {
      setIsBusy(false)
    }
  }, [getErrorMessage, isBusy, onAuthStateChange])

  const switchMode = useCallback((nextMode) => {
    if (isBusy || mode === nextMode) return
    setMode(nextMode)
    setNotice(null)
    setFieldErrors({ name: '', email: '', password: '' })
    setResetErrors({ email: '', token: '', password: '', confirm: '' })
    setName('')
    setEmail('')
    setPassword('')
    setShowPassword(false)
    setResetEmail('')
    setResetPassword('')
    setResetPasswordConfirm('')
    setShowResetPassword(false)
    if (nextMode !== 'reset') setResetToken('')
  }, [isBusy, mode])

  return (
    <div className="tab-placeholder">
      <TabHeader />
      <div className="tab-placeholder-inner">
        <div className="tab-placeholder-head">
          <h2 className="tab-placeholder-title">Konto</h2>
          <span className="tab-placeholder-ipa">[ˈkɔnto]</span>
        </div>
        <div className="tab-placeholder-grammar">
          <span className="tab-placeholder-pos">Bereich</span>
          <span className="tab-placeholder-rule-line" />
          <span className="tab-placeholder-category">Einstellungen</span>
        </div>
        <p className="tab-placeholder-definition">
          Dein Konto, dein Abonnement und deine Einstellungen. Anmeldung und Registrierung sind jetzt verfuegbar; weitere Kontofunktionen folgen schrittweise.
        </p>

        <section className="konto-auth-card" aria-live="polite">
          <header className="konto-auth-head">
            <h3 className="konto-auth-title">Zugang</h3>
            {!isLoggedIn && !isResetMode && (
              <div className="konto-auth-modes" role="tablist" aria-label="Anmeldeart">
                <button
                  className={`konto-auth-mode${mode === 'login' ? ' konto-auth-mode--active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => switchMode('login')}
                >
                  Anmelden
                </button>
                <button
                  className={`konto-auth-mode${mode === 'register' ? ' konto-auth-mode--active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={mode === 'register'}
                  onClick={() => switchMode('register')}
                >
                  Registrieren
                </button>
              </div>
            )}
          </header>

          {isChecking ? (
            <p className="konto-auth-note">Kontostand wird geladen …</p>
          ) : isResetMode ? (
            <>
              <form className="konto-auth-form" onSubmit={handlePasswordResetRequest}>
                <label className="konto-auth-field">
                  <span>E-Mail (Passwort-Link)</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(event) => {
                      setResetEmail(event.target.value)
                      clearResetError('email')
                    }}
                    disabled={isBusy || !authOptions.passwordResetEnabled}
                    aria-invalid={resetErrors.email ? 'true' : 'false'}
                    required
                  />
                  {resetErrors.email && <span className="konto-auth-field-error">{resetErrors.email}</span>}
                </label>

                <button
                  className="test-cta"
                  type="submit"
                  disabled={isBusy || !authOptions.passwordResetEnabled}
                >
                  Passwort-Link senden
                  <span className="test-cta-arrow" aria-hidden="true">→</span>
                </button>
              </form>

              <form className="konto-auth-form konto-auth-form--reset" onSubmit={handlePasswordResetComplete}>
                <label className="konto-auth-field">
                  <span>Reset-Token</span>
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(event) => {
                      setResetToken(event.target.value)
                      clearResetError('token')
                    }}
                    disabled={isBusy || !authOptions.passwordResetEnabled}
                    aria-invalid={resetErrors.token ? 'true' : 'false'}
                    required
                  />
                  {resetErrors.token && <span className="konto-auth-field-error">{resetErrors.token}</span>}
                </label>

                <label className="konto-auth-field">
                  <span>Neues Passwort</span>
                  <div className="konto-auth-password-wrap">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      value={resetPassword}
                      onChange={(event) => {
                        setResetPassword(event.target.value)
                        clearResetError('password')
                      }}
                      disabled={isBusy || !authOptions.passwordResetEnabled}
                      aria-invalid={resetErrors.password ? 'true' : 'false'}
                      required
                    />
                    <button
                      className="konto-auth-password-toggle"
                      type="button"
                      onClick={() => setShowResetPassword((prev) => !prev)}
                      aria-label={showResetPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                      aria-pressed={showResetPassword ? 'true' : 'false'}
                      disabled={isBusy || !authOptions.passwordResetEnabled}
                    >
                      {showResetPassword ? 'Verbergen' : 'Anzeigen'}
                    </button>
                  </div>
                  {resetErrors.password && <span className="konto-auth-field-error">{resetErrors.password}</span>}
                </label>

                <label className="konto-auth-field">
                  <span>Neues Passwort wiederholen</span>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    minLength={8}
                    value={resetPasswordConfirm}
                    onChange={(event) => {
                      setResetPasswordConfirm(event.target.value)
                      clearResetError('confirm')
                    }}
                    disabled={isBusy || !authOptions.passwordResetEnabled}
                    aria-invalid={resetErrors.confirm ? 'true' : 'false'}
                    required
                  />
                  {resetErrors.confirm && <span className="konto-auth-field-error">{resetErrors.confirm}</span>}
                </label>

                <button
                  className="test-cta"
                  type="submit"
                  disabled={isBusy || !authOptions.passwordResetEnabled}
                >
                  Neues Passwort setzen
                  <span className="test-cta-arrow" aria-hidden="true">→</span>
                </button>

                {!authOptions.passwordResetEnabled && (
                  <p className="konto-auth-note konto-auth-note--error">
                    Passwort-Zuruecksetzen ist derzeit nicht konfiguriert.
                  </p>
                )}
              </form>

              <button
                className="konto-auth-inline-link"
                type="button"
                onClick={() => switchMode('login')}
                disabled={isBusy}
              >
                Zurueck zur Anmeldung
              </button>
            </>
          ) : isLoggedIn ? (
            <div className="konto-session">
              <dl className="konto-session-list">
                <div>
                  <dt>Name</dt>
                  <dd>{sessionData.user.name || '—'}</dd>
                </div>
                <div>
                  <dt>E-Mail</dt>
                  <dd>{sessionData.user.email}</dd>
                </div>
                <div>
                  <dt>Rolle</dt>
                  <dd>{accountData?.role === 'teacher' ? 'Lehrkraft' : 'Nutzer'}</dd>
                </div>
              </dl>

              {accountData?.role === 'teacher' && (
                <div className="konto-teacher-note" role="status">
                  <p className="konto-teacher-note-title">Lehrkraftkonto aktiv</p>
                  <p className="konto-teacher-note-text">
                    Du kannst im Tab Klassenraum Sitzungen erstellen, starten, exportieren und Ergebnisse live verfolgen.
                  </p>
                </div>
              )}

              <button
                className="test-cta"
                type="button"
                onClick={handleSignOut}
                disabled={isBusy}
              >
                Abmelden
                <span className="test-cta-arrow" aria-hidden="true">→</span>
              </button>

              <button
                className="konto-auth-inline-link"
                type="button"
                onClick={() => switchMode('reset')}
                disabled={isBusy}
              >
                Passwort zuruecksetzen
              </button>
            </div>
          ) : (
            <form className="konto-auth-form" onSubmit={handleAuthSubmit}>
              {showNameField && (
                <label className="konto-auth-field">
                  <span>Name</span>
                  <input
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      clearFieldError('name')
                    }}
                    disabled={isBusy}
                    aria-invalid={fieldErrors.name ? 'true' : 'false'}
                    required
                  />
                  {fieldErrors.name && <span className="konto-auth-field-error">{fieldErrors.name}</span>}
                </label>
              )}

              <label className="konto-auth-field">
                <span>E-Mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    clearFieldError('email')
                  }}
                  disabled={isBusy}
                  aria-invalid={fieldErrors.email ? 'true' : 'false'}
                  required
                />
                {fieldErrors.email && <span className="konto-auth-field-error">{fieldErrors.email}</span>}
              </label>

              <label className="konto-auth-field">
                <span>Passwort</span>
                <div className="konto-auth-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={showNameField ? 'new-password' : 'current-password'}
                    minLength={8}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      clearFieldError('password')
                    }}
                    disabled={isBusy}
                    aria-invalid={fieldErrors.password ? 'true' : 'false'}
                    required
                  />
                  <button
                    className="konto-auth-password-toggle"
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    aria-pressed={showPassword ? 'true' : 'false'}
                    disabled={isBusy}
                  >
                    {showPassword ? 'Verbergen' : 'Anzeigen'}
                  </button>
                </div>
                {fieldErrors.password && <span className="konto-auth-field-error">{fieldErrors.password}</span>}
              </label>

              <button className="test-cta" type="submit" disabled={isBusy}>
                {mode === 'register' ? 'Konto erstellen' : 'Anmelden'}
                <span className="test-cta-arrow" aria-hidden="true">→</span>
              </button>

              <button
                className="konto-auth-inline-link"
                type="button"
                onClick={() => switchMode('reset')}
                disabled={isBusy}
              >
                Passwort vergessen?
              </button>

              {(authOptions.googleEnabled || authOptions.appleEnabled) && (
                <div className="konto-auth-socials">
                  <p className="konto-auth-socials-label">oder mit</p>
                  <div className="konto-auth-socials-actions">
                    {authOptions.googleEnabled && (
                      <button
                        className="konto-auth-social-btn"
                        type="button"
                        onClick={() => handleSocialSignIn('google')}
                        disabled={isBusy}
                      >
                        Google
                      </button>
                    )}
                    {authOptions.appleEnabled && (
                      <button
                        className="konto-auth-social-btn"
                        type="button"
                        onClick={() => handleSocialSignIn('apple')}
                        disabled={isBusy}
                      >
                        Apple
                      </button>
                    )}
                  </div>
                </div>
              )}
            </form>
          )}

          {notice && (
            <p className={`konto-auth-note konto-auth-note--${notice.type}`}>{notice.text}</p>
          )}
        </section>

        <div className="tab-placeholder-unlock-status">
          {gesamtausgabe ? (
            <>
              <span className="tab-placeholder-unlock-check">✓</span>
              <span className="tab-placeholder-unlock-label">Gesamtausgabe freigeschaltet</span>
              <span className="tab-placeholder-unlock-sub">kostenlos bis Paywall aktiv</span>
            </>
          ) : (
            <>
              <span className="tab-placeholder-unlock-label">Gesamtausgabe nicht freigeschaltet</span>
              <button
                className="test-cta test-cta--locked"
                type="button"
                onClick={onUnlock}
                style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '3px 10px' }}
              >
                Freischalten
              </button>
            </>
          )}
        </div>

        <ul className="tab-placeholder-features">
          <li>Kontoerstellung und Login (E-Mail) verfuegbar</li>
          <li>Geräteübergreifender Spielfortschritt und Streak</li>
          <li>Gesamtausgabe-Abonnement verwalten und kündigen</li>
          <li>Spielhistorie der letzten 365 Tage</li>
          <li>Klassenraum-Sitzungen erstellen und verwalten</li>
          <li>Push-Benachrichtigungen – tägliche Erinnerung zum Spielen</li>
          <li>Erscheinungsbild und Sprache konfigurieren</li>
        </ul>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-status">In Entwicklung.</span>
          <span className="tab-placeholder-edition">Erscheint in einer späteren Auflage.</span>
        </div>

        <nav className="tab-profil-legal" aria-label="Rechtliche Links">
          <a href="/ueber.html" target="_blank" rel="noopener">Über die App</a>
          <a href="/impressum.html" target="_blank" rel="noopener">Impressum</a>
          <a href="/datenschutz.html" target="_blank" rel="noopener">Datenschutz</a>
          <a href="/nutzungsbedingungen.html" target="_blank" rel="noopener">Nutzungsbedingungen</a>
        </nav>
      </div>
    </div>
  )
}
