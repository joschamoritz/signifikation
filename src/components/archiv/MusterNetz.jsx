import { useMemo, useState } from 'react'
import { computeNetzLayout } from '../../../server/archive/netzLayout.js'

/**
 * Musternetz (Variante B): Stichwort im Zentrum, Partnerwörter in Sektoren nach
 * grammatischer Beziehung, Knotengröße nach logDice, sekundäre Kollokatoren als
 * graue Satelliten. Das reine Layout (Koordinaten) kommt aus dem gemeinsamen
 * server/archive/netzLayout.js – dieselbe Geometrie speist die SSR-Seite, damit
 * App und /wort/:slug nie auseinanderdriften.
 *
 * @param {string} lemma
 * @param {Array}  patterns  fetchSyntagmaticPatterns()-Einträge (mit relation, logDice, …)
 * @param {Array}  netz      fetchSecondaryCollocates()-Einträge ({ base, collocates })
 * @param {number} maxNodes  wie viele Partnerwörter maximal (mobil weniger)
 */
export default function MusterNetz({ lemma, patterns = [], netz = [], maxNodes = 6 }) {
  const [active, setActive] = useState(null)

  const layout = useMemo(
    () => computeNetzLayout({ patterns, netz, maxNodes }),
    [patterns, netz, maxNodes],
  )

  const { W, H, cx, cy, nodes, edges, sectors } = layout

  return (
    <div className="mn-net">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Musternetz für ${lemma}`} className="mn-net-svg">
        <title>{`Musternetz für ${lemma}`}</title>
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
          <circle key={n.id} cx={n.x} cy={n.y} r={n.r} className="mn-node-sec">
            <title>{`${n.label} (Wortnetz von ${n.base})`}</title>
          </circle>
        ))}
        {/* Zentrum */}
        <circle cx={cx} cy={cy} r={18} className="mn-center" />
        <text x={cx} y={cy + 4} textAnchor="middle" className="mn-center-label">{lemma}</text>
      </svg>
      <p className="mn-caption" aria-live="polite">
        {active ? (
          <>
            <strong>{active.kollokator}</strong> · {active.muster} · logDice {active.logDice.toFixed(2)} · {active.frequency.toLocaleString('de-DE')} Belege
          </>
        ) : (
          'Tippe einen Knoten für die Kennzahlen. Größe = Stärke (logDice), graue Punkte = Wortnetz.'
        )}
      </p>
    </div>
  )
}

