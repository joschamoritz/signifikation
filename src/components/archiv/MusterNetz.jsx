import { useMemo, useRef, useState } from 'react'
import { computeNetzLayout } from '../../../server/archive/netzLayout.js'

const MIN_SCALE = 1
const MAX_SCALE = 3
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/**
 * Musternetz (Variante B): Stichwort im Zentrum, Partnerwörter in Sektoren nach
 * grammatischer Beziehung, Knotengröße nach logDice, sekundäre Kollokatoren als
 * graue Satelliten. Das reine Layout (Koordinaten) kommt aus dem gemeinsamen
 * server/archive/netzLayout.js – dieselbe Geometrie speist die SSR-Seite, damit
 * App und /wort/:slug nie auseinanderdriften.
 *
 * Zoom/Pan (nur App, nicht SSR): Wheel/Pinch/Buttons skalieren eine innere <g>
 * um einen Fokuspunkt (Cursor bzw. Pinch-Mittelpunkt). Weil Text und graue
 * Zweitknoten Teil derselben <g> sind, werden sie beim Reinzoomen automatisch
 * größer; die Labels der grauen Zweitknoten sind bei scale=1 unsichtbar
 * (Rauschen) und blenden sich erst ab einer Zoomstufe ein.
 *
 * @param {string} lemma
 * @param {Array}  patterns  fetchSyntagmaticPatterns()-Einträge (mit relation, logDice, …)
 * @param {Array}  netz      fetchSecondaryCollocates()-Einträge ({ base, collocates })
 * @param {number} maxNodes  wie viele Partnerwörter maximal (mobil weniger)
 */
