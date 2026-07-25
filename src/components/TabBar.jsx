import { useEffect, useRef, useState } from 'react'
import { hapticLight } from '../utils/haptics'
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

// Scroll-Edge (iOS 26): solange Inhalt unter der Leiste durchläuft, hebt sie
// sich vom Content ab; am Seitenende – oder wenn die Seite gar nicht scrollt –
// wird sie flach. Ein ResizeObserver auf <body> fängt Tab-Wechsel und
// nachgeladenen Content, ohne dass ein Scroll-Event nötig wäre.
function useScrollEdge() {
  const [flat, setFlat] = useState(true)

  useEffect(() => {
    let frame = 0

    const measure = () => {
      frame = 0
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      setFlat(scrollable <= 8 || window.scrollY >= scrollable - 8)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
    }
  }, [])

  return flat
}

export default function TabBar({ activeTab, onTabChange, showClassroomTab = false }) {
  const visibleTabs = TABS.filter((t) => !t.teacherOnly || showClassroomTab)
  const activeIndex = visibleTabs.findIndex((t) => t.id === activeTab)
  const flat = useScrollEdge()

  // Zähler alterniert die beiden identischen Morph-Keyframes (tabbar.css) –
  // ein Namenswechsel startet die Animation zuverlässig neu, auch wenn der
  // vorherige Wechsel noch läuft. 0 = Erstmount, da soll nichts animieren.
  const prevTab = useRef(activeTab)
  const [morphTick, setMorphTick] = useState(0)
  useEffect(() => {
    if (prevTab.current === activeTab) return
    prevTab.current = activeTab
    setMorphTick((tick) => tick + 1)
  }, [activeTab])

  const handleTabClick = (id) => {
    if (id !== activeTab) hapticLight()
    onTabChange(id)
  }

  return (
    <nav className={`tab-bar${flat ? ' tab-bar--flat' : ''}`} aria-label="Hauptnavigation">
      <div className="tab-bar-inner" style={{ '--tab-count': visibleTabs.length }}>
        {/* Gleitende Glas-Kapsel hinter dem aktiven Tab (iOS-26-Stil, rein dekorativ) */}
        <span
          className="tab-bar-indicator"
          aria-hidden="true"
          style={{
            '--active-index': activeIndex < 0 ? 0 : activeIndex,
            opacity: activeIndex < 0 ? 0 : undefined,
            animationName: morphTick === 0 ? 'none' : (morphTick % 2 ? 'tabMorphA' : 'tabMorphB'),
          }}
        />
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-bar-btn${activeTab === id ? ' tab-bar-btn--active' : ''}`}
            onClick={() => handleTabClick(id)}
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
