import { useState, memo } from 'react'
import { API } from '../config'
import BelegeSatz from './BelegeSatz'

const KORPUS_COLOR = {
  dta: '#9b1c1c', dtae: '#b45309', dtak: '#c2410c',
  kern: '#1d4ed8', ddr: '#0891b2', bundestag: '#4f46e5',
  reichstag: '#a21caf', politische_reden: '#d97706',
}
function korpusCol(k) { return KORPUS_COLOR[k] || '#78716c' }

const ZrBubbleChart = memo(function ZrBubbleChart({ paare, perioden, placements, lemma }) {
  const [hovered,      setHovered]      = useState(null)
  const [belegeCache,  setBelegeCache]  = useState({})
  const [belegeLoading,setBelegeLoading]= useState(false)

  // Alle anzuzeigenden Perioden (Fallback: nur Spielpaare)
  const allPerioden = perioden?.length ? perioden : paare
  const paareMap    = new Map(paare.map(p => [p.jahrzehnt, p]))

  const W = 520, H = 200
  const PAD = { top: 40, right: 24, bottom: 30, left: 36 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top  - PAD.bottom

  const allYears  = allPerioden.map(p => Number(p.jahrzehnt))
  const allScores = allPerioden.map(p => p.score || 8)
  const minY = Math.min(...allYears), maxY = Math.max(...allYears)
  const minS = 0,                     maxS = Math.max(...allScores) * 1.18

  const cx  = y => PAD.left + ((y - minY) / (maxY - minY || 1)) * innerW
  const cy  = s => PAD.top  + innerH - ((s - minS) / (maxS - minS || 1)) * innerH
  const crB = s => Math.max(4, 4 + Math.round((s / (maxS / 1.18)) * 7))  // Hintergrundblase
  const crG = s => Math.max(7, 7 + Math.round((s / (maxS / 1.18)) * 9))  // Spielblase

  async function fetchBeleg(paar) {
    const key = `${paar.jahrzehnt}_${paar.kollokat}`
    if (belegeCache[key] !== undefined) return
    setBelegeLoading(true)
    try {
      const y = parseInt(paar.jahrzehnt)
      const resolvedCorpus = paar.korpus || (y <= 1900 ? 'dta' : y <= 1990 ? 'kern' : null)
      const params = new URLSearchParams({
        collocate: paar.kollokat, lemma, rel: '',
        ...(resolvedCorpus && { corpus: resolvedCorpus }),
        ...(paar.jahrzehnt  && { year:   paar.jahrzehnt  }),
      })
      const r = await fetch(`${API}/belege?${params}`)
      const d = await r.json()
      setBelegeCache(prev => ({ ...prev, [key]: Array.isArray(d) ? d : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [key]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  function handleEnter(paar) {
    setHovered(paar)
    fetchBeleg(paar)
  }

  const hovKey   = hovered ? `${hovered.jahrzehnt}_${hovered.kollokat}` : null
  const hovBeleg = hovKey ? belegeCache[hovKey] : undefined

  const bgPerioden = allPerioden.filter(p => !paareMap.has(p.jahrzehnt))

  return (
    <div className="zr-bubble-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="zr-bubble-svg" aria-hidden="true" onMouseLeave={() => setHovered(null)}>
        {/* Rasterlinien */}
        {[0.25, 0.5, 0.75, 1].map(f => {
          const gy = PAD.top + innerH * (1 - f)
          return <line key={f} x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy}
                       stroke="#e5e2de" strokeWidth="1" />
        })}
        {/* X-Achse */}
        <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH}
              stroke="#a8a29e" strokeWidth="1.5" />
        {/* Y-Achse Label */}
        <text x={10} y={PAD.top + innerH / 2} textAnchor="middle" fontSize="8" fill="#78716c"
              fontFamily="DM Sans,sans-serif" transform={`rotate(-90,10,${PAD.top + innerH / 2})`}>
          logDice
        </text>

        {/* Hintergrund-Perioden (grau, klein) */}
        {bgPerioden.map(p => {
          const x = cx(Number(p.jahrzehnt)), y = cy(p.score || 8), r = crB(p.score || 8)
          const isHov = hovered?.jahrzehnt === p.jahrzehnt
          return (
            <g key={`bg_${p.jahrzehnt}`} style={{ cursor: 'pointer' }}
               onMouseEnter={() => handleEnter(p)}>
              <circle cx={x} cy={y} r={r + (isHov ? 3 : 0)}
                fill={isHov ? '#a8a29e' : '#d6d3cf'}
                stroke={isHov ? '#78716c' : '#c4bfbc'} strokeWidth="1" />
              <text x={x} y={H - 3} textAnchor="middle" fontSize="7.5" fill="#a8a29e"
                    fontFamily="DM Sans,sans-serif">{p.jahrzehnt}</text>
              {isHov && (
                <text x={x} y={y + 3} textAnchor="middle" fontSize="7.5" fill="#44403c"
                      fontFamily="DM Sans,sans-serif" fontWeight="600">{p.kollokat}</text>
              )}
            </g>
          )
        })}

        {/* Spielpaare (groß, farbig, beschriftet) */}
        {paare.map(p => {
          const correct = placements[p.jahrzehnt] === p.kollokat
          const x = cx(Number(p.jahrzehnt)), y = cy(p.score || 8)
          const r = crG(p.score || 8)
          const col = korpusCol(p.korpus)
          const isHov = hovered?.jahrzehnt === p.jahrzehnt
          return (
            <g key={`gm_${p.jahrzehnt}`} style={{ cursor: 'pointer' }}
               onMouseEnter={() => handleEnter(p)}>
              {isHov && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={col} strokeWidth="1.5" opacity="0.35" />}
              <circle cx={x} cy={y} r={r}
                fill={col + (correct ? 'dd' : '44')}
                stroke={correct ? col : '#dc2626'}
                strokeWidth={isHov ? 2.5 : (correct ? 1.5 : 2)} />
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700"
                    fontFamily="DM Sans,sans-serif">{correct ? '✓' : '✗'}</text>
              <text x={x} y={y - r - 5} textAnchor="middle" fontSize="10" fontWeight="700"
                    fill={correct ? col : '#dc2626'} fontFamily="DM Sans,sans-serif">{p.kollokat}</text>
              <text x={x} y={H - 3} textAnchor="middle" fontSize="8.5" fill={col}
                    fontFamily="DM Sans,sans-serif" fontWeight="600">{p.jahrzehnt}</text>
            </g>
          )
        })}
      </svg>

      <div className="zr-bubble-popover">
        {hovered ? (
          <>
            <div className="zr-bubble-popover-header">
              <strong>{hovered.kollokat}</strong>
              <span className="zr-bubble-popover-meta"> · um {hovered.jahrzehnt}</span>
              {hovered.score != null && (
                <span className="zr-bubble-popover-score"> · logDice {Number(hovered.score).toFixed(1)}</span>
              )}
            </div>
            {belegeLoading && hovBeleg === undefined ? (
              <p className="belege-status">Lade Beleg …</p>
            ) : hovBeleg?.length ? (
              <BelegeSatz tokens={hovBeleg[0].tokens} />
            ) : hovBeleg !== undefined ? (
              <p className="belege-status">Belege konnten nicht geladen werden.</p>
            ) : null}
          </>
        ) : (
          <p className="zr-bubble-popover-hint">Bewege die Maus über eine Blase</p>
        )}
      </div>
    </div>
  )
})

export default ZrBubbleChart