export default function MusterNetz({ lemma, patterns = [], netz = [], maxNodes = 6 }) {
  const [active, setActive] = useState(null)
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  const svgRef = useRef(null)
  const pointersRef = useRef(new Map()) // pointerId → {x,y} (Client-Koordinaten)
  const pinchRef = useRef(null)         // { dist, scale } beim Start einer Pinch-Geste
  const panRef = useRef(null)           // { x, y, tx, ty } beim Start eines Ein-Finger-Drags

  const layout = useMemo(
    () => computeNetzLayout({ patterns, netz, maxNodes }),
    [patterns, netz, maxNodes],
  )

  const { W, H, cx, cy, nodes, edges, sectors } = layout
  // Zentrum als Pille, deren Breite zum Stichwort passt (lange Wörter passen
  // nicht in einen festen Kreis). Grobe Schätzung aus der Zeichenzahl.
  const centerW = Math.max(46, lemma.length * 7.6 + 24)

  // Graue Zweitlabels: unsichtbar bei scale=1, voll sichtbar ab ~scale 2.3.
  const secLabelOpacity = clamp((scale - 1.15) / 1.15, 0, 1)

  /** Client-Koordinaten (Pointer/Maus) → Koordinaten im festen viewBox-Raster. */
  function toViewBox(clientX, clientY) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    }
  }

  /** Zoomt so, dass der viewBox-Punkt unter (clientX, clientY) fix bleibt. */
  function zoomAt(clientX, clientY, nextScaleRaw) {
    if (!svgRef.current) return
    const nextScale = clamp(nextScaleRaw, MIN_SCALE, MAX_SCALE)
    const vb = toViewBox(clientX, clientY)
    const layoutX = (vb.x - tx) / scale
    const layoutY = (vb.y - ty) / scale
    let nextTx = vb.x - nextScale * layoutX
    let nextTy = vb.y - nextScale * layoutY
    nextTx = clamp(nextTx, W * (1 - nextScale), 0)
    nextTy = clamp(nextTy, H * (1 - nextScale), 0)
    setScale(nextScale)
    setTx(nextTx)
    setTy(nextTy)
  }

  function resetZoom() {
    setScale(1)
    setTx(0)
    setTy(0)
  }

  function zoomButton(factor) {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, scale * factor)
  }

  function onWheel(e) {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    zoomAt(e.clientX, e.clientY, scale * factor)
  }

  // setPointerCapture kann bei synthetischen/ungültigen Pointern werfen –
  // die Geste selbst (Pinch-/Pan-Tracking) soll davon unabhängig funktionieren.
  function tryCapture(pointerId) {
    try { svgRef.current?.setPointerCapture(pointerId) } catch { /* ignorierbar */ }
  }

  function onPointerDown(e) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointersRef.current.size === 2) {
      e.preventDefault()
      const [p1, p2] = [...pointersRef.current.values()]
      pinchRef.current = { dist: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale }
      panRef.current = null
      tryCapture(e.pointerId)
    } else if (pointersRef.current.size === 1 && scale > 1) {
      panRef.current = { x: e.clientX, y: e.clientY, tx, ty }
      tryCapture(e.pointerId)
    }
  }

  function onPointerMove(e) {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2 && pinchRef.current) {
      e.preventDefault()
      const [p1, p2] = [...pointersRef.current.values()]
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      const ratio = dist / (pinchRef.current.dist || 1)
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      zoomAt(mid.x, mid.y, pinchRef.current.scale * ratio)
    } else if (pointersRef.current.size === 1 && panRef.current) {
      e.preventDefault()
      const rect = svgRef.current.getBoundingClientRect()
      const dvx = ((e.clientX - panRef.current.x) / rect.width) * W
      const dvy = ((e.clientY - panRef.current.y) / rect.height) * H
      setTx(clamp(panRef.current.tx + dvx, W * (1 - scale), 0))
      setTy(clamp(panRef.current.ty + dvy, H * (1 - scale), 0))
    }
  }

  function onPointerUp(e) {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
    if (pointersRef.current.size === 1 && scale > 1) {
      const [p] = [...pointersRef.current.values()]
      panRef.current = { x: p.x, y: p.y, tx, ty }
    } else {
      panRef.current = null
    }
  }

  return (
    <div className="mn-net">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Musternetz für ${lemma}`}
        className="mn-net-svg"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <title>{`Musternetz für ${lemma}`}</title>
        <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
          {/* Kanten */}
          {edges.map((e, i) => (
            <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              className={e.gray ? 'mn-edge mn-edge--gray' : 'mn-edge'}
              strokeWidth={e.w} opacity={e.opacity} />
          ))}
          {/* Sektor-Labels */}
          {sectors.map((s, i) => (
            <text key={i} x={s.x} y={s.y} className="mn-sector" textAnchor={s.anchor}>
              {s.label}
            </text>
          ))}
          {/* Knoten */}
          {nodes.map((n) => n.kind === 'primary' ? (
            <g key={n.id} className="mn-node-g" onClick={() => setActive(n.p)} tabIndex={0}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(n.p) } }}>
              <circle cx={n.x} cy={n.y} r={n.r}
                className={`mn-node${active && active.kollokator === n.p.kollokator ? ' mn-node--active' : ''}`} />
              <text x={n.lx} y={n.ly} textAnchor={n.anchor} className="mn-node-label">{n.p.kollokator}</text>
            </g>
          ) : (
            <g key={n.id} className="mn-node-sec-g">
              <circle cx={n.x} cy={n.y} r={n.r} className="mn-node-sec">
                <title>{`${n.label} (Wortnetz von ${n.base})`}</title>
              </circle>
              <text x={n.x} y={n.y - n.r - 3} textAnchor="middle" className="mn-node-sec-label"
                style={{ opacity: secLabelOpacity }}>
                {n.label}
              </text>
            </g>
          ))}
          {/* Zentrum (Pille passt sich der Wortlänge an) */}
          <rect x={cx - centerW / 2} y={cy - 14} width={centerW} height={28} rx={14} className="mn-center" />
          <text x={cx} y={cy + 4.5} textAnchor="middle" className="mn-center-label">{lemma}</text>
        </g>
      </svg>

      <div className="mn-net-controls" role="group" aria-label="Musternetz zoomen">
        <button type="button" className="mn-zoom-btn" onClick={() => zoomButton(1 / 1.3)}
          disabled={scale <= MIN_SCALE} aria-label="Musternetz verkleinern">−</button>
        <button type="button" className="mn-zoom-btn" onClick={() => zoomButton(1.3)}
          disabled={scale >= MAX_SCALE} aria-label="Musternetz vergrößern">+</button>
        {scale !== 1 ? (
          <button type="button" className="mn-zoom-btn mn-zoom-reset" onClick={resetZoom}
            aria-label="Zoom zurücksetzen">⟲</button>
        ) : null}
      </div>

      <p className="mn-caption" aria-live="polite">
        {active ? (
          <>
            <strong>{active.kollokator}</strong> · {active.muster} · logDice {active.logDice.toFixed(2)} · {active.frequency.toLocaleString('de-DE')} Belege
          </>
        ) : (
          'Tippe einen Knoten für die Kennzahlen. Größe = Stärke (logDice), graue Punkte = Wortnetz. Zum Vergrößern scrollen, pinchen oder die Buttons nutzen.'
        )}
      </p>
    </div>
  )
}
