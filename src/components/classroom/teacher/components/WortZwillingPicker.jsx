// Wort-Zwilling-Auswahl (Setup) — Paar statt Lemma.
//
// Ein Wort-Zwilling ist ein PAAR (wortA, wortB), das live aus zwei Wort-
// profilen generiert wird. Es passt nicht in den Lemma-Picker. Diese Komponente
// liefert das Paar als synthetische „wz:“-ID an block.lemmaIds — so bleibt die
// Assignment-Pipeline (lemma_ids: string[]) unveraendert.

import { useEffect, useState } from 'react'
import { getTodayWortzwilling } from '../hooks/useTeacherSession'

const WZ_PREFIX = 'wz:'

// Spiegelt server/classroom/content.js (Wire-Format — bewusst dupliziert).
function makeWzId(wortA, wortB, pos = 'Substantiv') {
  return `${WZ_PREFIX}${encodeURIComponent(wortA)}:${encodeURIComponent(wortB)}:${encodeURIComponent(pos)}`
}
function parseWzId(id) {
  if (typeof id !== 'string' || !id.startsWith(WZ_PREFIX)) return null
  const p = id.slice(WZ_PREFIX.length).split(':')
  if (p.length < 2) return null
  const wortA = decodeURIComponent(p[0] || '').trim()
  const wortB = decodeURIComponent(p[1] || '').trim()
  const pos   = p[2] ? decodeURIComponent(p[2]).trim() : 'Substantiv'
  if (!wortA || !wortB) return null
  return { wortA, wortB, pos }
}

export default function WortZwillingPicker({ value = [], onChange }) {
  const initial = value.length ? parseWzId(value[0]) : null
  const [wortA, setWortA] = useState(initial?.wortA || '')
  const [wortB, setWortB] = useState(initial?.wortB || '')
  const [today, setToday] = useState(null)

  useEffect(() => {
    let cancelled = false
    getTodayWortzwilling()
      .then((data) => { if (!cancelled) setToday(data?.pair || null) })
      .catch(() => { if (!cancelled) setToday(null) })
    return () => { cancelled = true }
  }, [])

  function setPair(na, nb, pos = 'Substantiv') {
    setWortA(na)
    setWortB(nb)
    const a = String(na || '').trim()
    const b = String(nb || '').trim()
    onChange(a && b ? [makeWzId(a, b, pos)] : [])
  }

  const isToday = today && wortA.trim() === today.wortA && wortB.trim() === today.wortB

  return (
    <div className="classroom-wz-picker">
      {today && (
        <div className="classroom-today">
          <span className="classroom-today__label">Paar des Tages</span>
          <ul className="classroom-today__cards" aria-label="Paar des Tages">
            <li>
              <button
                type="button"
                className={`classroom-today-card${isToday ? ' classroom-today-card--active' : ''}`}
                onClick={() => setPair(today.wortA, today.wortB, today.pos)}
                aria-pressed={!!isToday}
                data-testid="classroom-wz-today"
              >
                <span className="classroom-today-card__lemma">{today.wortA} ↔ {today.wortB}</span>
                <span className="classroom-today-card__mark" aria-hidden="true">{isToday ? '✓' : '+'}</span>
              </button>
            </li>
          </ul>
        </div>
      )}

      <div className="classroom-wz-fields">
        <input
          type="text"
          className="classroom-wz-field"
          placeholder="Erstes Wort"
          value={wortA}
          onChange={(e) => setPair(e.target.value, wortB)}
          aria-label="Erstes Wort"
          data-testid="classroom-wz-a"
        />
        <span className="classroom-wz-sep" aria-hidden="true">↔</span>
        <input
          type="text"
          className="classroom-wz-field"
          placeholder="Zweites Wort"
          value={wortB}
          onChange={(e) => setPair(wortA, e.target.value)}
          aria-label="Zweites Wort"
          data-testid="classroom-wz-b"
        />
      </div>
    </div>
  )
}
