import { useState, useRef } from 'react'
import { getMedal } from '../utils/gameLogic'
import { API_BASE } from '../config'

// ── Bubble-Chart für die Ergebnisseite ──────────────────────
const KORPUS_COLOR = {
  dta: '#9b1c1c', dtae: '#b45309', dtak: '#c2410c',
  kern: '#1d4ed8', ddr: '#0891b2', bundestag: '#4f46e5',
  reichstag: '#a21caf', politische_reden: '#d97706',
}
function korpusCol(k) { return KORPUS_COLOR[k] || '#78716c' }

function ZrBubbleChart({ paare, perioden, placements, lemma }) {
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
      const r = await fetch(`${API_BASE}/api/belege?${params}`)
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
    <div className="zr-bubble-wrap" onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="zr-bubble-svg">
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
              {/* Jahreszahl unter Achse */}
              <text x={x} y={H - 3} textAnchor="middle" fontSize="7.5" fill="#a8a29e"
                    fontFamily="DM Sans,sans-serif">{p.jahrzehnt}</text>
              {/* Hover-Label in der Blase */}
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
              {/* Glow-Ring beim Hover */}
              {isHov && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={col} strokeWidth="1.5" opacity="0.35" />}
              <circle cx={x} cy={y} r={r}
                fill={col + (correct ? 'dd' : '44')}
                stroke={correct ? col : '#dc2626'}
                strokeWidth={isHov ? 2.5 : (correct ? 1.5 : 2)} />
              {/* ✓ / ✗ */}
              <text x={x} y={y + 3.5} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="700"
                    fontFamily="DM Sans,sans-serif">{correct ? '✓' : '✗'}</text>
              {/* Wort-Label über der Blase */}
              <text x={x} y={y - r - 5} textAnchor="middle" fontSize="10" fontWeight="700"
                    fill={correct ? col : '#dc2626'} fontFamily="DM Sans,sans-serif">{p.kollokat}</text>
              {/* Jahreszahl unter Achse (farbig) */}
              <text x={x} y={H - 3} textAnchor="middle" fontSize="8.5" fill={col}
                    fontFamily="DM Sans,sans-serif" fontWeight="600">{p.jahrzehnt}</text>
            </g>
          )
        })}
      </svg>

      {/* Hover-Popover unterhalb des Charts */}
      {hovered && (
        <div className="zr-bubble-popover">
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
            <p className="belege-status">Keine Belege gefunden.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function BelegeSatz({ tokens }) {
  return (
    <p className="beleg-satz">
      {tokens.map((t, i) => (
        <span key={i}>
          {t.hl ? <strong>{t.w}</strong> : t.w}
          {t.ws && i < tokens.length - 1 ? ' ' : ''}
        </span>
      ))}
    </p>
  )
}

function formatPeriod(label) {
  return `um ${label}`
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Zeitreise({ data, onBack, onFinish }) {
  // data: { lemma, paare: [{jahrzehnt, kollokat}] } — paare sorted chronologically
  const paare = data.paare

  // Shuffled chips (collocates) – only computed once
  const [chips] = useState(() => shuffle(paare.map(p => p.kollokat)))

  // placements: { [jahrzehnt]: kollokat }
  const [placements, setPlacements] = useState({})
  const [selected, setSelected]     = useState(null)  // currently selected chip
  const [revealed, setRevealed]     = useState(false)
  const [score, setScore]           = useState(null)

  // Belege
  const [openBeleg,     setOpenBeleg]     = useState(null)
  const [belegeCache,   setBelegeCache]   = useState({})
  const [belegeLoading, setBelegeLoading] = useState(false)

  async function loadZrBelege(paar) {
    const { kollokat, jahrzehnt, korpus } = paar
    if (openBeleg === kollokat) { setOpenBeleg(null); return }
    if (belegeCache[kollokat] !== undefined) { setOpenBeleg(kollokat); return }
    setOpenBeleg(kollokat)
    setBelegeLoading(true)
    try {
      // Korpus ableiten falls in alten Daten nicht gespeichert
      const y = parseInt(jahrzehnt)
      const resolvedCorpus = korpus || (y <= 1900 ? 'dta' : y <= 1990 ? 'kern' : null)
      const params = new URLSearchParams({
        collocate: kollokat,
        lemma: data.lemma,
        rel: '',
        ...(resolvedCorpus && { corpus: resolvedCorpus }),
        ...(jahrzehnt      && { year:   jahrzehnt }),
      })
      const r = await fetch(`${API_BASE}/api/belege?${params}`)
      const d = await r.json()
      setBelegeCache(prev => ({ ...prev, [kollokat]: Array.isArray(d) ? d : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [kollokat]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  // Pointer-drag state (works on touch + mouse)
  const pointerDragRef = useRef(null)

  // ── Derived state ────────────────────────────────────────────
  const placedSet  = new Set(Object.values(placements))
  const freeChips  = chips.filter(c => !placedSet.has(c))
  const allPlaced  = paare.every(p => placements[p.jahrzehnt])

  // ── Core operation ───────────────────────────────────────────
  function placeChip(chip, jahrzehnt) {
    if (revealed) return
    setPlacements(prev => {
      const next = { ...prev }
      // Remove chip from any zone it currently occupies
      for (const [z, c] of Object.entries(next)) {
        if (c === chip) { delete next[z]; break }
      }
      // Displace any existing chip in the target zone (it goes back to pool)
      // (simply overwrite — displaced chip is removed from placements → pool)
      next[jahrzehnt] = chip
      return next
    })
    setSelected(null)
  }

  function pickUpFromZone(jahrzehnt) {
    if (revealed) return
    const chip = placements[jahrzehnt]
    if (!chip) return
    setPlacements(prev => {
      const next = { ...prev }
      delete next[jahrzehnt]
      return next
    })
    setSelected(chip)
  }

  // ── Tap / click handlers ──────────────────────────────────────
  function handlePoolChipClick(chip) {
    if (revealed) return
    setSelected(prev => prev === chip ? null : chip)
  }

  function handleZoneClick(jahrzehnt) {
    if (revealed) return
    if (selected) {
      placeChip(selected, jahrzehnt)
    } else if (placements[jahrzehnt]) {
      pickUpFromZone(jahrzehnt)
    }
  }

  function handlePlacedChipClick(e, jahrzehnt) {
    e.stopPropagation()
    if (revealed) return
    pickUpFromZone(jahrzehnt)
  }

  // ── Pointer Drag (touch + mouse) ─────────────────────────────
  function onChipPointerDown(e, chip) {
    if (revealed) return
    // Only left-button for mouse; all pointers for touch/pen
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const ghost = document.createElement('div')
    ghost.className = 'zr-chip zr-chip--ghost'
    ghost.textContent = chip
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
      `width:${rect.width}px;pointer-events:none;z-index:9999;opacity:.88;transform:scale(1.06);`
    document.body.appendChild(ghost)
    pointerDragRef.current = {
      chip, ghost, pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
      moved: false,
    }
  }

  function onChipPointerMove(e) {
    const s = pointerDragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    if (!s.moved && Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > 6) s.moved = true
    if (s.moved) {
      s.ghost.style.left = `${e.clientX - s.offsetX}px`
      s.ghost.style.top  = `${e.clientY - s.offsetY}px`
    }
  }

  function onChipPointerUp(e) {
    const s = pointerDragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    s.ghost.remove()
    const moved = s.moved
    pointerDragRef.current = null
    if (!moved) return  // tap → click handler takes over
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const zone = target?.closest('[data-jahrzehnt]')
    if (zone) placeChip(s.chip, zone.dataset.jahrzehnt)
  }

  function onChipPointerCancel(e) {
    const s = pointerDragRef.current
    if (!s || s.pointerId !== e.pointerId) return
    s.ghost.remove()
    pointerDragRef.current = null
  }

  // ── Evaluate ──────────────────────────────────────────────────
  function evaluate() {
    const s = paare.reduce((sum, p) =>
      sum + (placements[p.jahrzehnt] === p.kollokat ? 2 : 0), 0)
    setScore(s)
    setRevealed(true)
    onFinish(s)
  }

  const medal = score !== null ? getMedal(score) : null
  const remaining = paare.length - Object.keys(placements).length

  return (
    <div className="screen zeitreise-screen">
      <button className="back-btn" onClick={onBack}>← Zurück</button>

      {/* Header */}
      <div className="zeitreise-header">
        <span className="zeitreise-badge">Zeitreise</span>
        <h1 className="zeitreise-word">{data.lemma}</h1>
        <p className="zeitreise-desc">
          Ordne jeden Kollokator dem Zeitraum zu, in dem er besonders
          häufig mit <em>{data.lemma}</em> aufgetreten ist.
        </p>
      </div>

      {/* Chip pool */}
      {!revealed && (
        <div className="zr-pool">
          {freeChips.length > 0 ? freeChips.map(chip => (
            <button
              key={chip}
              className={`zr-chip${selected === chip ? ' zr-chip--selected' : ''}`}
              onPointerDown={e => onChipPointerDown(e, chip)}
              onPointerMove={onChipPointerMove}
              onPointerUp={onChipPointerUp}
              onPointerCancel={onChipPointerCancel}
              onClick={() => handlePoolChipClick(chip)}
            >
              {chip}
            </button>
          )) : (
            <p className="zr-pool-done">Alle Wörter zugeordnet</p>
          )}
        </div>
      )}

      {selected && !revealed && (
        <p className="zr-hint">Wähle jetzt einen Zeitraum ↓</p>
      )}

      {/* Zones */}
      <div className="zr-zones">
        {paare.map(p => {
          const placed   = placements[p.jahrzehnt]
          const isRight  = revealed && placed === p.kollokat
          const isWrong  = revealed && placed && placed !== p.kollokat
          const isMissed = revealed && !placed
          const belegOpen = revealed && openBeleg === p.kollokat
          const belegData = belegeCache[p.kollokat]

          return (
            <div key={p.jahrzehnt} className="zr-zone-wrapper">
              <div
                className={[
                  'zr-zone',
                  placed    ? 'zr-zone--filled' : '',
                  selected && !revealed ? 'zr-zone--droppable' : '',
                  isRight   ? 'zr-zone--right'  : '',
                  isWrong   ? 'zr-zone--wrong'   : '',
                  isMissed  ? 'zr-zone--missed'  : '',
                ].filter(Boolean).join(' ')}
                data-jahrzehnt={p.jahrzehnt}
                onClick={() => handleZoneClick(p.jahrzehnt)}
              >
                <span className="zr-zone-period">{formatPeriod(p.jahrzehnt)}</span>

                <div className="zr-zone-slot">
                  {placed ? (
                    <button
                      className={[
                        'zr-chip zr-chip--placed',
                        isRight  ? 'zr-chip--right'  : '',
                        isWrong  ? 'zr-chip--wrong'   : '',
                      ].filter(Boolean).join(' ')}
                      onPointerDown={revealed ? undefined : e => onChipPointerDown(e, placed)}
                      onPointerMove={onChipPointerMove}
                      onPointerUp={onChipPointerUp}
                      onPointerCancel={onChipPointerCancel}
                      onClick={e => handlePlacedChipClick(e, p.jahrzehnt)}
                      disabled={revealed}
                    >
                      {placed}
                      {isRight  && <span className="zr-icon">✓</span>}
                      {isWrong  && <span className="zr-icon">✗</span>}
                    </button>
                  ) : (
                    <span className="zr-zone-empty">
                      {isMissed ? p.kollokat : '—'}
                    </span>
                  )}
                </div>

                {isWrong && (
                  <span className="zr-zone-answer">→ {p.kollokat}</span>
                )}

                {revealed && (
                  <button
                    className="zr-beleg-btn"
                    onClick={e => { e.stopPropagation(); loadZrBelege(p) }}
                  >
                    {belegOpen ? 'Belege ▲' : 'Belege ▼'}
                  </button>
                )}
              </div>

              {belegOpen && (
                <div className="belege-panel">
                  <p className="belege-panel-title">
                    Belege: <em>{data.lemma}</em> + <em>{p.kollokat}</em>
                  </p>
                  {belegeLoading && !belegData ? (
                    <p className="belege-status">Lade Belege …</p>
                  ) : belegData?.length ? (
                    belegData.map((b, bi) => (
                      <div key={bi} className="beleg-item">
                        <BelegeSatz tokens={b.tokens} />
                        <p className="beleg-quelle">{b.quelle}</p>
                      </div>
                    ))
                  ) : (
                    <p className="belege-status">Keine Belege gefunden.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Evaluate button */}
      {!revealed && (
        <button
          className="btn-primary btn-full"
          onClick={evaluate}
          disabled={!allPlaced}
        >
          {allPlaced ? 'Auswerten' : `Noch ${remaining} ${remaining === 1 ? 'Wort' : 'Wörter'} übrig`}
        </button>
      )}

      {/* Results */}
      {revealed && (
        <div className="zr-results">
          <div className="zr-results-score">
            <span className="zr-score-num">{score}</span>
            <span className="zr-score-max">/10 Punkte</span>
          </div>
          <p className="zr-results-medal">{medal?.label}</p>

          {/* Bubble-Chart – SVG, kein externes Package */}
          <ZrBubbleChart paare={paare} perioden={data.perioden} placements={placements} lemma={data.lemma} />

          <p className="zr-results-info">
            Daten aus den DWDS-Korpora
            ({Math.min(...paare.map(p => Number(p.jahrzehnt)))}–{Math.max(...paare.map(p => Number(p.jahrzehnt)))})
          </p>
          <a
            className="dwds-link"
            href={`https://www.dwds.de/wb/${encodeURIComponent(data.lemma)}`}
            target="_blank" rel="noopener noreferrer"
          >Mehr über „{data.lemma}" auf dwds.de ↗</a>
          <button className="btn-primary btn-full" onClick={onBack}>
            Zur Startseite
          </button>
        </div>
      )}
    </div>
  )
}
