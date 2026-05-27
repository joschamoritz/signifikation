// T-4.4 — Lemma-Picker (Setup Schritt B).
//
// Suche per debounce (250 ms), maximal 3 Auswahl (hartes UI-Limit aus D3).
// Bei Erreichen des Limits werden andere Karten ausgegraut, nicht entfernt.
// Bereits gewaehlte Lemmata bleiben oben als Chips sichtbar.

import { useEffect, useRef, useState } from 'react'
import { searchLemmata } from '../hooks/useTeacherSession'

const MAX_LEMMATA = 3
const DEBOUNCE_MS = 250

export default function LemmaPicker({ value = [], onChange }) {
  const [query, setQuery]   = useState('')
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const timerRef = useRef(null)
  // Map ID → Lemma-Objekt, damit ausgewaehlte Eintraege auch dann sichtbar
  // bleiben, wenn sie nicht im aktuellen Suchergebnis vorkommen.
  const [cache, setCache] = useState({})

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await searchLemmata({ q: query, limit: 20 })
        const list = Array.isArray(data?.items) ? data.items : []
        setItems(list)
        // Cache pflegen, damit ausgewählte Lemmata sichtbar bleiben.
        setCache((prev) => {
          const next = { ...prev }
          for (const it of list) next[it.id] = it
          return next
        })
      } catch (err) {
        setError(err?.message || 'Suche fehlgeschlagen')
        setItems([])
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  function toggle(id) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id))
      return
    }
    if (value.length >= MAX_LEMMATA) return
    onChange([...value, id])
  }

  const limitReached = value.length >= MAX_LEMMATA

  return (
    <div className="cr2-lemma-picker">
      {value.length > 0 && (
        <ul className="cr2-lemma-chips" aria-label="Gewählte Lemmata">
          {value.map((id) => {
            const lemma = cache[id]
            return (
              <li key={id} className="cr2-lemma-chip">
                <span className="cr2-lemma-chip__text">
                  {lemma?.lemma || id}
                </span>
                <button
                  type="button"
                  className="cr2-lemma-chip__remove"
                  onClick={() => toggle(id)}
                  aria-label={`${lemma?.lemma || id} entfernen`}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <input
        type="search"
        className="cr2-input"
        placeholder="Lemma suchen …"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Lemma-Suche"
      />

      <p className="cr2-lemma-picker__hint">
        {value.length}/{MAX_LEMMATA} ausgewählt
        {limitReached && ' · maximale Anzahl erreicht'}
      </p>

      {loading && <p className="cr2-loading">Wird gesucht …</p>}
      {error && <p className="cr2-error">{error}</p>}

      {!loading && !error && items.length > 0 && (
        <ul className="cr2-card-list" aria-label="Suchergebnisse">
          {items.map((it) => {
            const selected = value.includes(it.id)
            const disabled = !selected && limitReached
            return (
              <li key={it.id}>
                <button
                  type="button"
                  className={`cr2-card cr2-lemma-result${selected ? ' cr2-card--active' : ''}${disabled ? ' cr2-lemma-result--disabled' : ''}`}
                  onClick={() => !disabled && toggle(it.id)}
                  aria-pressed={selected}
                  aria-disabled={disabled || undefined}
                  data-testid={`cr2-lemma-${it.id}`}
                >
                  <div className="cr2-card__row">
                    <h4 className="cr2-card__title" style={{ fontSize: '1.05rem' }}>
                      {it.lemma}
                      {it.ipa && <span className="cr2-lemma-result__ipa"> {it.ipa}</span>}
                    </h4>
                    {it.pos && <span className="cr2-card__badge">{it.pos}</span>}
                  </div>
                  {it.definition && (
                    <p className="cr2-lemma-result__def">{it.definition}</p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
