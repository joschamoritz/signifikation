export default function KontoAuthCard({
  mode,
  name,
  email,
  password,
  showPassword,
  authOptions,
  resetEmail,
  resetToken,
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
  setResetToken,
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
  switchMode,
}) {
  return (
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
            className="test-cta"
            type="button"
            onClick={handleSignOut}
            disabled={isBusy}
          >
            Abmelden
            <span className="test-cta-arrow" aria-hidden="true">→</span>
          </button>

          <button
            className="konto-auth-inline-link konto-auth-inline-link--secondary"
            type="button"
            onClick={() => switchMode('reset')}
            disabled={isBusy}
          >
            Passwort zurücksetzen
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

          {(authOptions.googleEnabled || authOptions.appleEnabled || authOptions.githubEnabled) && (
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
                {authOptions.githubEnabled && (
                  <button
                    className="konto-auth-social-btn"
                    type="button"
                    onClick={() => handleSocialSignIn('github')}
                    disabled={isBusy}
                  >
                    GitHub
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
  )
}
