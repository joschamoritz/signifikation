// Premium-Feature „Eigenes Lemma" – erscheint als weiterer Wörterbuch-Eintrag
// unter den Tageslemmata. Eingeklappt eine ruhige Zeile, aufgeklappt eine
// Eingabe-Karte, die Typografie und Layout der Lemma-Karten spiegelt.
//
// Kontingent (Phase 4): Premium = unbegrenzt; Basic = 1/Tag + Admin-Bonus;
// nicht eingeloggt = Login nötig. Das `customLemma`-Objekt kommt aus
// /account/entitlements: { unlimited } | { unlimited:false, allowance, remaining,
// requiresLogin? }.
//
// Modi: Kollokationen / Zeitenwende / Lückenfüller nehmen ein Wort (q);
// Wort-Zwilling zwei Wörter (a/b) – dort gestapelt mit „vs."-Linie.
//
// Live-Vorabprüfung gegen /custom-lemma/validate (debounced, verbraucht nichts);
// „Spielen" holt /custom-lemma/play (verbraucht 1) und reicht das Ergebnis an
// onPlay weiter. Nach „spielbar" werden (Einzelwort-Modi) IPA + Definition über
// useWiktionary nachgeladen.

import { useEffect, useRef, useState } from 'react'
import { API } from '../config'
import { apiFetch } from '../utils/apiFetch'
import { useWiktionary } from '../hooks/useWiktionary'
import { logError } from '../utils/logError'

const DEBOUNCE_MS = 400
const MIN_LEN = 2

export default function EigenesLemma({ mode = 'kollokationen', customLemma = null, onPlay }) {
  const isPair = mode === 'wortzwilling'

  const unlimited     = customLemma?.unlimited === true
  const remaining     = customLemma?.remaining ?? 0
  const requiresLogin = customLemma?.requiresLogin === true
  const loading       = customLemma == null
  const canUse        = unlimited || remaining > 0

  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [qa, setQa]           = useState('')
  const [qb, setQb]           = useState('')
  const [status, setStatus]   = useState({ state: 'idle' }) // idle|checking|ok|bad|locked|error
  const [playing, setPlaying] = useState(false)
  const timerRef = useRef(null)
  const reqIdRef = useRef(0)

  const a = qa.trim(), b = qb.trim(), q = query.trim()
  const ready = isPair ? (a.length >= MIN_LEN && b.length >= MIN_LEN) : q.length >= MIN_LEN
  const params = isPair
    ? `mode=${mode}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
    : `mode=${mode}&q=${encodeURIComponent(q)}`

  const enrichWord = (!isPair && status.state === 'ok') ? q : ''
  const { ipa: enrichIpa, definitionen: enrichDefs } = useWiktionary({ lemma: enrichWord })

  useEffect(() => {
    if (!open || !canUse) return undefined
    if (!ready) { setStatus({ state: 'idle' }); return undefined }

    setStatus({ state: 'checking' })
    const myReq = ++reqIdRef.current
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`${API}/custom-lemma/validate?${params}`, { credentials: 'include' })
        if (myReq !== reqIdRef.current) return
        if (res.status === 401 || res.status === 403) { setStatus({ state: 'locked' }); return }
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
  }, [params, ready, open, canUse])

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

  // Rechte Notiz der eingeklappten Zeile (Zustand des Kontingents).
  let toggleNote = null
  if (loading) toggleNote = null
  else if (unlimited) toggleNote = null
  else if (requiresLogin) toggleNote = 'Anmelden'
  else if (remaining > 0) toggleNote = `${remaining} heute frei`
  else toggleNote = 'Gesamtausgabe'

  // ── Eingeklappt: ruhige Zeile im Nummern-Raster ─────────────────
  if (!open) {
    return (
      <div className="lemma-card-wrap">
        <button type="button" className="eigenes-lemma-toggle" onClick={() => setOpen(true)} aria-expanded="false">
          <span className="eigenes-lemma-marker" aria-hidden="true">＋</span>
          <span className="eigenes-lemma-toggle__label">{label}</span>
          {toggleNote && <span className="eigenes-lemma-toggle__premium">{toggleNote}</span>}
        </button>
      </div>
    )
  }

  const Shell = ({ children }) => (
    <div className="lemma-card-wrap">
      <div className="lemma-card lemma-card--eigenes">
        <button
          type="button"
          className="eigenes-lemma-marker eigenes-lemma-marker--btn"
          onClick={() => setOpen(false)}
          aria-label={`${label} schließen`}
        >＋</button>
        <div className="eigenes-lemma-info">{children}</div>
      </div>
    </div>
  )

  // ── Login nötig (nicht eingeloggt) ──────────────────────────────
  if (requiresLogin) {
    return (
      <Shell>
        <span className="eigenes-lemma-name eigenes-lemma-name--muted">{label}</span>
        <p className="eigenes-lemma-hint">
          Melde dich an, um {isPair ? 'eigene Wörter' : 'ein eigenes Wort'} zu spielen –
          jeden Tag eines gratis, mit der <strong>Gesamtausgabe</strong> unbegrenzt.
        </p>
      </Shell>
    )
  }

  // ── Kontingent aufgebraucht (Basic, 0 übrig) ────────────────────
  if (!loading && !canUse) {
    return (
      <Shell>
        <span className="eigenes-lemma-name eigenes-lemma-name--muted">{label}</span>
        <p className="eigenes-lemma-hint">
          Dein heutiges Gratis-Spiel ist aufgebraucht. Mit der <strong>Gesamtausgabe</strong> spielst du unbegrenzt eigene {isPair ? 'Wort-Paare' : 'Wörter'}.
        </p>
      </Shell>
    )
  }

  // ── Eingabe (unbegrenzt oder Kontingent übrig; loading optimistisch) ─
  const canPlay = status.state === 'ok' && !playing

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

          <p className={`eigenes-lemma-status eigenes-lemma-status--${status.state}`} role="status">
            {status.state === 'idle'     && (isPair ? 'Gib zwei Wörter ein – ich prüfe, ob das Paar spielbar ist.' : 'Gib ein Wort ein – ich prüfe, ob es spielbar ist.')}
            {status.state === 'checking' && 'Prüfe Eignung …'}
            {status.state === 'ok'       && <><span aria-hidden="true">✓ </span>Spielbar.</>}
            {status.state === 'bad'      && <><span aria-hidden="true">✕ </span>{status.reason}</>}
            {status.state === 'locked'   && 'Dafür ist die Gesamtausgabe nötig.'}
            {status.state === 'error'    && 'Prüfung gerade nicht möglich – versuch es nochmal.'}
          </p>

          {!isPair && status.state === 'ok' && (enrichIpa || enrichDefs.length > 0) && (
            <p className="eigenes-lemma-enrich">
              {enrichIpa && <span className="lautschrift">[{enrichIpa}]</span>}
              {enrichIpa && enrichDefs.length > 0 && ' · '}
              {enrichDefs.length > 0 && <span className="eigenes-lemma-enrich__def">{enrichDefs[0]}</span>}
            </p>
          )}

          {!unlimited && remaining > 0 && (
            <p className="eigenes-lemma-quota">Noch {remaining} heute frei · mit Gesamtausgabe unbegrenzt</p>
          )}
        </div>

        <button type="submit" className="eigenes-lemma-play" disabled={!canPlay} aria-label={`${label} spielen`}>
          {playing ? 'Lädt …' : 'Spielen'}
          {!playing && <span className="eigenes-lemma-play__arrow" aria-hidden="true"> →</span>}
        </button>
      </form>
    </div>
  )
}
