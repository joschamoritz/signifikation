// Natives <select> für die Niveauwahl — Wörterbuch-Ästhetik (schlichter Text +
// Chevron statt App-Dropdown). Sitzt im Desktop-Raster-Header (KursTab) und
// kompakt im mobilen TabHeader (test-title-right), beide an denselben
// useGlobalNiveau-Zustand gebunden.
import { NIVEAU_LEVELS, NIVEAU_LABELS } from './useGlobalNiveau'

export default function NiveauSelect({ niveau, onChange, className = '', ariaLabel = 'Niveaustufe wählen' }) {
  return (
    <span className={`niveau-select-wrap ${className}`.trim()}>
      <select
        className="niveau-select"
        value={niveau}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        {NIVEAU_LEVELS.map((level) => (
          <option key={level} value={level}>{NIVEAU_LABELS[level]}</option>
        ))}
      </select>
      <span className="niveau-select-chevron" aria-hidden="true">▾</span>
    </span>
  )
}
