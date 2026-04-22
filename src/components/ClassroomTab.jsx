import ClassroomHeader from './classroom/ClassroomHeader'
import ClassroomEntries from './classroom/ClassroomEntries'
import ClassroomRaster from './classroom/ClassroomRaster'
import ClassroomSnapNav from './classroom/ClassroomSnapNav'
import { useClassroomTabState } from './classroom/useClassroomTabState'

export default function ClassroomTab({ onLiveChange = () => {}, submitRef = null, onInSessionChange = () => {}, getRetroResultsRef = null }) {
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
  })

  return (
    <div className="tab-placeholder classroom-tab">
      <ClassroomHeader />

      <ClassroomRaster rasterStatus={rasterStatus} />
      <div className="test-rule--double" role="separator" aria-hidden="true" />

      <div className="tab-placeholder-inner classroom-inner">
        {loadingAccount && <p className="cr-loading">Konto wird geladen …</p>}
        {!loadingAccount && teacherError && <p className="cr-error">{teacherError}</p>}

        <ClassroomEntries {...entriesProps} />

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Für Unterrichtssitzungen und Lerngruppen.</span>
        </div>
      </div>
      <ClassroomSnapNav {...snapNavProps} />
    </div>
  )
}
