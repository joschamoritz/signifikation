import ClassroomHeader from './classroom/ClassroomHeader'
import ClassroomEntries from './classroom/ClassroomEntries'
import ClassroomRaster from './classroom/ClassroomRaster'
import ClassroomSnapNav from './classroom/ClassroomSnapNav'
import { useClassroomTabState } from './classroom/useClassroomTabState'

export default function ClassroomTab({ onLiveChange = () => {}, submitRef = null, onInSessionChange = () => {}, getRetroResultsRef = null, onNavigateToKonto = () => {} }) {
  const {
    loadingAccount,
    teacherError,
    rasterStatus,
    entriesProps,
    snapNavProps,
  } = useClassroomTabState({
    onLiveChange,
    submitRef,
    onInSessionChange,
    getRetroResultsRef,
    onNavigateToKonto,
  })

  return (
    <div className="test-page classroom-tab">
      <div className="test-wrapper">
        <ClassroomHeader />

        <ClassroomRaster rasterStatus={rasterStatus} />
        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main className="classroom-inner">
          {loadingAccount && <p className="cr-loading">Konto wird geladen …</p>}
          {!loadingAccount && teacherError && <p className="cr-error">{teacherError}</p>}

          <ClassroomEntries {...entriesProps} />
        </main>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Für Unterrichtssitzungen und Lerngruppen.</span>
        </div>
      </div>
      <ClassroomSnapNav {...snapNavProps} />
    </div>
  )
}
