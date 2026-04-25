import { useCallback, useEffect, useState } from 'react'
import { API } from '../config'

const EMPTY_FIELD_ERRORS = { name: '', email: '', password: '' }
const EMPTY_RESET_ERRORS = { email: '', token: '', password: '', confirm: '' }

export function useKontoAuth({ onAuthStateChange = () => {} }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authOptions, setAuthOptions] = useState({
    googleEnabled: false,
    appleEnabled: false,
    githubEnabled: false,
    passwordResetEnabled: false,
  })
  const [resetEmail, setResetEmail] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState(EMPTY_FIELD_ERRORS)
  const [resetErrors, setResetErrors] = useState(EMPTY_RESET_ERRORS)
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

  const clearResetError = useCallback((field) => {
    setResetErrors((prev) => {
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
          githubEnabled: !!payload.githubEnabled,
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
    const nextErrors = { ...EMPTY_FIELD_ERRORS }

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
    setFieldErrors(EMPTY_FIELD_ERRORS)
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

  const handlePasswordResetRequest = useCallback(async (event) => {
    event.preventDefault()
    if (isBusy) return

    const cleanEmail = resetEmail.trim().toLowerCase()
    const nextErrors = { ...EMPTY_RESET_ERRORS }

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
    setResetErrors(EMPTY_RESET_ERRORS)
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
    const nextErrors = { ...EMPTY_RESET_ERRORS }

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
    setResetErrors(EMPTY_RESET_ERRORS)
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
    setFieldErrors(EMPTY_FIELD_ERRORS)
    setResetErrors(EMPTY_RESET_ERRORS)
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

  return {
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
  }
}
