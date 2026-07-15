import '../styles/tabbar.css'

// Outline-Icons (WhatsApp-/SF-Symbols-Linienstil) – schlanke, klare Striche.
const TABS = [
  {
    id: 'spielmodi',
    label: 'Spielmodi',
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11.5L12 3l9 8.5"/>
        <path d="M5 9.5V20a.5.5 0 00.5.5H9v-5h6v5h3.5a.5.5 0 00.5-.5V9.5"/>
      </svg>
    ),
  },
  {
    id: 'archiv',
    label: 'Archiv',
    // Lupe – Nachschlagen/Suchen, klar unterscheidbar vom Kurs-Buch.
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.8-3.8" />
      </svg>
    ),
  },
  {
    id: 'kurs',
    label: 'Kurs',
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 4.5C10 3 6 3 3.5 4v14C6 17 10 17 12 18.5c2-1.5 6-1.5 8.5 0V4C18 3 14 3 12 4.5z"/>
        <line x1="12" y1="4.5" x2="12" y2="18.5"/>
      </svg>
    ),
  },
  {
    id: 'klassenraum',
    label: 'Klassenraum',
    teacherOnly: true,
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M3 8h18" />
        <path d="M8 18v2" />
        <path d="M16 18v2" />
      </svg>
    ),
  },
  {
    id: 'profil',
    label: 'Konto',
    icon: () => (
      <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
      </svg>
    ),
  },
]

export default function TabBar({ activeTab, onTabChange, showClassroomTab = false }) {
  const visibleTabs = TABS.filter((t) => !t.teacherOnly || showClassroomTab)
  const activeIndex = visibleTabs.findIndex((t) => t.id === activeTab)
  return (
    <nav className="tab-bar" aria-label="Hauptnavigation">
      <div className="tab-bar-inner" style={{ '--tab-count': visibleTabs.length }}>
        {/* Gleitende Glas-Kapsel hinter dem aktiven Tab (iOS-26-Stil, rein dekorativ) */}
        <span
          className="tab-bar-indicator"
          aria-hidden="true"
          style={{ '--active-index': activeIndex < 0 ? 0 : activeIndex, opacity: activeIndex < 0 ? 0 : undefined }}
        />
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-bar-btn${activeTab === id ? ' tab-bar-btn--active' : ''}`}
            onClick={() => onTabChange(id)}
            aria-label={label}
            aria-current={activeTab === id ? 'page' : undefined}
            type="button"
          >
            <span className="tab-bar-icon-wrap">
              <Icon />
            </span>
            <span className="tab-bar-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  )
}
