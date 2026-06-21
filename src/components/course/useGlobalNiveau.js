// Globaler Niveau-Zustand fuer den Kurs-Tab (DaZ / Sek I / Sek II / LK).
//
// „Global gemerkt" laut Kurs-Tab-IA §Niveau-Umschalter: wer LK waehlt, bleibt
// LK ueber Stationen hinweg. Persistenz in localStorage; ein Modul-Store mit
// Listenern haelt parallel gemountete Verbraucher synchron.

import { useCallback, useEffect, useState } from 'react'

export const NIVEAU_LEVELS = ['DaZ', 'SekI', 'SekII', 'LK']

// Anzeige-Labels (DM Sans, kurz) — der Store arbeitet mit den Schluesseln.
export const NIVEAU_LABELS = {
  DaZ:   'DaZ',
  SekI:  'Sek I',
  SekII: 'Sek II',
  LK:    'LK',
}

const STORAGE_KEY = 'kurs:niveau'
const DEFAULT_NIVEAU = 'SekII' // IA-Beispiel-Default

function read() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return NIVEAU_LEVELS.includes(value) ? value : DEFAULT_NIVEAU
  } catch {
    return DEFAULT_NIVEAU
  }
}

let current = read()
const listeners = new Set()

/**
 * [niveau, setNiveau] — wie useState, aber global + persistent.
 * setNiveau aktualisiert alle Abonnenten und localStorage.
 */
export function useGlobalNiveau() {
  const [niveau, setLocal] = useState(current)

  useEffect(() => {
    const listener = () => setLocal(current)
    listeners.add(listener)
    // Falls sich der Wert zwischen Render und Effekt aenderte: angleichen.
    if (current !== niveau) setLocal(current)
    return () => { listeners.delete(listener) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setNiveau = useCallback((value) => {
    if (!NIVEAU_LEVELS.includes(value) || value === current) return
    current = value
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* Speicher voll/blockiert — egal */ }
    listeners.forEach((fn) => fn())
  }, [])

  return [niveau, setNiveau]
}
