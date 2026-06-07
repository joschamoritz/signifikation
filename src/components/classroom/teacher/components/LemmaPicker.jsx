// T-4.4 — Lemma-Picker (Setup Schritt B).
//
// Suche per debounce (250 ms), maximal 3 Auswahl (hartes UI-Limit aus D3).
// Bei Erreichen des Limits werden andere Karten ausgegraut, nicht entfernt.
// Bereits gewaehlte Lemmata bleiben oben als Chips sichtbar.

import { useEffect, useRef, useState } from 'react'
import { searchLemmata, getTodayLemmata } from '../hooks/useTeacherSession'

const MAX_LEMMATA = 3
const DEBOUNCE_MS = 250

export default function LemmaPicker({ value = [], onChange, mode = null }) {
  const [query, setQuery]   = useState('')
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)
  const [todayItems, setTodayItems] = useState([])
  const timerRef = useRef(null)
  // Map ID → Lemma-Objekt, damit ausgewaehlte Eintraege auch dann sichtbar
  // bleiben, wenn sie nicht im aktuellen Suchergebnis vorkommen.
  const [cache, setCache] = useState({})

  // Tagesauswahl (Kalender) laden, wenn sich der Modus aendert.
  useEffect(() => {
    let cancelled = false
    if (!mode) { setTodayItems([]); return undefined }
    getTodayLemmata(mode)
      .then((data) => {
        if (cancelled) return
        const list = Array.isArray(data?.items) ? data.items : []
        setTodayItems(list)
        if (list.length) {
          setCache((prev) => {
            const next = { ...prev }
            for (const it of list) next[it.id] = it
            return next
          })
        }
      })
      .catch(() => { if (!cancelled) setTodayItems([]) })
    return () => { cancelled = true }
  }, [mode])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await searchLemmata({ q: query, mode, limit: 20 })
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
  }, [query, mode])

  function toggle(id) {
    if (value.includes(id)) {
      onChange(value.filter((x) => x !== id))
      return
    }
    if (value.length >= MAX_LEMMATA) return
    onChange([...value, id])
    // Nach Auswahl eines Treffers das Suchfeld leeren (gewählte Lemmata bleiben
    // als Chips sichtbar) — Wunsch aus dem Realbedingungstest.
    setQuery('')
    setItems([])
  }

  const limitReached = value.length >= MAX_LEMMATA

  const hasQuery = query.trim() !== ''

  return (
    <div className="cr2-lemma-picker">
      {/* Lemma des Tages — prominente Standardwahl als Karten. */}
      {todayItems.length > 0 && (
        <div className="cr2-today">
          <span className="cr2-today__label">Lemma des Tages</span>
          <ul className="cr2-today__cards" aria-label="Lemma des Tages">
            {todayItems.map((it) => {
              const sel = value.includes(it.id)
              const dis = !sel && value.length >= MAX_LEMMATA
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`cr2-today-card${sel ? ' cr2-today-card--active' : ''}`}
                    onClick={() => toggle(it.id)}
                    disabled={dis}
                    aria-pressed={sel}
                    data-testid={`cr2-today-${it.id}`}
                  >
                    <span className="cr2-today-card__lemma">{it.lemma}</span>
                    {it.ipa && <span className="cr2-today-card__ipa">[{it.ipa}]</span>}
                    {it.pos && <span className="cr2-today-card__pos">{it.pos}</span>}
                    <span className="cr2-today-card__mark" aria-hidden="true">{sel ? '✓' : '+'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

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

      {/* Eigenes Lemma suchen — Trefferliste erscheint nur bei Eingabe. */}
      <div className="cr2-lemma-search">
        <span className="cr2-today__label">{todayItems.length > 0 ? 'Oder eigenes Lemma' : 'Lemma suchen'}</span>
        <input
          type="search"
          className="cr2-input"
          placeholder="Lemma suchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Lemma-Suche"
        />
      </div>

      <p className="cr2-lemma-picker__hint">
        {value.length === 0
          ? `Wähle 1–${MAX_LEMMATA} deiner Spielwörter`
          : `${value.length}/${MAX_LEMMATA} ausgewählt${limitReached ? ' · Maximum erreicht' : ''}`}
      </p>

      {hasQuery && loading && <p className="cr2-loading">Wird gesucht …</p>}
      {hasQuery && error && <p className="cr2-error">{error}</p>}

      {hasQuery && !loading && !error && items.length === 0 && (
        <p className="cr2-lemma-picker__hint">Keine Treffer für „{query.trim()}".</p>
      )}

      {hasQuery && !loading && !error && items.length > 0 && (
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
