// Niveau-Segmentumschalter (DaZ · Sek I · Sek II · LK). Seit dem Üben-Redesign
// nicht mehr pro Station, sondern zentral: in der Anm./Manicula der Kurs-
// Startseite und im Profil (Konto). Der Wert ist global (useGlobalNiveau) und
// steuert Aufgaben + Material aller Stationen.
import { NIVEAU_LEVELS, NIVEAU_LABELS } from './useGlobalNiveau'

export default function NiveauSwitcher({ niveau, onChange, label = 'Niveau', hint = null }) {
  return (
    <div className="course-niveau">
      <div className="course-niveau-row">
        <span className="course-niveau-label">{label}</span>
        <div className="course-niveau-segment" role="group" aria-label="Niveaustufe wählen">
          {NIVEAU_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              className={`course-niveau-btn${niveau === level ? ' course-niveau-btn--active' : ''}`}
              aria-pressed={niveau === level}
              onClick={() => onChange(level)}
            >
              {NIVEAU_LABELS[level]}
            </button>
          ))}
        </div>
      </div>
      {hint && <p className="course-niveau-hint">{hint}</p>}
    </div>
  )
}
