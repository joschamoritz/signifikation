// Premium-Feature „Eigenes Lemma" – erscheint als weiterer Wörterbuch-Eintrag
// unter den Tageslemmata. Eingeklappt eine ruhige Zeile, aufgeklappt eine
// Eingabe-Karte, die Typografie und Layout der Lemma-Karten spiegelt.
//
// Modi: Kollokationen / Zeitenwende / Lückenfüller nehmen ein Wort (q);
// Wort-Zwilling zwei Wörter (a/b) – dort gestapelt mit „vs."-Linie wie das
// Tages-Paar.
//
// Live-Vorabprüfung gegen /custom-lemma/validate (debounced); bei Eignung holt
// „Spielen" die Spieldaten über /custom-lemma/play und reicht das vollständige
// Ergebnis an onPlay weiter – der Selection-Screen routet koll → onSelect(lemma),
// die übrigen → playCustomGame(mode, data). Nach „✓ Spielbar" werden (bei
// Einzelwort-Modi) IPA + Definition über die vorhandene Wiktionary-Pipeline
// nachgeladen und angezeigt.

import { useEffect, useRef, useState } from 'react'
import { API } from '../config'
import { apiFetch } from '../utils/apiFetch'
import { useWiktionary } from '../hooks/useWiktionary'
import { logError } from '../utils/logError'

const DEBOUNCE_MS = 400
const MIN_LEN = 2

