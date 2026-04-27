import { useState } from 'react'

export default function KontoAuthCard({ auth }) {
  const {
    mode,
    name,
    email,
    password,
    showPassword,
    authOptions,
    resetEmail,
    resetPassword,
    resetPasswordConfirm,
    showResetPassword,
    fieldErrors,
    resetErrors,
    sessionData,
    accountData,
    isBusy,
    isChecking,
    notice,
    isLoggedIn,
    showNameField,
    isResetMode,
    setName,
    setEmail,
    setPassword,
    setShowPassword,
    setResetEmail,
    setResetPassword,
    setResetPasswordConfirm,
    setShowResetPassword,
    clearFieldError,
    clearResetError,
    handleAuthSubmit,
    handlePasswordResetRequest,
    handlePasswordResetComplete,
    handleSocialSignIn,
    handleSignOut,
  handleDeleteAccount,
  switchMode,
} = auth

const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <section className="konto-auth-card">
      {!isLoggedIn && !isResetMode && (
        <header className="konto-auth-head">
          <div className="konto-auth-modes">
            <button
              className={`konto-auth-mode${mode === 'login' ? ' konto-auth-mode--active' : ''}`}
              type="button"
              aria-current={mode === 'login' ? 'true' : undefined}
              onClick={() => switchMode('login')}
            >
              Anmelden
            </button>
            <button
              className={`konto-auth-mode${mode === 'register' ? ' konto-auth-mode--active' : ''}`}
              type="button"
              aria-current={mode === 'register' ? 'true' : undefined}
              onClick={() => switchMode('register')}
            >
              Registrieren
            </button>
          </div>
        </header>
      )}

      {notice && (
        <p aria-live="polite" className={`konto-auth-note konto-auth-note--${notice.type}`}
           style={{ marginBottom: '12px', marginTop: '0' }}>
          {notice.text}
        </p>
      )}

      {isChecking ? (
        <p className="konto-auth-note">Kontostand wird geladen …</p>
      ) : mode === 'reset-request' ? (
        <>
          <p className="konto-auth-note" style={{ marginTop: 0, marginBottom: '8px' }}>
            Wir senden dir einen Link zum Zurücksetzen deines Passworts.
          </p>
          <form className="konto-auth-form" onSubmit={handlePasswordResetRequest}>
            <label className="konto-auth-field">
              <span>E-Mail</span>
              <input
                id="konto-reset-req-email"
                type="email"
                autoComplete="email"
                value={resetEmail}
                onChange={(event) => {
                  setResetEmail(event.target.value)
                  clearResetError('email')
                }}
                disabled={isBusy || !authOptions.passwordResetEnabled}
                aria-invalid={resetErrors.email ? 'true' : 'false'}
                aria-describedby={resetErrors.email ? 'konto-reset-req-email-error' : undefined}
                required
              />
              {resetErrors.email && (
                <span id="konto-reset-req-email-error" className="konto-auth-field-error">
                  {resetErrors.email}
                </span>
              )}
            </label>

            <button
              className="test-cta"
              type="submit"
              disabled={isBusy || !authOptions.passwordResetEnabled}
            >
              Passwort-Link senden
              <span className="test-cta-arrow" aria-hidden="true">→</span>
            </button>

            {!authOptions.passwordResetEnabled && (
              <p className="konto-auth-note konto-auth-note--error">
                Passwort-Zurücksetzen ist derzeit nicht konfiguriert.
              </p>
            )}
          </form>

          <button
            className="konto-auth-inline-link"
            type="button"
            onClick={() => switchMode('login')}
            disabled={isBusy}
          >
            Zurück zur Anmeldung
          </button>
        </>
      ) : mode === 'reset-complete' ? (
        <>
          <form className="konto-auth-form konto-auth-form--reset" onSubmit={handlePasswordResetComplete}>
            <label className="konto-auth-field">
              <span>Neues Passwort</span>
              <div className="konto-auth-password-wrap">
                <input
                  id="konto-reset-password"
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
                  aria-describedby={resetErrors.password ? 'konto-reset-password-error' : undefined}
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
              {resetErrors.password && (
                <span id="konto-reset-password-error" className="konto-auth-field-error">
                  {resetErrors.password}
                </span>
              )}
            </label>

            <label className="konto-auth-field">
              <span>Neues Passwort wiederholen</span>
              <input
                id="konto-reset-confirm"
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
                aria-describedby={resetErrors.confirm ? 'konto-reset-confirm-error' : undefined}
                required
              />
              {resetErrors.confirm && (
                <span id="konto-reset-confirm-error" className="konto-auth-field-error">
                  {resetErrors.confirm}
                </span>
              )}
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
                Passwort-Zurücksetzen ist derzeit nicht konfiguriert.
              </p>
            )}
          </form>

          <button
            className="konto-auth-inline-link"
            type="button"
            onClick={() => switchMode('login')}
            disabled={isBusy}
          >
            Zurück zur Anmeldung
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
              <dd>{accountData?.role === 'premium' ? 'Premium' : 'Basis'}</dd>
            </div>
          </dl>

          {accountData?.role === 'premium' && (
            <div className="konto-teacher-note" role="status">
              <p className="konto-teacher-note-title">
                <span className="konto-teacher-note-symbol" aria-hidden="true">§</span>
                Klassenraum aktiv
              </p>
              <p className="konto-teacher-note-text">
                Du kannst im Tab Klassenraum Sitzungen erstellen, starten, exportieren und Ergebnisse live verfolgen.
              </p>
            </div>
          )}

          <button
            className="konto-session-signout"
            type="button"
            onClick={handleSignOut}
            disabled={isBusy}
          >
            Abmelden
          </button>

          {confirmDelete ? (
            <div className="konto-auth-delete-confirm">
              <p className="konto-auth-note konto-auth-note--error">
                Konto wirklich löschen? Alle Daten werden unwiderruflich entfernt.
              </p>
              <button
                className="konto-auth-inline-link konto-auth-inline-link--danger"
                type="button"
                onClick={handleDeleteAccount}
                disabled={isBusy}
              >
                Ja, Konto löschen
              </button>
              <button
                className="konto-auth-inline-link konto-auth-inline-link--secondary"
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={isBusy}
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <div className="konto-session-meta">
              <button
                className="konto-session-meta-link"
                type="button"
                onClick={() => switchMode('reset-request')}
                disabled={isBusy}
              >
                Passwort zurücksetzen
              </button>
              <span className="konto-session-meta-sep" aria-hidden="true">·</span>
              <button
                className="konto-session-meta-link konto-session-meta-link--danger"
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={isBusy}
              >
                Konto löschen
              </button>
            </div>
          )}
        </div>
      ) : (
        <form className="konto-auth-form" onSubmit={handleAuthSubmit}>
          {showNameField && (
            <label className="konto-auth-field">
              <span>Name</span>
              <input
                id="konto-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  clearFieldError('name')
                }}
                disabled={isBusy}
                aria-invalid={fieldErrors.name ? 'true' : 'false'}
                aria-describedby={fieldErrors.name ? 'konto-name-error' : undefined}
                required
              />
              {fieldErrors.name && (
                <span id="konto-name-error" className="konto-auth-field-error">{fieldErrors.name}</span>
              )}
            </label>
          )}

          <label className="konto-auth-field">
            <span>E-Mail</span>
            <input
              id="konto-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                clearFieldError('email')
              }}
              disabled={isBusy}
              aria-invalid={fieldErrors.email ? 'true' : 'false'}
              aria-describedby={fieldErrors.email ? 'konto-email-error' : undefined}
              required
            />
            {fieldErrors.email && (
              <span id="konto-email-error" className="konto-auth-field-error">{fieldErrors.email}</span>
            )}
          </label>

          <label className="konto-auth-field">
            <span>Passwort</span>
            <div className="konto-auth-password-wrap">
              <input
                id="konto-password"
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
                aria-describedby={fieldErrors.password ? 'konto-password-error' : undefined}
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
            {fieldErrors.password && (
              <span id="konto-password-error" className="konto-auth-field-error">{fieldErrors.password}</span>
            )}
          </label>

          <button className="test-cta" type="submit" disabled={isBusy}>
            {mode === 'register' ? 'Konto erstellen' : 'Anmelden'}
            <span className="test-cta-arrow" aria-hidden="true">→</span>
          </button>

          {mode === 'login' && (
            <button
              className="konto-auth-inline-link"
              type="button"
              onClick={() => switchMode('reset-request')}
              disabled={isBusy}
            >
              Passwort vergessen?
            </button>
          )}

          {(authOptions.googleEnabled || authOptions.appleEnabled || authOptions.githubEnabled) && (
            <div className="konto-auth-socials">
              <p className="konto-auth-socials-label">Oder mit</p>
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
                {authOptions.githubEnabled && (
                  <button
                    className="konto-auth-github-btn"
                    type="button"
                    onClick={() => handleSocialSignIn('github')}
                    disabled={isBusy}
                    aria-label="Mit GitHub fortfahren"
                  >
                    <svg aria-hidden="true" height="18" viewBox="0 0 16 16" width="18" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    Mit GitHub fortfahren
                  </button>
                )}
              </div>
            </div>
          )}
        </form>
      )}

    </section>
  )
}
