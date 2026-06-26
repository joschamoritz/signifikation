// TaskGate – Persistenz + Sperre um eine Kurs-Aufgabe.
//
// QA Station 1 (planning/Kurs-AP11-QA-Manuell Station 1.md, Abschluss) +
// Nutzerentscheidung 2026-06-25: Eine kuratierte Aufgabe ist nach der Abgabe
// GESPERRT (kein „Nochmal") und nur über den Reset im Profil neu spielbar. Das
// Ergebnis (richtig/falsch/Selbstkontrolle) ist ans eingeloggte Konto gebunden.
//
// Zwei Sperr-Darstellungen:
//   - bereits abgegeben (Konto-Ergebnis geladen) → kompakte LockedTask-Karte
//     (die konkrete Auswahl wird bewusst nicht wiederhergestellt)
//   - gerade in dieser Sitzung abgegeben → die Aufgabe bleibt mit ihrem
//     Feedback stehen, nur „Nochmal" entfällt (canRetry=false)

import { useEffect, useState } from 'react'
import TaskPlayer from './TaskPlayer'
import { TaskHead } from './TaskShell'

const LOCKED_NOTE = 'Gespeichert. Im Profil unter „Kurs-Fortschritt" neu spielbar.'

export default function TaskGate({ task, index, result = null, onResult, onChecked }) {
  // In dieser Sitzung selbst abgegeben → Aufgabe stehen lassen (Feedback
  // sichtbar), nicht durch die Lade-Sperrkarte ersetzen.
  const [selfSubmitted, setSelfSubmitted] = useState(false)

  // Geladenes Konto-Ergebnis = bereits früher abgegeben → Sperrkarte.
  const serverLocked = !!result && result.attempts > 0 && !selfSubmitted

  // Bereits gesperrte Aufgaben dem mobilen Pager als „erledigt" melden.
  useEffect(() => {
    if (serverLocked) onChecked?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverLocked])

  if (serverLocked) {
    return <LockedTask task={task} index={index} correct={result.correct} />
  }

  function handleChecked(correct) {
    setSelfSubmitted(true)
    onChecked?.()
    onResult?.(correct)
  }

  // Kuratiert + noch nicht abgegeben: spielbar, aber nach „Prüfen" gesperrt.
  return (
    <TaskPlayer
      task={task}
      index={index}
      onChecked={handleChecked}
      canRetry={false}
      lockedNote={LOCKED_NOTE}
    />
  )
}

// Kompakte Karte für bereits abgegebene Aufgaben — Fortschritt bleibt sichtbar,
// ohne den interaktiven Widget-Zustand (Auswahl) wiederherstellen zu müssen.
function LockedTask({ task, index, correct }) {
  const solved = correct === true
  const selfControl = correct === null
  const statusLabel = solved ? 'Gelöst' : selfControl ? 'Bearbeitet' : 'Nicht gelöst'
  const statusClass = solved ? 'course-fb--correct' : selfControl ? 'course-fb--neutral' : 'course-fb--wrong'
  const merksatz = task.feedback?.merksatz
  const note = solved
    ? (merksatz ? `„${merksatz}"` : 'Bereits gelöst.')
    : selfControl
      ? 'Bereits bearbeitet.'
      : 'Bereits abgegeben.'
  return (
    <div className="course-task course-task--locked">
      <TaskHead task={task} index={index} />
      <div className={`course-feedback ${statusClass}`} role="status">
        <p className="course-fb-status">{statusLabel}</p>
        <p className="course-fb-text">{note}</p>
        <p className="course-task-locked-note">Im Profil unter „Kurs-Fortschritt" neu spielbar.</p>
      </div>
    </div>
  )
}
