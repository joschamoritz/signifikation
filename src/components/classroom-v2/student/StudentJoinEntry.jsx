// T-4.1 Phase-4-Stub.
// Vollausbau folgt in Phase 5 (T-5.x). Diese Datei rendert nur so viel,
// dass /c im Browser ohne Crash erreichbar ist und der Teacher-Walkthrough
// am Ende der Session den Student-Pfad anspringen kann.
import { TestFeatureBadge } from '../shared/TestFeatureBadge'

export default function StudentJoinEntry() {
  return (
    <div className="cr2-kiosk-stub">
      <div className="cr2-kiosk-stub__inner">
        <TestFeatureBadge label="Klassenraum v2 · Schüler" />
        <h1 className="cr2-kiosk-stub__title">Beitreten</h1>
        <p className="cr2-kiosk-stub__hint">
          Diese Ansicht wird in Phase 5 gebaut. Bitte Zugangscode in der URL angeben,
          z.&nbsp;B. <code>/c/morgentau</code>.
        </p>
      </div>
    </div>
  )
}
