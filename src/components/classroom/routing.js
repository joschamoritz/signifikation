// Minimaler Pfad-Router fuer /c und /c/:code.
//
// Wir nehmen bewusst keine react-router-Dependency dazu (≈10 KB gz, plus
// drei Patch-Punkte bei jedem Major-Upgrade), weil wir genau zwei Routen
// brauchen: /c und /c/:code. Alles andere bleibt im Tab-System.
//
// Native (Capacitor) laeuft immer unter capacitor://localhost/ — dort matched
// niemals /c. Das ist Absicht: die Schueler-Kiosk-Shell ist ein Web-Feature.

import { useEffect, useState } from 'react'

/**
 * Liefert das aktuelle pathname-/search-Snapshot. Aktualisiert sich auf
 * popstate (Back/Forward) und auf manuelle history.pushState/replaceState
 * via Window-Event "classroom:navigate" (siehe navigate()).
 */
export function useLocationPath() {
  const [path, setPath] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname,
  )

  useEffect(() => {
    function read() { setPath(window.location.pathname) }
    window.addEventListener('popstate', read)
    window.addEventListener('classroom:navigate', read)
    return () => {
      window.removeEventListener('popstate', read)
      window.removeEventListener('classroom:navigate', read)
    }
  }, [])

  return path
}

/**
 * Programmatische Navigation. Wir nutzen pushState + Custom-Event, damit
 * Komponenten ueber useLocationPath() reagieren koennen, ohne dass wir
 * einen vollwertigen History-Stack pflegen.
 */
export function navigate(to, { replace = false } = {}) {
  if (typeof window === 'undefined') return
  if (replace) window.history.replaceState({}, '', to)
  else window.history.pushState({}, '', to)
  window.dispatchEvent(new Event('classroom:navigate'))
}

/**
 * Matched /c und /c/:code. Liefert { match: 'entry'|'kiosk'|null, code? }.
 * Codes werden auf URL-decoded und auf lowercase + nur a-z0-9- normalisiert.
 */
export function matchClassroomRoute(pathname) {
  if (!pathname || pathname === '/') return { match: null }
  // /c oder /c/
  if (pathname === '/c' || pathname === '/c/') return { match: 'entry' }
  // /c/:code (eine Pfad-Komponente, danach optional Slash)
  const m = pathname.match(/^\/c\/([^/]+)\/?$/)
  if (m) {
    try {
      const raw = decodeURIComponent(m[1])
      const code = raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
      return { match: 'kiosk', code: code || raw }
    } catch {
      return { match: 'kiosk', code: m[1] }
    }
  }
  return { match: null }
}
