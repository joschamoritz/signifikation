// Classroom-Variante des Wort-Zwilling.
//
// Pragmatischer Tap-Flow statt Drag-and-Drop:
//   Tippen auf Wort → ausgewählt
//   Tippen auf Zone → Wort wandert dorthin
// Drag-and-Drop wäre robust, aber zwingt dnd-kit + Touch-Aushebelung in
// die Kiosk-Shell — der einfache Tap-Pfad reicht.
//
// rawAnswer: { zoneA: [strings], zoneB: [strings] }

import { useMemo, useState } from 'react'

export default function ClassroomGameWortZwilling({ lemma, prompt, onSubmit, submitting }) {
  const words = useMemo(() => Array.isArray(prompt?.words) ? prompt.words : [], [prompt])
  const [picked, setPicked]     = useState(null)
  const [zoneA, setZoneA]       = useState([])
  const [zoneB, setZoneB]       = useState([])

  const bank = useMemo(() => words.filter((w) => !zoneA.includes(w) && !zoneB.includes(w)), [words, zoneA, zoneB])
  const placedAll = bank.length === 0 && (zoneA.length + zoneB.length) === words.length

  function placeInZone(zone) {
    if (submitting || !picked) return
    if (zone === 'A') {
      setZoneB((b) => b.filter((w) => w !== picked))
      setZoneA((a) => a.includes(picked) ? a : [...a, picked])
    } else {
      setZoneA((a) => a.filter((w) => w !== picked))
      setZoneB((b) => b.includes(picked) ? b : [...b, picked])
    }
    setPicked(null)
  }

  function takeOut(w) {
    if (submitting) return
    setZoneA((a) => a.filter((x) => x !== w))
    setZoneB((b) => b.filter((x) => x !== w))
    setPicked(w)
  }

  function handleSubmit() {
    if (submitting) return
    onSubmit({ zoneA, zoneB })
  }

  return (
    <div className="cr2-kiosk__game" data-testid="cr2-kiosk-game-wortzwilling">
      <p className="cr2-kiosk__lemma">{lemma?.lemma || ''}</p>
      {lemma?.ipa ? <p className="cr2-kiosk__ipa">[{lemma.ipa}]</p> : null}
      <p className="cr2-kiosk__hint">
        Tippe ein Wort an, dann auf die passende Zone.
      </p>

      <div className="cr2-kiosk__zones">
        <div
          className="cr2-kiosk__zone"
          role="button"
          tabIndex={0}
          onClick={() => placeInZone('A')}
          onKeyDown={(e) => { if (e.key === 'Enter') placeInZone('A') }}
          data-testid="cr2-kiosk-wz-zoneA"
        >
          <p className="cr2-kiosk__zone__label">{prompt?.wortA || 'A'}</p>
          {zoneA.map((w) => (
            <span
              key={w}
              className="cr2-kiosk__pill cr2-kiosk__pill--in-zone-a"
              onClick={(e) => { e.stopPropagation(); takeOut(w) }}
            >
              {w}
            </span>
          ))}
        </div>
        <div
          className="cr2-kiosk__zone"
          role="button"
          tabIndex={0}
          onClick={() => placeInZone('B')}
          onKeyDown={(e) => { if (e.key === 'Enter') placeInZone('B') }}
          data-testid="cr2-kiosk-wz-zoneB"
        >
          <p className="cr2-kiosk__zone__label">{prompt?.wortB || 'B'}</p>
          {zoneB.map((w) => (
            <span
              key={w}
              className="cr2-kiosk__pill cr2-kiosk__pill--in-zone-b"
              onClick={(e) => { e.stopPropagation(); takeOut(w) }}
            >
              {w}
            </span>
          ))}
        </div>
      </div>

      <div className="cr2-kiosk__bank">
        {bank.map((w) => (
          <span
            key={w}
            role="button"
            tabIndex={0}
            className={`cr2-kiosk__pill ${picked === w ? 'cr2-kiosk__choice--picked' : ''}`}
            onClick={() => setPicked(picked === w ? null : w)}
            onKeyDown={(e) => { if (e.key === 'Enter') setPicked(picked === w ? null : w) }}
            style={picked === w ? { borderColor: 'var(--k-accent)' } : undefined}
            data-testid={`cr2-kiosk-wz-pill-${w}`}
          >
            {w}
          </span>
        ))}
      </div>

      <button
        type="button"
        className="cr2-kiosk__btn cr2-kiosk__btn--primary"
        onClick={handleSubmit}
        disabled={submitting}
        data-testid="cr2-kiosk-wz-submit"
      >
        {submitting ? 'Sende …' : placedAll ? 'Abgeben' : 'Abgeben (unvollständig)'}
      </button>
    </div>
  )
}
