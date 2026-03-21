import { useState } from 'react'
import { API_BASE } from '../config'
import { getMedal } from '../utils/gameLogic'
import BelegePanel from './BelegePanel'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function computeScore(zoneA, zoneB, zuordnungMap) {
  return [...zoneA, ...zoneB].filter(w =>
    (zoneA.includes(w) && zuordnungMap[w] === 'A') ||
    (zoneB.includes(w) && zuordnungMap[w] === 'B')
  ).length
}

/** Ergebnisansicht (nach Spielen oder beim Revisit) */
function ResultsView({ data, zoneA, zoneB, onBack }) {
  const zuordnungMap = Object.fromEntries(data.kollokatoren.map(k => [k.wort, k.zuordnung]))
  const score  = computeScore(zoneA, zoneB, zuordnungMap)
  const medal  = getMedal(score)

  const [openBeleg,     setOpenBeleg]     = useState(null)
  const [belegeCache,   setBelegeCache]   = useState({})
  const [belegeLoading, setBelegeLoading] = useState(false)

  async function loadWZBeleg(word) {
    if (openBeleg === word) { setOpenBeleg(null); return }
    if (belegeCache[word] !== undefined) { setOpenBeleg(word); return }
    setOpenBeleg(word)
    setBelegeLoading(true)
    const lemma = zuordnungMap[word] === 'A' ? data.wortA : data.wortB
    try {
      const params = new URLSearchParams({ collocate: word, lemma, rel: '' })
      const r = await fetch(`${API_BASE}/api/belege?${params}`)
      const d = await r.json()
      setBelegeCache(prev => ({ ...prev, [word]: Array.isArray(d) ? d : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [word]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  const activeLemma = openBeleg
    ? (zuordnungMap[openBeleg] === 'A' ? data.wortA : data.wortB)
    : null

  return (
    <div className="screen wz-screen">
      <button className="back-btn" onClick={onBack}>← Zurück</button>
      <header className="wz-header">
        <span className="wz-badge">Wort-Zwilling</span>
        <h1 className="wz-title">{data.wortA} · {data.wortB}</h1>
      </header>

      <div className="wz-result-banner">
        <span className="wz-result-medal">{medal.emoji}</span>
        <div>
          <p className="wz-result-score">{score} / 10 richtig</p>
          <p className="wz-result-label">{medal.label}</p>
        </div>
      </div>

      <div className="wz-zones">
        {[['A', data.wortA, zoneA], ['B', data.wortB, zoneB]].map(([z, label, zone]) => (
          <div key={z} className="wz-zone wz-zone--result">
            <div className="wz-zone-label">{label}</div>
            <div className="wz-zone-chips">
              {zone.map(w => {
                const correct = zuordnungMap[w] === z
                return (
                  <button
                    key={w}
                    className={`wz-chip wz-chip--${correct ? 'correct' : 'wrong'}${openBeleg === w ? ' wz-chip--beleg-active' : ''}`}
                    onClick={() => loadWZBeleg(w)}
                    title="Belege anzeigen"
                    aria-label={`${w} – Belege anzeigen`}
                    aria-pressed={openBeleg === w}
                  >
                    <span>{w}</span>
                    <span className="wz-chip-icon" aria-hidden="true">{correct ? '✓' : '✗'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {openBeleg && (
        <BelegePanel
          lemma={activeLemma}
          collocate={openBeleg}
          data={belegeCache[openBeleg]}
          loading={belegeLoading}
        />
      )}

      <p className="wz-beleg-hint">Tippe auf ein Kollokat, um Belege aus dem DWDS-Korpus zu sehen.</p>

      <button className="btn-primary btn-full" onClick={onBack}>
        Zurück zur Übersicht
      </button>
      <p className="dwds-quelle">Kollokationsdaten: DWDS-Wortprofil, Digitales Wörterbuch der deutschen Sprache (BBAW).</p>
    </div>
  )
}

/** Hauptkomponente */
export default function WortZwilling({ data, onBack, onFinish, savedResult = null }) {
  const words = data.kollokatoren.map(k => k.wort)

  // Einmalig gemischte Reihenfolge für die Anzeige
  const [order] = useState(() => shuffle([...words]))

  // Positionen: jedes Wort → 'bank' | 'A' | 'B'
  const [locations, setLocations] = useState(() => {
    if (savedResult) {
      // Beim Revisit: gespeicherte Zuordnung wiederherstellen
      const map = {}
      for (const w of words) map[w] = 'bank'
      for (const w of (savedResult.zoneA || [])) map[w] = 'A'
      for (const w of (savedResult.zoneB || [])) map[w] = 'B'
      return map
    }
    return Object.fromEntries(words.map(w => [w, 'bank']))
  })

  const [selected, setSelected] = useState(null) // mobiler Click-Flow
  const [dragging, setDragging] = useState(null) // aktuell gezogenes Wort
  const [dragOver, setDragOver] = useState(null) // 'A' | 'B' | 'bank' | null
  const [phase, setPhase]       = useState(savedResult ? 'results' : 'play')

  const bank  = order.filter(w => locations[w] === 'bank')
  const zoneA = order.filter(w => locations[w] === 'A')
  const zoneB = order.filter(w => locations[w] === 'B')

  const canSubmit = zoneA.length === 5 && zoneB.length === 5

  // ── Hilfsfunktionen ──────────────────────────────────────
  function moveTo(word, zone) {
    const target = zone === 'A' ? zoneA : zoneB
    if (locations[word] !== zone && target.length >= 5) return // voll
    setLocations(prev => ({ ...prev, [word]: zone }))
    setSelected(null)
  }

  function moveToBank(word) {
    setLocations(prev => ({ ...prev, [word]: 'bank' }))
    setSelected(null)
  }

  // ── Drag & Drop ──────────────────────────────────────────
  function onDragStart(e, word) {
    setDragging(word)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragEnd() {
    setDragging(null)
    setDragOver(null)
  }

  function onDragOverZone(e, zone) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(zone)
  }

  function onDragOverBank(e) {
    e.preventDefault()
    setDragOver('bank')
  }

  function onDropZone(e, zone) {
    e.preventDefault()
    if (dragging) moveTo(dragging, zone)
    setDragging(null)
    setDragOver(null)
  }

  function onDropBank(e) {
    e.preventDefault()
    if (dragging) moveToBank(dragging)
    setDragging(null)
    setDragOver(null)
  }

  // ── Click-Flow (Mobile) ───────────────────────────────────
  function onChipClick(word) {
    if (selected === word) { setSelected(null); return }
    if (locations[word] !== 'bank') { moveToBank(word); return }
    setSelected(word)
  }

  function onZoneClick(zone) {
    if (!selected) return
    moveTo(selected, zone)
  }

  // ── Auswerten ─────────────────────────────────────────────
  function handleSubmit() {
    if (!canSubmit) return
    const zuordnungMap = Object.fromEntries(data.kollokatoren.map(k => [k.wort, k.zuordnung]))
    const score = computeScore(zoneA, zoneB, zuordnungMap)
    setPhase('results')
    onFinish?.({ score, zoneA, zoneB })
  }

  // ── Ergebnisansicht ───────────────────────────────────────
  if (phase === 'results') {
    return <ResultsView data={data} zoneA={zoneA} zoneB={zoneB} onBack={onBack} />
  }

  // ── Spielansicht ──────────────────────────────────────────
  const remaining = 10 - zoneA.length - zoneB.length

  return (
    <div className="screen wz-screen">
      <button className="back-btn" onClick={onBack}>← Zurück</button>
      <header className="wz-header">
        <span className="wz-badge">Wort-Zwilling</span>
        <h1 className="wz-title">{data.wortA} · {data.wortB}</h1>
      </header>

      <p className="wz-instruction">
        Ordne die Kollokate dem richtigen Wort zu.
      </p>

      {/* Wortbank */}
      <div
        className={`wz-bank${dragOver === 'bank' ? ' wz-bank--over' : ''}`}
        onDragOver={onDragOverBank}
        onDragLeave={() => setDragOver(null)}
        onDrop={onDropBank}
      >
        {bank.length > 0
          ? bank.map(w => (
              <div
                key={w}
                role="button"
                tabIndex={0}
                className={`wz-chip${selected === w ? ' wz-chip--selected' : ''}${dragging === w ? ' wz-chip--dragging' : ''}`}
                draggable
                onDragStart={e => onDragStart(e, w)}
                onDragEnd={onDragEnd}
                onClick={() => onChipClick(w)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onChipClick(w)}
                aria-label={selected === w ? `${w} ausgewählt – Tippe auf eine Zone` : w}
              >
                {w}
              </div>
            ))
          : <p className="wz-bank-done">Alle Wörter zugeordnet ✓</p>
        }
      </div>

      {selected && (
        <p className="wz-hint">Tippe auf eine Zone, um <strong>{selected}</strong> einzuordnen</p>
      )}

      {/* Drop-Zonen */}
      <div className="wz-zones">
        {[['A', data.wortA, zoneA], ['B', data.wortB, zoneB]].map(([z, label, zone]) => {
          const isOver      = dragOver === z
          const isFull      = zone.length >= 5
          const isClickable = !!selected && !isFull
          return (
            <div
              key={z}
              className={[
                'wz-zone',
                isOver      ? 'wz-zone--over'      : '',
                isClickable ? 'wz-zone--clickable'  : '',
                isFull      ? 'wz-zone--full'       : '',
              ].filter(Boolean).join(' ')}
              onDragOver={e => onDragOverZone(e, z)}
              onDragLeave={() => setDragOver(prev => prev === z ? null : prev)}
              onDrop={e => onDropZone(e, z)}
              onClick={() => onZoneClick(z)}
            >
              <div className="wz-zone-label">{label}</div>
              <div className="wz-zone-chips">
                {zone.map(w => (
                  <div
                    key={w}
                    role="button"
                    tabIndex={0}
                    className={`wz-chip wz-chip--placed${dragging === w ? ' wz-chip--dragging' : ''}`}
                    draggable
                    onDragStart={e => onDragStart(e, w)}
                    onDragEnd={onDragEnd}
                    onClick={e => { e.stopPropagation(); onChipClick(w) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChipClick(w) } }}
                    aria-label={`${w} zurück in Bank legen`}
                  >
                    {w}
                  </div>
                ))}
                {Array.from({ length: 5 - zone.length }).map((_, i) => (
                  <div key={i} className="wz-slot-empty" />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <button
        className="btn-primary btn-full"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {canSubmit
          ? 'Auswerten'
          : `Noch ${remaining} Wort${remaining !== 1 ? 'e' : ''} zuordnen`}
      </button>
    </div>
  )
}
