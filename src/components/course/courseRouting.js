// Minimaler Hash-Router fuer die Station-Detail-Ansicht des Kurs-Tabs.
//
// Bewusst im Geiste von src/components/classroom/student/routing.js gehalten:
// keine react-router-Dependency, nur History-API + ein Custom-Event, damit
// Komponenten ueber einen Hook reagieren. Wir nutzen den URL-*Hash*
// (#kurs/<stationId>) statt des Pfads, weil der Kurs-Tab innerhalb des
// React-Tab-Systems lebt und der Pfad dem /c-Kiosk-Matcher gehoert.
//
// Effekt: Geraet-/Browser-Zurueck schliesst die Detailansicht (statt die App
// zu verlassen), und ein offener Stations-Hash ueberlebt einen Tab-Wechsel.

import { useEffect, useState } from 'react'

const HASH_PREFIX = '#kurs/'

/** Liest die Stations-ID aus dem Hash oder null. Normalisiert wie der Kiosk. */
function parseHash(hash) {
  if (!hash || !hash.startsWith(HASH_PREFIX)) return null
  const raw = hash.slice(HASH_PREFIX.length).replace(/\/$/, '')
  if (!raw) return null
  try {
    const decoded = decodeURIComponent(raw)
    return decoded.toLowerCase().replace(/[^a-z0-9-]/g, '') || null
  } catch {
    return raw
  }
}

/**
 * Aktuelle Stations-ID (oder null = Uebersicht). Aktualisiert sich auf
 * popstate (Zurueck/Vor) und auf openCourseStation/closeCourseStation via
 * Custom-Event "course:navigate".
 */
export function useCourseStation() {
  const [stationId, setStationId] = useState(() =>
    typeof window === 'undefined' ? null : parseHash(window.location.hash),
  )

  useEffect(() => {
    function read() { setStationId(parseHash(window.location.hash)) }
    window.addEventListener('popstate', read)
    window.addEventListener('hashchange', read)
    window.addEventListener('course:navigate', read)
    return () => {
      window.removeEventListener('popstate', read)
      window.removeEventListener('hashchange', read)
      window.removeEventListener('course:navigate', read)
    }
  }, [])

  return stationId
}

/** Detailansicht oeffnen — legt einen History-Eintrag an (Zurueck kehrt zur Liste). */
export function openCourseStation(id) {
  if (typeof window === 'undefined' || !id) return
  window.history.pushState({}, '', `${HASH_PREFIX}${encodeURIComponent(id)}`)
  window.dispatchEvent(new Event('course:navigate'))
}

/**
 * Detailansicht schliessen → zurueck zur Uebersicht. Wir ersetzen den Hash
 * (replaceState), damit kein zusaetzlicher History-Eintrag entsteht; der beim
 * Oeffnen angelegte Eintrag bleibt fuer den Browser-Zurueck-Button erhalten.
 */
export function closeCourseStation() {
  if (typeof window === 'undefined') return
  const base = window.location.pathname + window.location.search
  window.history.replaceState({}, '', base)
  window.dispatchEvent(new Event('course:navigate'))
}
