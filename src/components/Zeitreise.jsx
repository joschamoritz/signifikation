import { useState, useRef, useEffect, useCallback } from 'react'
import { getMedal, getZRMedal, shuffle } from '../utils/gameLogic'
import { API } from '../config'
import { lsGet, lsParse } from '../utils/storage'
import { computeStreak } from '../utils/homeUtils'
import { shareAsImage } from '../utils/shareImage'
import BelegeSatz from './BelegeSatz'
import ZrBubbleChart from './ZrBubbleChart'

function formatPeriod(label) {
  return `um ${label}`
}

export default function Zeitreise({ data, onBack, onFinish, savedResult }) {
  // data: { lemma, paare: [{jahrzehnt, kollokat}] } — paare sorted chronologically
  const paare = data.paare

  // Shuffled chips (collocates) – only computed once
  const [chips] = useState(() => shuffle(paare.map(p => p.kollokat)))

  // placements: { [jahrzehnt]: kollokat }
  const [placements, setPlacements] = useState(() => savedResult?.placements ?? {})
  const [selected, setSelected]     = useState(null)  // currently selected chip
  const [revealed, setRevealed]     = useState(() => savedResult !== null)
  const [score, setScore]           = useState(() => savedResult?.total ?? null)
  const [sharing,  setSharing]      = useState(false)
  const [imgState, setImgState]     = useState(null)

  // IPA
  const [ipa, setIpa] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API}/ipa?q=${encodeURIComponent(data.lemma)}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => { if (d[0]?.ipa) setIpa(d[0].ipa) })
      .catch(err => { if (err.name !== 'AbortError') console.error('IPA fetch (Zeitreise):', err) })
    return () => controller.abort()
  }, [data.lemma])

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
      const r = await fetch(`${API}/belege?${params}`)
      const d = await r.json()
      setBelegeCache(prev => ({ ...prev, [kollokat]: Array.isArray(d) ? d : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [kollokat]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  // ── Joker ────────────────────────────────────────────────────
  const [jokerVisible, setJokerVisible] = useState(false)
  const [jokerUsed,    setJokerUsed]    = useState(false)
  const [jokerBlock,   setJokerBlock]   = useState(null) // { chip, blockedJahrzehnt }
  const jokerTimer = useRef(null)

  useEffect(() => {
    if (revealed || jokerUsed) return
    setJokerVisible(false)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 20000)
    return () => clearTimeout(jokerTimer.current)
  }, [revealed, jokerUsed])

  function resetJokerTimer() {
    if (jokerUsed || revealed) return
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 20000)
  }

  function activateJoker() {
    if (jokerUsed || revealed) return
    setJokerUsed(true)
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    // Wähle einen zufälligen noch nicht korrekt platzierten Chip
    const candidates = paare.filter(p => placements[p.jahrzehnt] !== p.kollokat)
    if (!candidates.length) return
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    // Wähle eine zufällige falsche Periode zum Blockieren
    const wrongPeriods = paare.map(p => p.jahrzehnt).filter(j => j !== target.jahrzehnt)
    const blocked = wrongPeriods[Math.floor(Math.random() * wrongPeriods.length)]
    setJokerBlock({ chip: target.kollokat, blockedJahrzehnt: blocked })
  }

  // Pointer-drag state (works on touch + mouse)
  const pointerDragRef = useRef(null)

  // Ghost-Div cleanup bei Unmount während aktivem Drag
  useEffect(() => {
    return () => { pointerDragRef.current?.ghost?.remove() }
  }, [])

  // ── Derived state ────────────────────────────────────────────
  const placedSet  = new Set(Object.values(placements))
  const freeChips  = chips.filter(c => !placedSet.has(c))
  const allPlaced  = paare.every(p => placements[p.jahrzehnt])

  // ── Core operation ───────────────────────────────────────────
  function placeChip(chip, jahrzehnt) {
    if (revealed) return
    if (jokerBlock && jokerBlock.chip === chip && jokerBlock.blockedJahrzehnt === jahrzehnt) return
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
    if (revealed) {
      const paar = paare.find(p => p.jahrzehnt === jahrzehnt)
      if (paar) loadZrBelege(paar)
      return
    }
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
    onFinish(s, placements)
  }

  const [zrHistory] = useState(() => lsParse(lsGet('sig_zr_history'), []).slice(0, 14).reverse())
  const medal = score !== null ? getZRMedal(score, paare.length * 2) : null
  const remaining = paare.length - Object.keys(placements).length

  async function shareImg() {
    if (sharing || score === null) return
    setSharing(true)
    try {
      const result = await shareAsImage(
        [], { total: score, max: paare.length * 2, medal }, null,
        computeStreak()
      )
      if (result === 'shared' || result === 'downloaded') {
        setImgState(result)
        setTimeout(() => setImgState(null), 2500)
      }
    } catch {}
    finally { setSharing(false) }
  }

  return (
    <div className="screen zeitreise-screen" onClick={resetJokerTimer}>
      <button className="back-btn" onClick={onBack} aria-label="Zurück zur Startseite"><span className="back-btn-chevron">‹</span>Zurück</button>

      {/* Header */}
      <div className="zeitreise-header">
        <span className="zeitreise-badge">Zeitreise</span>
        <div className="dict-entry-header">
          <h1 className="zeitreise-word">{data.lemma}</h1>
          <div className="dict-entry-meta">
            {ipa && <span className="lautschrift">[{ipa}]</span>}
            {(data.pos || data.wortart) && <span className="dict-entry-wortart">{data.pos || data.wortart}</span>}
          </div>
          {(ipa || data.pos || data.wortart) && <hr className="dict-entry-rule" aria-hidden="true" />}
        </div>
        <p className="zeitreise-desc">
          Ordne jeden Kollokator dem Zeitraum zu, in dem er besonders
          häufig mit <em>{data.lemma}</em> aufgetreten ist.
          {!revealed && !jokerUsed && jokerVisible && (
            <button className="joker-btn" onClick={e => { e.stopPropagation(); activateJoker() }} aria-label="Hinweis aktivieren" title="Hinweis"><em>i</em></button>
          )}
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


      {/* Zones */}
      <div className="zr-zones">
        {paare.map(p => {
          const placed   = placements[p.jahrzehnt]
          const isRight  = revealed && placed === p.kollokat
          const isWrong  = revealed && placed && placed !== p.kollokat
          const isMissed = revealed && !placed
          const belegOpen = revealed && openBeleg === p.kollokat
          const belegData = belegeCache[p.kollokat]

          const isJokerBlocked = jokerBlock && selected === jokerBlock.chip && p.jahrzehnt === jokerBlock.blockedJahrzehnt

          const zoneLabel = revealed
            ? `${formatPeriod(p.jahrzehnt)}: ${placed || p.kollokat}${isRight ? ', richtig' : isWrong ? ', falsch' : isMissed ? ', nicht belegt' : ''}`
            : `Zeitraum ${formatPeriod(p.jahrzehnt)}${placed ? `, belegt mit ${placed}` : ', leer'}`

          return (
            <div key={p.jahrzehnt} className="zr-zone-wrapper">
              <div
                className={[
                  'zr-zone',
                  placed    ? 'zr-zone--filled' : '',
                  isJokerBlocked ? 'zr-zone--blocked' : selected && !revealed ? 'zr-zone--droppable' : '',
                  isRight   ? 'zr-zone--right'  : '',
                  isWrong   ? 'zr-zone--wrong'   : '',
                  isMissed  ? 'zr-zone--missed'  : '',
                ].filter(Boolean).join(' ')}
                data-jahrzehnt={p.jahrzehnt}
                onClick={() => handleZoneClick(p.jahrzehnt)}
                tabIndex={revealed ? -1 : 0}
                role="button"
                aria-label={zoneLabel}
                onKeyDown={e => {
                  if (!revealed && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    handleZoneClick(p.jahrzehnt)
                  }
                }}
              >
                <span className="zr-zone-period">{formatPeriod(p.jahrzehnt)}</span>

                <div className="zr-zone-slot">
                  {placed ? (
                    <button
                      className={[
                        'zr-chip zr-chip--placed',
                        isRight  ? 'zr-chip--right'  : '',
                        isWrong  ? 'zr-chip--wrong'   : '',
                        belegOpen ? 'zr-chip--beleg-active' : '',
                      ].filter(Boolean).join(' ')}
                      onPointerDown={revealed ? undefined : e => onChipPointerDown(e, placed)}
                      onPointerMove={onChipPointerMove}
                      onPointerUp={onChipPointerUp}
                      onPointerCancel={onChipPointerCancel}
                      onClick={e => handlePlacedChipClick(e, p.jahrzehnt)}
                      aria-expanded={revealed ? belegOpen : undefined}
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
                    <p className="belege-status">Belege konnten nicht geladen werden.</p>
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
            <span className="zr-score-max">/{paare.length * 2} Punkte</span>
          </div>
          <p className="zr-results-medal">{medal?.emoji} {medal?.label}</p>

          {/* Bubble-Chart – SVG, kein externes Package */}
          <ZrBubbleChart paare={paare} perioden={data.perioden} placements={placements} lemma={data.lemma} />

          <div className="wortprofil-card">
            <div className="wortprofil-header">
              <div className="wortprofil-title-row">
                <p className="wortprofil-title">Wortprofil · {data.lemma}</p>
                <a
                  className="extern-link"
                  href={`https://de.wiktionary.org/wiki/${encodeURIComponent(data.lemma)}`}
                  target="_blank" rel="noopener noreferrer"
                  aria-label={`Mehr über „${data.lemma}" auf Wiktionary erfahren`}
                >Mehr erfahren auf Wiktionary ↗</a>
              </div>
            </div>
            <p className="zr-results-info">
              Auswahl nach temporaler Distinktivität ·{' '}
              <a href="/ueber.html#korpora" className="intern-link">Verwendete Korpora ↗</a>
            </p>
          </div>
          {zrHistory.length > 0 && (
            <div className="history-strip">
              <span className="history-label">Dein Verlauf · Zeitreise</span>
              <div className="history-emojis" role="list" aria-label="Verlauf Zeitreise">
                {zrHistory.map((h, i) => (
                  <span key={i} role="listitem" className="history-emoji"
                        title={`${h.date}: ${h.medal}`} aria-label={`${h.date}: ${h.medal}`}>
                    {h.emoji}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button
            className={`btn-ghost btn-full dc-share-btn${imgState ? ' dc-share-btn--copied' : ''}${sharing ? ' dc-share-btn--loading' : ''}`}
            onClick={shareImg}
            disabled={sharing}
          >
            {sharing ? 'Wird erstellt…' : imgState === 'shared' ? 'Geteilt ✓' : imgState === 'downloaded' ? 'Gespeichert ✓' : 'Als Bild teilen'}
          </button>
          <button className="btn-primary btn-full" onClick={onBack}>
            Zur Startseite
          </button>
        </div>
      )}
    </div>
  )
}
