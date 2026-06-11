import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, useCallback } from 'react'
import './Sheet.css'

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.disabled
  )
}

let _portalContainer = null
function getPortalContainer() {
  if (!_portalContainer || !document.body.contains(_portalContainer)) {
    _portalContainer = document.getElementById('sheet-portal')
    if (!_portalContainer) {
      _portalContainer = document.createElement('div')
      _portalContainer.setAttribute('id', 'sheet-portal')
      document.body.appendChild(_portalContainer)
    }
  }
  return _portalContainer
}

function setBodyInert(exclude) {
  Array.from(document.body.children).forEach((child) => {
    if (child !== exclude) {
      child.setAttribute('inert', '')
    }
  })
}

function removeBodyInert() {
  Array.from(document.body.children).forEach((child) => {
    child.removeAttribute('inert')
  })
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SheetHeader() {
  return <div className="sheet-grip" aria-hidden="true" />
}

function SheetBody({ children }) {
  return <div className="sheet-body">{children}</div>
}

function SheetFooter({ children }) {
  return <div className="sheet-footer">{children}</div>
}

// ─── Main Sheet ───────────────────────────────────────────────────────────────

function Sheet({
  open,
  onClose,
  variant = 'bottom',
  dismissible = true,
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}) {
  const [mounted, setMounted] = useState(false)
  const [dataState, setDataState] = useState('closed')
  const panelRef = useRef(null)
  const previousFocusRef = useRef(null)
  const portalContainer = useRef(getPortalContainer())

  // Spiegel des mounted-State als Ref. Vermeidet, dass dieser Effect bei
  // jedem mounted-Wechsel neu läuft (mounted ist hier nur Konsument, nicht
  // Trigger). Sync per setter unten + cleanup in transitionend-Effect.
  const mountedRef = useRef(false)

  // Touch tracking
  const touchStartY = useRef(null)

  // ── Mount / open logic ────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      setMounted(true)
      mountedRef.current = true
      // data-state="open" must be set after paint so CSS transition fires
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDataState('open')
        })
      })
      setBodyInert(portalContainer.current)
    } else {
      if (mountedRef.current) {
        setDataState('closing')
        // transitionend listener handles unmount + cleanup
      }
    }
  }, [open])

  // ── transitionend → unmount ────────────────────────────────────────────────
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    function handleTransitionEnd(e) {
      const relevantProp = variant === 'center' ? 'opacity' : 'transform'
      if (e.propertyName !== relevantProp) return
      if (dataState === 'closing') {
        setMounted(false)
        mountedRef.current = false
        setDataState('closed')
        removeBodyInert()
        onClose()
        if (
          previousFocusRef.current &&
          typeof previousFocusRef.current.focus === 'function'
        ) {
          previousFocusRef.current.focus()
        }
      }
    }

    panel.addEventListener('transitionend', handleTransitionEnd)
    return () => panel.removeEventListener('transitionend', handleTransitionEnd)
  }, [dataState, variant, onClose])

  // ── Focus trap ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (dataState !== 'open') return
    const panel = panelRef.current
    if (!panel) return

    const focusable = getFocusable(panel)
    if (focusable.length > 0) focusable[0].focus()

    function handleKeyDown(e) {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault()
        setDataState('closing')
        return
      }
      if (e.key !== 'Tab') return
      const els = getFocusable(panel)
      if (els.length === 0) { e.preventDefault(); return }
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [dataState, dismissible])

  // ── Touch handlers ────────────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (touchStartY.current === null) return
    const delta = e.touches[0].clientY - touchStartY.current
    if (delta > 0 && panelRef.current) {
      panelRef.current.style.transform = `translateY(${delta}px)`
    }
  }, [])

  const handleTouchEnd = useCallback(
    (e) => {
      if (touchStartY.current === null) return
      const delta = e.changedTouches[0].clientY - touchStartY.current
      touchStartY.current = null
      if (panelRef.current) {
        panelRef.current.style.transform = ''
      }
      if (delta > 80 && dismissible) {
        setDataState('closing')
      }
    },
    [dismissible]
  )

  // ── Backdrop click ─────────────────────────────────────────────────────────
  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget && dismissible) {
        setDataState('closing')
      }
    },
    [dismissible]
  )

  if (!mounted) return null

  // KEIN aria-hidden auf dem Backdrop: es umschliesst das Panel mit
  // role="dialog" — aria-hidden auf dem Vorfahren versteckt den kompletten
  // Dialog vor Screenreadern (Backdrop-Klick-Schliessen laeuft ohnehin ueber
  // e.target === e.currentTarget, dafuer braucht es kein aria-hidden).
  const panel = (
    <div
      className="sheet-backdrop"
      data-state={dataState}
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="sheet-panel"
        data-state={dataState}
        data-variant={variant}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        onTouchStart={variant === 'bottom' && dismissible ? handleTouchStart : undefined}
        onTouchMove={variant === 'bottom' && dismissible ? handleTouchMove : undefined}
        onTouchEnd={variant === 'bottom' && dismissible ? handleTouchEnd : undefined}
      >
        {children}
      </div>
    </div>
  )

  return createPortal(panel, portalContainer.current)
}

Sheet.Header = SheetHeader
Sheet.Body = SheetBody
Sheet.Footer = SheetFooter

export default Sheet
