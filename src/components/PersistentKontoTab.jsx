import KontoTab from './KontoTab'

export default function PersistentKontoTab({
  activeTab,
  gesamtausgabe,
  gesamtausgabePermanent,
  freeAccessToday,
  freeAccessLabel,
  onAuthStateChange,
}) {
  const hidden = activeTab !== 'profil'
  return (
    <div
      aria-hidden={hidden ? 'true' : undefined}
      style={hidden ? { display: 'none' } : undefined}
    >
      <KontoTab
        gesamtausgabe={gesamtausgabe}
        gesamtausgabePermanent={gesamtausgabePermanent}
        freeAccessToday={freeAccessToday}
        freeAccessLabel={freeAccessLabel}
        onAuthStateChange={onAuthStateChange}
      />
    </div>
  )
}
