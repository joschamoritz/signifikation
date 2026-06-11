import { useState, useEffect, useCallback, useMemo, createContext } from 'react'
import { Capacitor } from '@capacitor/core'

export const ThemeContext = createContext({ pref: 'auto', setTheme: () => {} })

const STORAGE_KEY = 'signifikation-theme'
const IS_NATIVE = Capacitor.isNativePlatform()

function resolveTheme(pref) {
  if (pref === 'dark') return 'dark'
  if (pref === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// StatusBar-Style folgt dem aktiven Theme. Style.Dark = dunkler Inhalt für hellen
// Hintergrund (Light Mode), Style.Light = heller Inhalt für dunklen Hintergrund.
async function applyNativeStatusBar(theme) {
  if (!IS_NATIVE) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Light : Style.Dark })
  } catch { /* Plugin fehlt oder unterstützt Plattform nicht – ignorieren */ }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  applyNativeStatusBar(theme)
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

  // Stabile Identitaet: der Wert wandert als Context-Value durch App.jsx —
  // ohne Memo bekaeme jeder App-Render eine neue Objekt-Identitaet.
  return useMemo(() => ({ pref, setTheme }), [pref, setTheme])
}
