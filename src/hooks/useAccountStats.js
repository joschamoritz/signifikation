import { useEffect, useState } from 'react'
import { API } from '../config'
import { apiFetch } from '../utils/apiFetch'

// Lädt die serverseitige Spielstatistik des eingeloggten Nutzers.
// Liefert null, solange nicht geladen, bei anonymen Nutzern (401) oder bei
// Fehlern – der Aufrufer fällt dann auf den lokalen Verlauf zurück.
export function useAccountStats() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(`${API}/account/stats`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setStats(data) })
      .catch(() => { if (!cancelled) setStats(null) })
    return () => { cancelled = true }
  }, [])

  return stats
}
