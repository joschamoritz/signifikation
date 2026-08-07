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
                autoCorrect="off"
                autoCapitalize="off"
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
                  autoCorrect="off"
                  autoCapitalize="off"
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
                autoCorrect="off"
                autoCapitalize="off"
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
              {/* Das Produkt heisst durchgehend „Gesamtausgabe", nicht
                  „Premium" (nur der DB-Rollenwert lautet so). „Basiszugang"
                  statt „Basis", weil „Basis" im Kollokations-Sinn bereits das
                  Bezugswort bezeichnet — siehe planning/Terminologie.md. */}
              <dt>Zugang</dt>
              <dd>{accountData?.role === 'premium' ? 'Gesamtausgabe' : 'Basiszugang'}</dd>
            </div>
          </dl>

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
                Eine über den App Store erworbene Gesamtausgabe bleibt an deine
                Apple-ID gebunden und lässt sich später mit „Kauf wiederherstellen“
                erneut freischalten.
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
              autoCorrect="off"
              autoCapitalize="off"
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
                autoCorrect="off"
                autoCapitalize="off"
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

          {(authOptions.googleEnabled || authOptions.appleEnabled) && (
            <div className="konto-auth-socials">
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
                    className="konto-auth-apple-btn"
                    type="button"
                    onClick={() => handleSocialSignIn('apple')}
                    disabled={isBusy}
                    aria-label="Mit Apple fortfahren"
                  >
                    <svg aria-hidden="true" height="18" viewBox="0 0 16 16" width="18" fill="currentColor">
                      <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282Z"/>
                    </svg>
                    Mit Apple fortfahren
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
