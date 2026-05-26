import ClassroomTab from './ClassroomTab'
import '../styles/classroom-tab.css'

export default function PersistentClassroomTab({
  activeTab,
  onLiveChange,
  onInSessionChange,
  submitRef,
  getRetroResultsRef,
  onNavigateToKonto,
}) {
  return (
    <div
      aria-hidden={activeTab !== 'klassenraum' ? 'true' : undefined}
      style={activeTab !== 'klassenraum' ? { display: 'none' } : undefined}
    >
      <ClassroomTab
        onLiveChange={onLiveChange}
        onInSessionChange={onInSessionChange}
        submitRef={submitRef}
        getRetroResultsRef={getRetroResultsRef}
        onNavigateToKonto={onNavigateToKonto}
      />
    </div>
  )
}
