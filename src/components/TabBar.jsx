const TABS = [
  {
    id: 'spielmodi',
    label: 'Spielmodi',
    icon: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11.5L12 3l9 8.5"/>
        <path d="M5 9.5V20a.5.5 0 00.5.5H9v-5h6v5h3.5a.5.5 0 00.5-.5V9.5"/>
      </svg>
    ),
  },
  {
    id: 'klassenraum',
    label: 'Klassenraum',
    icon: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="8.5" cy="7" r="3"/>
        <path d="M2 21c0-3.6 2.9-6.5 6.5-6.5S15 17.4 15 21"/>
        <circle cx="17" cy="8" r="2.5"/>
        <path d="M21 21c0-3-1.7-5.5-4-5.5"/>
      </svg>
    ),
  },
  {
    id: 'kurs',
    label: 'Kurs',
    icon: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4.5C10 3 6 3 3.5 4v14C6 17 10 17 12 18.5c2-1.5 6-1.5 8.5 0V4C18 3 14 3 12 4.5z"/>
        <line x1="12" y1="4.5" x2="12" y2="18.5"/>
      </svg>
    ),
  },
  {
    id: 'profil',
    label: 'Konto',
    icon: () => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
      </svg>
    ),
  },
]

export default function TabBar({ activeTab, onTabChange }) {
  return (
    <nav className="tab-bar" aria-label="Hauptnavigation">
      <div className="tab-bar-inner">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-bar-btn${activeTab === id ? ' tab-bar-btn--active' : ''}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-current={activeTab === id ? 'page' : undefined}
            type="button"
          >
            <Icon />
            <span className="tab-bar-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
