// Erklaertext „Was ist der Kurs?“ für die Anm./Manicula auf der Kurs-Startseite
// (Einheitlichkeit mit Spielmodi & Klassenraum). Erklärt den Lernpfad und die
// vier Niveaustufen — Single Source für Desktop-Fußnote und Mobile-Sheet.
// Seit dem Üben-Redesign sitzen hier auch die zentrale Niveau-Auswahl UND das
// Zurücksetzen des Kurs-Fortschritts (beides bewusst NICHT im Konto-Tab —
// gehört sachlich zum Kurs, nicht zu den allgemeinen Einstellungen). Der Reset
// verlangt ein Konto (Fortschritt ist ans Konto gebunden) und wird daher nur
// für Eingeloggte gezeigt.
import { useState, useCallback } from 'react'
import { useGlobalNiveau } from './course/useGlobalNiveau'
import NiveauSwitcher from './course/NiveauSwitcher'
import { apiFetch } from '../utils/apiFetch'
import { API } from '../config'

export default function KursNote({ footnotesClass, loggedIn = false }) {
  const [niveau, setNiveau] = useGlobalNiveau()

  // Kurs-Fortschritt zurücksetzen: idle → confirm → working → done | error.
  // Löscht alle Aufgaben-Ergebnisse (Station/alles wieder spielbar).
  const [resetState, setResetState] = useState('idle')
  const resetCourse = useCallback(async () => {
    setResetState('working')
    try {
      const res = await apiFetch(`${API}/course/progress`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      setResetState(res.ok ? 'done' : 'error')
    } catch {
      setResetState('error')
    }
  }, [])

  return (
    <>
      <div className="course-note-niveau">
        <NiveauSwitcher
          niveau={niveau}
          onChange={setNiveau}
          label="Stufe"
          hint="Gilt für Aufgaben und Material aller Stationen."
        />
        {loggedIn && (
          <div className="course-note-reset">
            <div className="course-niveau-row">
              <span className="course-niveau-label">Fortschritt</span>
              {resetState === 'confirm' ? (
                <span className="course-note-reset-confirm">
                  <button
                    type="button"
                    className="course-note-reset-btn course-note-reset-btn--danger"
                    onClick={resetCourse}
                  >
                    Wirklich zurücksetzen
                  </button>
                  <button
                    type="button"
                    className="course-note-reset-btn"
                    onClick={() => setResetState('idle')}
                  >
                    Abbrechen
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="course-note-reset-btn"
                  disabled={resetState === 'working'}
                  onClick={() => setResetState('confirm')}
                >
                  {resetState === 'working' ? 'Setzt zurück …'
                    : resetState === 'done' ? 'Erneut zurücksetzen'
                      : 'Zurücksetzen'}
                </button>
              )}
            </div>
            <p className="course-niveau-hint">
              {resetState === 'done'
                ? 'Zurückgesetzt — alle Stationen wieder spielbar.'
                : resetState === 'error'
                  ? 'Zurücksetzen fehlgeschlagen. Bitte erneut versuchen.'
                  : 'Löscht deine Aufgaben-Ergebnisse; alle Stationen sind wieder spielbar.'}
            </p>
          </div>
        )}
      </div>
      <p>
        Der Kurs ist ein <strong>didaktischer Lernpfad</strong> in fünf Stationen:
        von der eigenen Sprachintuition über das Korpus bis zur belegten
        Behauptung. Jede Station verbindet kurze Erklärungen, interaktive Aufgaben
        und — wo vorhanden — fertiges Unterrichtsmaterial.
      </p>
      <p>
        Jede Aufgabe gibt es in <strong>vier Niveaustufen</strong>, die dieselbe
        Idee unterschiedlich tief fassen:<sup>1</sup>
      </p>
      <ul className="course-note-levels">
        <li><strong>DaZ</strong> — Deutsch als Zweitsprache: feste Wortpaare erkennen, rein sprachlich, ohne Zahlen.</li>
        <li><strong>Sek&nbsp;I</strong> — Sekundarstufe&nbsp;I: typische von untypischen Verbindungen unterscheiden („oft / selten“).</li>
        <li><strong>Sek&nbsp;II</strong> — Sekundarstufe&nbsp;II: Häufigkeit von Bindungsstärke trennen (Frequenz vs.&nbsp;logDice).</li>
        <li><strong>LK</strong> — Leistungskurs: Daten quantifizieren und die Methode kritisch einordnen.</li>
      </ul>
      <p>
        Die Stufe wählst du oben — Aufgaben und Material aller Stationen passen
        sich an. Die Korpusdaten stammen aus einem eigenen Wortprofil<sup>2</sup>
        freier deutschsprachiger Korpora.
      </p>
      <ol className={footnotesClass}>
        <li>Die Stufung folgt dem Prinzip der Binnendifferenzierung: gleicher Gegenstand, gestaffelte kognitive Anforderung.</li>
        <li>Eigenes Wortprofil, berechnet auf Basis freier deutschsprachiger Korpora (CC&nbsp;BY-SA), syntaktisch annotiert mit dem spaCy-Modell <code>de_zdl_lg</code> (BBAW/ZDL), Dependenzen nach Universal Dependencies.</li>
      </ol>
    </>
  )
}
