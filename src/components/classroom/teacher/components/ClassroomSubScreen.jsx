// Geteilte Vollbild-Unterseite des Lehrer-Tabs.
//
// Spiegelt die „Modus-Detail/Wortauswahl"-Optik der App (LemmaSelection):
// absoluter Zurück-Pfeil oben links, zentrierter Serif-Titel, optionaler
// Thema-Block (Label · Linie · Lead). Reine Hülle — Inhalt kommt als children.

import { useTeacherClassroom } from '../TeacherClassroomContext'

export default function ClassroomSubScreen({
  title,
  label = null,
  lead = null,
  testId,
  backLabel = 'Zurück zum Klassenraum',
  onBack = null,
  children,
}) {
  const { dispatch } = useTeacherClassroom()
  const handleBack = onBack || (() => dispatch({ type: 'GO_TO_INDEX' }))

  return (
    <div className="screen selection-screen classroom-subscreen" data-testid={testId}>
      <header className="selection-header">
        <button
          className="back-btn"
          type="button"
          onClick={handleBack}
          aria-label={backLabel}
          data-testid="classroom-subscreen-back"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
            <path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="classroom-subscreen__title">{title}</h1>
        {(label || lead) && (
          <div className="selection-thema-block">
            {label && <span className="selection-thema-label">{label}</span>}
            <hr className="selection-thema-rule" aria-hidden="true" />
            {lead && <p className="selection-thema">{lead}</p>}
          </div>
        )}
      </header>

      {children}
    </div>
  )
}
