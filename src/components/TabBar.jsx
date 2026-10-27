import { useEffect, useRef, useState } from 'react'
import { hapticLight, hapticSelection, hapticSelectionStart, hapticSelectionEnd } from '../utils/haptics'
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

// Ab dieser Strecke (px) wird aus einem Tipp ein Ziehen über die Leiste
const DRAG_THRESHOLD = 6

// Linse unter dem Finger (iOS 26/27): Drücken hebt die Glas-Linse an und lässt
// sie über die Leiste hinauswachsen; Ziehen führt sie mit dem Finger, jeder neu
// erreichte Tab tickt haptisch, Loslassen wählt den Tab darunter. Ein einfacher
// Tipp bleibt ein normaler Button-Klick (Tastatur und VoiceOver unverändert);
// erst ab DRAG_THRESHOLD übernimmt die Leiste den Zeiger.
function useLensDrag({ innerRef, count, onSelect }) {
  const drag = useRef(null)
  const [lens, setLens] = useState(null) // { x, index, dragging } | null

  const geometry = (clientX) => {
    const rect = innerRef.current.getBoundingClientRect()
    const slot = rect.width / count
    const x = Math.min(Math.max(clientX - rect.left, slot / 2), rect.width - slot / 2)
    return { x, index: Math.min(count - 1, Math.max(0, Math.floor((clientX - rect.left) / slot))), slot }
  }

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!innerRef.current) return
    const g = geometry(e.clientX)
    drag.current = { id: e.pointerId, startX: e.clientX, index: g.index, active: false }
    // Linse springt auf den berührten Tab und hebt sich an
    setLens({ x: (g.index + 0.5) * g.slot, index: g.index, dragging: false })
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    if (!d.active) {
      if (Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD) return
      d.active = true
      innerRef.current.setPointerCapture?.(e.pointerId)
      hapticSelectionStart()
    }
    const g = geometry(e.clientX)
    setLens({ x: g.x, index: g.index, dragging: true })
    if (g.index !== d.index) {
      d.index = g.index
      hapticSelection()
    }
  }

  const end = (e, commit) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    setLens(null)
    if (!d.active) return // einfacher Tipp: der Button-Klick übernimmt
    hapticSelectionEnd()
    if (commit) onSelect(d.index)
  }

  return {
    lens,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => end(e, true),
      onPointerCancel: (e) => end(e, false),
    },
  }
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

  const innerRef = useRef(null)
  const { lens, handlers } = useLensDrag({
    innerRef,
    count: visibleTabs.length,
    // Beim Ziehen hat jeder Tab schon getickt – kein zusätzlicher Impuls
    onSelect: (index) => onTabChange(visibleTabs[index].id),
  })

  return (
    <nav className={`tab-bar${flat ? ' tab-bar--flat' : ''}${lens ? ' tab-bar--pressed' : ''}`} aria-label="Hauptnavigation">
      <div className="tab-bar-inner" ref={innerRef} style={{ '--tab-count': visibleTabs.length }} {...handlers}>
        {/* Gleitende Glas-Kapsel hinter dem aktiven Tab (iOS-26-Stil, rein dekorativ) */}
        <span
          className={`tab-bar-indicator${lens ? ' tab-bar-indicator--lens' : ''}${lens?.dragging ? ' tab-bar-indicator--dragging' : ''}`}
          aria-hidden="true"
          style={{
            '--active-index': activeIndex < 0 ? 0 : activeIndex,
            ...(lens ? { '--lens-x': `${lens.x}px` } : {}),
            opacity: activeIndex < 0 && !lens ? 0 : undefined,
            animationName: morphTick === 0 || lens ? 'none' : (morphTick % 2 ? 'tabMorphA' : 'tabMorphB'),
          }}
        />
        {visibleTabs.map(({ id, label, icon: Icon }, index) => (
          <button
            key={id}
            // Beim Ziehen wandert die Hervorhebung mit der Linse; aria-current
            // bleibt beim tatsächlich aktiven Tab, bis losgelassen wird.
            className={`tab-bar-btn${(lens?.dragging ? lens.index === index : activeTab === id) ? ' tab-bar-btn--active' : ''}${lens?.index === index ? ' tab-bar-btn--lensed' : ''}`}
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
