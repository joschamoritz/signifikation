import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// Vertikales Buchstaben-Register (Daumen-Index wie im Adressbuch), nur mobil.
// „Verdichtet": zeigt nur vorhandene Buchstaben und dünnt bei Platzmangel auf
// eine repräsentative Auswahl aus – dazwischen ein · als Sammelpunkt, der beim
// Ziehen/Tippen trotzdem zum nächstliegenden Buchstaben springt.

const SLOT_PX = 30      // Höhe, die eine Marke im Register „beansprucht"
const MIN_ROWS = 6      // darunter lohnt kein Ausdünnen
const PAD_TOP = 8       // Abstand der angesprungenen Gruppe zum Scroller-Rand

/** Baut aus allen vorhandenen Buchstaben die (ggf. verdichtete) Register-Liste.
 *  Jedes Item trägt sein Ziel (`target`) – auch die ·-Punkte sind ansteuerbar. */
export function buildRail(letters, maxRows) {
  if (letters.length <= maxRows) {
    return letters.map((l) => ({ kind: 'letter', label: l, target: l }))
  }
  const items = []
  for (let i = 0; i < maxRows; i++) {
    const idx = Math.round((i * (letters.length - 1)) / (maxRows - 1))
    const letter = letters[idx]
    if (items.length && items[items.length - 1].target === letter) continue
    // Rhythmus A · E · K …: Ränder immer als Buchstabe, dazwischen abwechselnd.
    const isLetter = i === 0 || i === maxRows - 1 || i % 2 === 0
    items.push({ kind: isLetter ? 'letter' : 'dot', label: letter, target: letter })
  }
  return items
}

export default function ArchivLetterRail({ letters, scrollerRef, groupEls }) {
  const navRef = useRef(null)
  const innerRef = useRef(null)
  const [maxRows, setMaxRows] = useState(20)
  const [active, setActive] = useState(letters[0] || null)
  const [dragLetter, setDragLetter] = useState(null) // ≠ null ⇒ Overlay-Blase sichtbar

  // Verfügbare Höhe messen → wie viele Marken passen (Ausdünn-Schwelle).
  useLayoutEffect(() => {
    const el = navRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const h = el.clientHeight
      if (h > 0) setMaxRows(Math.max(MIN_ROWS, Math.floor(h / SLOT_PX)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const items = useMemo(() => buildRail(letters, maxRows), [letters, maxRows])

  // Aktiven Buchstaben mitführen: oberste sichtbare Gruppe (Top-30%-Zone).
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || typeof IntersectionObserver === 'undefined') return
    const visible = new Set()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const l = e.target.dataset.letter
          if (e.isIntersecting) visible.add(l)
          else visible.delete(l)
        }
        for (const l of letters) {
          if (visible.has(l)) { setActive(l); break }
        }
      },
      { root: scroller, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    )
    for (const l of letters) {
      const el = groupEls.current.get(l)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [letters, scrollerRef, groupEls])

  function scrollToLetter(letter) {
    const el = groupEls.current.get(letter)
    const scroller = scrollerRef.current
    if (!el || !scroller) return
    const delta = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollTo({ top: scroller.scrollTop + delta - PAD_TOP, behavior: 'auto' })
  }

  // Finger-/Zeigerposition → nächstliegendes Item (Layout-unabhängig gemessen).
  function targetFromY(clientY) {
    const kids = innerRef.current?.children
    if (!kids || !kids.length) return null
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < kids.length; i++) {
      const r = kids[i].getBoundingClientRect()
      if (clientY >= r.top && clientY <= r.bottom) return items[i]?.target ?? null
      const c = (r.top + r.bottom) / 2
      const d = Math.abs(clientY - c)
      if (d < bestDist) { bestDist = d; best = i }
    }
    return items[best]?.target ?? null
  }

  function handlePointer(clientY) {
    const target = targetFromY(clientY)
    if (target == null) return
    setDragLetter(target)
    setActive(target)
    scrollToLetter(target)
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    try { navRef.current?.setPointerCapture?.(e.pointerId) } catch { /* synthetische Events / alte Browser */ }
    handlePointer(e.clientY)
  }
  const onPointerMove = (e) => {
    if (dragLetter == null) return
    handlePointer(e.clientY)
  }
  const endDrag = (e) => {
    try { navRef.current?.releasePointerCapture?.(e.pointerId) } catch { /* s. o. */ }
    setDragLetter(null)
  }

  if (letters.length < 2) return null

  return (
    <>
      <nav
        ref={navRef}
        className="av-rail"
        aria-label="Nach Anfangsbuchstabe springen"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div ref={innerRef} className="av-rail-inner">
          {items.map((it, i) => {
            const isActive = it.target === active
            return (
              <button
                key={`${it.target}-${i}`}
                type="button"
                className={`av-rail-item av-rail-item--${it.kind}${isActive ? ' av-rail-item--active' : ''}`}
                aria-label={`Zu Buchstabe ${it.target} springen`}
                aria-current={isActive ? 'true' : undefined}
                tabIndex={-1}
                onClick={() => { setActive(it.target); scrollToLetter(it.target) }}
              >
                {it.kind === 'letter' ? it.label : '·'}
              </button>
            )
          })}
        </div>
      </nav>
      {dragLetter != null && (
        <div className="av-rail-bubble" aria-hidden="true">{dragLetter}</div>
      )}
    </>
  )
}
