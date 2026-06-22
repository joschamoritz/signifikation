// „Eigenes Lemma" im Kurs (AP9): die Lehrkraft wählt ein Wort → die
// corpus-template-Aufgaben (und das Arbeitsblatt) werden mit echten Belegen
// dieses Worts gefüllt. Premium-only (der ganze Kurs-Tab ist Premium); kein
// Verbrauch des Basic-Tageskontingents.

import { useState } from 'react'
import { API } from '../../config'
import { apiGet, ApiError } from '../../api/client'

export default function CustomLemmaBar({ applied, appliedInfo, onApply, onClear, onOpenWorksheet }) {
  const [word, setWord] = useState('')
  const [state, setState] = useState('idle') // idle | checking | error
  const [message, setMessage] = useState(null)

  async function check(e) {
    e.preventDefault()
    const q = word.trim()
    if (!q) return
    setState('checking')
    setMessage(null)
    try {
      const res = await apiGet(`${API}/course/lemma/validate?q=${encodeURIComponent(q)}`)
      if (res.usable) {
        setState('idle')
        setMessage(null)
        onApply(q, { pos: res.pos, count: res.count })
        setWord('')
      } else {
        setState('error')
        setMessage(res.reason || 'Dieses Wort hat zu wenige Wortpartner im Korpus.')
      }
    } catch (err) {
      setState('error')
      setMessage(err instanceof ApiError ? err.message : 'Prüfung fehlgeschlagen.')
    }
  }

  if (applied) {
    return (
      <div className="course-lemma course-lemma--active">
        <div className="course-lemma-active-text">
          <span className="course-lemma-badge">Eigenes Lemma</span>
          <strong className="course-lemma-word">{applied}</strong>
          {appliedInfo?.count != null && (
            <span className="course-lemma-count">{appliedInfo.count} Wortpartner</span>
          )}
        </div>
        <div className="course-lemma-actions">
          <button type="button" className="course-lemma-link" onClick={onOpenWorksheet}>
            Arbeitsblatt öffnen
          </button>
          <button type="button" className="course-lemma-link course-lemma-link--muted" onClick={onClear}>
            Zurücksetzen
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="course-lemma" onSubmit={check}>
      <label className="course-lemma-label" htmlFor="course-lemma-input">
        Eigenes Lemma einsetzen
      </label>
      <p className="course-lemma-hint">
        Wort wählen — die Aufgaben werden mit echten Korpusbelegen dieses Worts gefüllt.
      </p>
      <div className="course-lemma-row">
        <input
          id="course-lemma-input"
          className="course-lemma-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="z. B. Entscheidung"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          disabled={state === 'checking'}
        />
        <button type="submit" className="course-lemma-submit" disabled={state === 'checking' || !word.trim()}>
          {state === 'checking' ? 'Prüfe …' : 'Einsetzen'}
        </button>
      </div>
      {state === 'error' && message && (
        <p className="course-lemma-error" role="alert">{message}</p>
      )}
    </form>
  )
}
