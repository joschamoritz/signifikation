// T-4.1 Phase-4-Stub.
// Vollausbau folgt in Phase 5 (T-5.1 ff.) — hier nur das Mindestmaß, um
// im Teacher-Walkthrough einen zweiten Tab auf /c/CODE zu öffnen und damit
// zu zeigen, dass die Route greift.
import { TestFeatureBadge } from '../shared/TestFeatureBadge'

export default function StudentKioskRoute({ code }) {
  return (
    <div className="cr2-kiosk-stub">
      <div className="cr2-kiosk-stub__inner">
        <TestFeatureBadge label="Klassenraum v2 · Schüler" />
        <h1 className="cr2-kiosk-stub__title">Zugangscode</h1>
        <p className="cr2-kiosk-stub__code">{code || '—'}</p>
        <p className="cr2-kiosk-stub__hint">
          Die volle Beitritts-/Spielansicht entsteht in Phase 5 (T-5.x).
        </p>
      </div>
    </div>
  )
}
