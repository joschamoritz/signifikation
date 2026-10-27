import { useEffect, useRef, useState } from 'react'

// Tagesdatum in der Zeitzone des Servers (Europe/Berlin), Format YYYY-MM-DD —
// dasselbe Format wie `serverDatum` aus /heute.
export function berlinDatum(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now)
}

/**
 * Lädt den Tagesinhalt nach, wenn die App über Mitternacht (Berlin) im
 * Hintergrund lag. iOS hält die WebView oft tagelang am Leben; ohne das sähe
 * man morgens noch den Vortag samt „Tag abgeschlossen".
 *
 * Nachgeladen wird nur auf der Startseite (`phase === 'home'`), damit ein
 * laufendes Spiel nicht unter den Fingern ausgetauscht wird. Kommt jemand aus
 * dem Spiel zurück, greift die Prüfung beim nächsten Phasenwechsel.
 */
export function useDayRollover({ serverDatum, phase, onNewDay, now = () => new Date() }) {
  const [sichtbarSeit, setSichtbarSeit] = useState(0)

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setSichtbarSeit((n) => n + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Je Paar (geladener Tag, heutiger Tag) nur einmal nachladen: Geht die
  // Geräteuhr falsch oder liefert der Server noch den Vortag, entstünde sonst
  // bei jedem Phasenwechsel ein neuer Abruf.
  const versucht = useRef(null)

  useEffect(() => {
    if (!serverDatum || phase !== 'home') return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const heute = berlinDatum(now())
    if (heute === serverDatum) return
    const paar = `${serverDatum}>${heute}`
    if (versucht.current === paar) return
    versucht.current = paar
    onNewDay()
  }, [serverDatum, phase, sichtbarSeit, onNewDay, now])
}
