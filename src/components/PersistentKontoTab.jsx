import KontoTab from './KontoTab'

export default function PersistentKontoTab({
  activeTab,
  gesamtausgabe,
  gesamtausgabePermanent,
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
        onAuthStateChange={onAuthStateChange}
      />
    </div>
  )
}
