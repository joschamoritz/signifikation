import { useState, useRef } from 'react'
import { getMedal } from '../utils/gameLogic'

function formatPeriod(label) {
  return `${label}–${Number(label) + 49}`
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

  // For HTML5 DnD — track which chip is being dragged
  const draggingRef = useRef(null)

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

  // ── HTML5 Drag & Drop (desktop) ───────────────────────────────
  function handleDragStart(e, chip) {
    draggingRef.current = chip
    e.dataTransfer.setData('text/plain', chip)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    draggingRef.current = null
  }

  function handleZoneDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleZoneDrop(e, jahrzehnt) {
    e.preventDefault()
    const chip = e.dataTransfer.getData('text/plain') || draggingRef.current
    if (chip) placeChip(chip, jahrzehnt)
    draggingRef.current = null
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
              draggable
              onDragStart={e => handleDragStart(e, chip)}
              onDragEnd={handleDragEnd}
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

          return (
            <div
              key={p.jahrzehnt}
              className={[
                'zr-zone',
                placed    ? 'zr-zone--filled' : '',
                selected && !revealed ? 'zr-zone--droppable' : '',
                isRight   ? 'zr-zone--right'  : '',
                isWrong   ? 'zr-zone--wrong'   : '',
                isMissed  ? 'zr-zone--missed'  : '',
              ].filter(Boolean).join(' ')}
              onDragOver={handleZoneDragOver}
              onDrop={e => handleZoneDrop(e, p.jahrzehnt)}
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
                    draggable={!revealed}
                    onDragStart={revealed ? undefined : e => handleDragStart(e, placed)}
                    onDragEnd={handleDragEnd}
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
          <p className="zr-results-info">
            Daten aus dem Deutschen Textarchiv (ca. 1460–1900)
          </p>
          <button className="btn-primary btn-full" onClick={onBack}>
            Zur Startseite
          </button>
        </div>
      )}
    </div>
  )
}
