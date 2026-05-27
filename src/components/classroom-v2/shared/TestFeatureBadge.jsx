import './TestFeatureBadge.css'

export function TestFeatureBadge({ label = 'Klassenraum v2' }) {
  return (
    <div className="test-feature-badge">
      <span className="test-feature-badge__marker">TEST</span>
      <span className="test-feature-badge__label">{label}</span>
    </div>
  )
}
