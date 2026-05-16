import { useState, useEffect, useCallback, createContext, useContext } from 'react'

export const ThemeContext = createContext({ pref: 'auto', setTheme: () => {} })

const STORAGE_KEY = 'signifikation-theme'

function resolveTheme(pref) {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme() {
  const [pref, setPref] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) ?? 'auto'
  })

  useEffect(() => {
    const resolved = resolveTheme(pref)
    applyTheme(resolved)

    if (pref !== 'auto') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme(resolveTheme('auto'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [pref])

  const setTheme = useCallback((value) => {
    localStorage.setItem(STORAGE_KEY, value)
    setPref(value)
  }, [])

  return { pref, setTheme }
}