export default function EigenesLemma({ mode = 'kollokationen', gesamtausgabe = false, onPlay }) {
  const isPair = mode === 'wortzwilling'

  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')   // Einzelwort-Modi
  const [qa, setQa]           = useState('')   // Wort-Zwilling: Wort A
  const [qb, setQb]           = useState('')   // Wort-Zwilling: Wort B
  const [status, setStatus]   = useState({ state: 'idle' }) // idle|checking|ok|bad|locked|error
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef(null)
  const reqIdRef = useRef(0)

  const a = qa.trim(), b = qb.trim(), q = query.trim()
  const ready = isPair ? (a.length >= MIN_LEN && b.length >= MIN_LEN) : q.length >= MIN_LEN
  const params = isPair
    ? `mode=${mode}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
    : `mode=${mode}&q=${encodeURIComponent(q)}`

  // IPA + Definition nur für Einzelwort-Modi und nur, wenn das Wort spielbar ist.
  const enrichWord = (!isPair && status.state === 'ok') ? q : ''
  const { ipa: enrichIpa, definitionen: enrichDefs } = useWiktionary({ lemma: enrichWord })

  // Live-Vorabprüfung (debounced). Jede Anfrage trägt eine laufende Nummer,
  // damit verspätete Antworten ein neueres Ergebnis nicht überschreiben.
  useEffect(() => {
    if (!open || !gesamtausgabe) return undefined
    if (!ready) { setStatus({ state: 'idle' }); return undefined }

    setStatus({ state: 'checking' })
    const myReq = ++reqIdRef.current
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API}/custom-lemma/validate?${params}`, { credentials: 'include' })
        if (myReq !== reqIdRef.current) return
        if (res.status === 403) { setStatus({ state: 'locked' }); return }
        const data = await res.json()
        if (myReq !== reqIdRef.current) return
        setStatus(data.usable ? { state: 'ok' } : { state: 'bad', reason: data.reason })
      } catch (err) {
        if (myReq !== reqIdRef.current) return
        logError('EigenesLemma.validate', err)
        setStatus({ state: 'error' })
      }
    }, DEBOUNCE_MS)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [params, ready, open, gesamtausgabe])

  async function play() {
    if (status.state !== 'ok' || playing) return
    setPlaying(true)
    try {
      const res = await apiFetch(`${API}/custom-lemma/play?${params}`, { credentials: 'include' })
      const data = await res.json().catch(() => null)
      const payload = data?.mode === 'kollokationen' ? data?.lemma : data?.data
      if (!res.ok || !data?.usable || !payload) {
        setStatus({ state: 'bad', reason: data?.error || 'Konnte gerade nicht geladen werden.' })
        return
      }
      onPlay(data)
    } catch (err) {
      logError('EigenesLemma.play', err)
      setStatus({ state: 'error' })
    } finally {
      setPlaying(false)
    }
  }

  const label = isPair ? 'Eigenes Wort-Paar' : 'Eigenes Lemma'

  // ── Eingeklappt: ruhige Zeile im Nummern-Raster ─────────────────
  if (!open) {
    return (
      <div className="lemma-card-wrap">
        <button type="button" className="eigenes-lemma-toggle" onClick={() => setOpen(true)} aria-expanded="false">
          <span className="eigenes-lemma-marker" aria-hidden="true">＋</span>
          <span className="eigenes-lemma-toggle__label">{label}</span>
          {!gesamtausgabe && <span className="eigenes-lemma-toggle__premium">Gesamtausgabe</span>}
        </button>
      </div>
    )
  }

  // ── Aufgeklappt ohne Premium: Upsell ────────────────────────────
  if (!gesamtausgabe) {
    return (
      <div className="lemma-card-wrap">
        <div className="lemma-card lemma-card--eigenes">
          <button
            type="button"
            className="eigenes-lemma-marker eigenes-lemma-marker--btn"
            onClick={() => setOpen(false)}
            aria-label={`${label} schließen`}
          >＋</button>
          <div className="eigenes-lemma-info">
            <span className="eigenes-lemma-name eigenes-lemma-name--muted">{label}</span>
            <p className="eigenes-lemma-hint">
              Mit der <strong>Gesamtausgabe</strong> spielst du jeden Modus mit
              {isPair ? ' selbst gewählten Wörtern' : ' einem selbst gewählten Wort'} – nicht nur mit dem Lemma des Tages.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Aufgeklappt mit Premium: Eingabe als Eintrag ────────────────
  const canPlay = status.state === 'ok' && !playing

  const statusLine = (
    <p className={`eigenes-lemma-status eigenes-lemma-status--${status.state}`} role="status">
      {status.state === 'idle'     && (isPair ? 'Gib zwei Wörter ein – ich prüfe, ob das Paar spielbar ist.' : 'Gib ein Wort ein – ich prüfe, ob es spielbar ist.')}
      {status.state === 'checking' && 'Prüfe Eignung …'}
      {status.state === 'ok'       && <><span aria-hidden="true">✓ </span>Spielbar.</>}
      {status.state === 'bad'      && <><span aria-hidden="true">✕ </span>{status.reason}</>}
      {status.state === 'locked'   && 'Dafür ist die Gesamtausgabe nötig.'}
      {status.state === 'error'    && 'Prüfung gerade nicht möglich – versuch es nochmal.'}
    </p>
  )

  const enrichLine = (!isPair && status.state === 'ok' && (enrichIpa || enrichDefs.length > 0)) && (
    <p className="eigenes-lemma-enrich">
      {enrichIpa && <span className="lautschrift">[{enrichIpa}]</span>}
      {enrichIpa && enrichDefs.length > 0 && ' · '}
      {enrichDefs.length > 0 && <span className="eigenes-lemma-enrich__def">{enrichDefs[0]}</span>}
    </p>
  )

  const inputProps = {
    type: 'text', className: 'eigenes-lemma-input',
    autoCapitalize: 'off', autoCorrect: 'off', spellCheck: 'false',
  }

  return (
    <div className="lemma-card-wrap">
      <form className="lemma-card lemma-card--eigenes" onSubmit={(e) => { e.preventDefault(); play() }}>
        <button
          type="button"
          className="eigenes-lemma-marker eigenes-lemma-marker--btn"
          onClick={() => setOpen(false)}
          aria-label={`${label} schließen`}
        >＋</button>

        <div className="eigenes-lemma-info">
          {isPair ? (
            <>
              <input {...inputProps} placeholder="Erstes Wort …" value={qa} onChange={(e) => setQa(e.target.value)} autoFocus aria-label="Erstes Wort eingeben" />
              <div className="eigenes-lemma-vs" aria-hidden="true">
                <span className="wz-vs-line" />
                <span className="wz-vs-label">vs.</span>
                <span className="wz-vs-line" />
              </div>
              <input {...inputProps} placeholder="Zweites Wort …" value={qb} onChange={(e) => setQb(e.target.value)} aria-label="Zweites Wort eingeben" />
            </>
          ) : (
            <input {...inputProps} placeholder="Dein Wort …" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Eigenes Lemma eingeben" />
          )}
          {statusLine}
          {enrichLine}
        </div>

        <button type="submit" className="eigenes-lemma-play" disabled={!canPlay} aria-label={`${label} spielen`}>
          {playing ? 'Lädt …' : 'Spielen'}
          {!playing && <span className="eigenes-lemma-play__arrow" aria-hidden="true"> →</span>}
        </button>
      </form>
    </div>
  )
}
