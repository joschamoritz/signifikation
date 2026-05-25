import { useEffect, useRef } from 'react'

const DEFAULT_EDGE_WIDTH = 28
const DEFAULT_THRESHOLD = 70
const DEFAULT_MAX_DURATION_MS = 800
const VERTICAL_TOLERANCE_RATIO = 0.7

export function useEdgeSwipeBack(onBack, options = {}) {
  const {
    enabled = true,
    edgeWidth = DEFAULT_EDGE_WIDTH,
    threshold = DEFAULT_THRESHOLD,
    maxDurationMs = DEFAULT_MAX_DURATION_MS,
  } = options

  const onBackRef = useRef(onBack)
  useEffect(() => {
    onBackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    let startX = 0
    let startY = 0
    let startTs = 0
    let tracking = false
    let pointerId = null

    const cancel = () => {
      tracking = false
      pointerId = null
    }

    const handleStart = (e) => {
      if (e.touches && e.touches.length !== 1) {
        cancel()
        return
      }
      const point = e.touches ? e.touches[0] : e
      if (point.clientX > edgeWidth) return
      tracking = true
      startX = point.clientX
      startY = point.clientY
      startTs = e.timeStamp || Date.now()
      pointerId = point.identifier ?? null
    }

    const handleMove = (e) => {
      if (!tracking) return
      const point = e.touches
        ? Array.from(e.touches).find((t) => t.identifier === pointerId) || e.touches[0]
        : e
      if (!point) return
      const dx = point.clientX - startX
      const dy = Math.abs(point.clientY - startY)
      if (dy > Math.abs(dx) * (1 / VERTICAL_TOLERANCE_RATIO)) {
        cancel()
        return
      }
      if (dx < -10) cancel()
    }

    const handleEnd = (e) => {
      if (!tracking) return
      const point = e.changedTouches
        ? Array.from(e.changedTouches).find((t) => t.identifier === pointerId) || e.changedTouches[0]
        : e
      const duration = (e.timeStamp || Date.now()) - startTs
      tracking = false
      pointerId = null
      if (!point) return
      const dx = point.clientX - startX
      const dy = Math.abs(point.clientY - startY)
      if (duration > maxDurationMs) return
      if (dx < threshold) return
      if (dy > Math.abs(dx) * VERTICAL_TOLERANCE_RATIO) return
      try {
        onBackRef.current?.()
      } catch {
        // swallow – Geste darf keine UI sprengen
      }
    }

    const opts = { passive: true }
    document.addEventListener('touchstart', handleStart, opts)
    document.addEventListener('touchmove', handleMove, opts)
    document.addEventListener('touchend', handleEnd, opts)
    document.addEventListener('touchcancel', cancel, opts)

    return () => {
      document.removeEventListener('touchstart', handleStart, opts)
      document.removeEventListener('touchmove', handleMove, opts)
      document.removeEventListener('touchend', handleEnd, opts)
      document.removeEventListener('touchcancel', cancel, opts)
    }
  }, [enabled, edgeWidth, threshold, maxDurationMs])
}
