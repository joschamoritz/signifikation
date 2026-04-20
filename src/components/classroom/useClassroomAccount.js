import { useCallback, useEffect, useState } from 'react'
import { API } from '../../config'

export function useClassroomAccount() {
  const [account, setAccount] = useState(null)
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [teacherError, setTeacherError] = useState('')

  const loadAccount = useCallback(async () => {
    setLoadingAccount(true)
    setTeacherError('')
    try {
      const res = await fetch(`${API}/account/me`, { credentials: 'include' })
      if (!res.ok) {
        setAccount(null)
        if (res.status !== 401) {
          setTeacherError('Konto konnte nicht geladen werden.')
        }
        return
      }
      const payload = await res.json()
      setAccount(payload)
    } catch {
      setAccount(null)
      setTeacherError('Netzwerkfehler beim Laden des Kontos.')
    } finally {
      setLoadingAccount(false)
    }
  }, [])

  useEffect(() => {
    loadAccount()
  }, [loadAccount])

  return {
    account,
    loadingAccount,
    teacherError,
    setTeacherError,
  }
}
