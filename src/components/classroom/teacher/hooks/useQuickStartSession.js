// First-Run-Schnellstart: legt mit EINEM Tipp eine erste Live-Sitzung an —
// Modus Kollokationen + die kuratierten Wörter von heute — und springt direkt
// in die Lobby. Senkt die Reibung der ersten Sitzung (kein manuelles Setup).
//
// Reicht die bestehenden Bausteine wieder: getTodayLemmata + createSession +
// addAssignments + GO_TO_LOBBY. Wenn es heute keine Kollokationen-Tageswörter
// gibt (kein Kalendereintrag), ist der Schnellstart NICHT verfügbar (available
// = false) — die UI zeigt dann nur den normalen „Neue Sitzung"-Weg.

import { useState, useEffect, useCallback } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { getTodayLemmata, createSession, addAssignments } from './useTeacherSession'

const QUICK_MODE = 'kollokationen'
const MAX_LEMMATA = 3 // D3: max. 3 Lemmata pro Assignment

function quickTitle() {
  try {
    const d = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
    return `Klasse ${d}`
  } catch { return 'Klasse' }
}

export function useQuickStartSession() {
  const { dispatch } = useTeacherClassroom()
  const [todayIds, setTodayIds] = useState(null) // null = lädt, [] = keine
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    getTodayLemmata(QUICK_MODE)
      .then((d) => { if (alive) setTodayIds((d?.items || []).slice(0, MAX_LEMMATA).map((it) => it.id)) })
      .catch(() => { if (alive) setTodayIds([]) }) // graceful: kein Schnellstart, aber kein Fehler
    return () => { alive = false }
  }, [])

  const available = Array.isArray(todayIds) && todayIds.length > 0

  const quickStart = useCallback(async () => {
    if (busy || !available) return
    setBusy(true)
    setError(null)
    try {
      const session = await createSession({ title: quickTitle(), settings: { mode: QUICK_MODE, blockCount: 1 } })
      await addAssignments(session.id, { blocks: [{ mode: QUICK_MODE, lemmaIds: todayIds }] })
      dispatch({ type: 'GO_TO_LOBBY', sessionId: session.id })
      // busy bleibt true bis zum Step-Wechsel — verhindert Doppel-Tipp.
    } catch (err) {
      setError(err?.message || 'Schnellstart fehlgeschlagen — versuch es manuell.')
      setBusy(false)
    }
  }, [busy, available, todayIds, dispatch])

  return { available, loading: todayIds === null, busy, error, quickStart }
}
