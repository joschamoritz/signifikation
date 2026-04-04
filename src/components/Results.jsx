import { useState, useEffect } from 'react'
import { useBelege } from '../hooks/useBelege'
import { getMedal, getRundInfo } from '../utils/gameLogic'
import { lsGet, lsParse } from '../utils/storage'
import { API } from '../config'
import BelegePanel from './BelegePanel'

function getKollHistory() {
  const newHistory = lsParse(lsGet('sig_koll_history'), [])
  const medalToEmoji = { 'Gold': '🥇', 'Silber': '🥈', 'Bronze': '🥉' }
  const oldHistory = lsParse(lsGet('sig_history'), [])
    .filter(h => !newHistory.find(n => n.date === h.date))
    .map(h => ({
      date: h.date,
      medal: h.medal === 'Weiter üben!' ? 'Teilgenommen' : h.medal,
      emoji: medalToEmoji[h.medal] ?? '🌱',
    }))
  return [...newHistory, ...oldHistory]
    .sort((a, b) => a.date < b.date ? -1 : 1)
    .slice(-14)
}

export default function Results({ lemma, roundScores, onRestart, onToSelection }) {
  const kollHistory = getKollHistory()
  const total      = roundScores.reduce((a, b) => a + b, 0)

  const [ipa, setIpa] = useState('')
  useEffect(() => {
    if (!lemma?.lemma) return
    fetch(`${API}/ipa?q=${encodeURIComponent(lemma.lemma)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d) && d[0]?.ipa) setIpa(d[0].ipa) })
      .catch(() => {})
  }, [lemma?.lemma])
  const hasBonus   = roundScores.length >= 4
  const maxPoints  = hasBonus ? 10 : 9
  const medal      = getMedal(total, maxPoints)

  const { openBeleg, belegeCache, belegeLoading, loadBelege } = useBelege(lemma.lemma)

  return (
    <div className="screen results-screen">

      {/* ── Kopf: Wort + Wortart + Notiz ── */}
      <header className="results-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="lemma-played-title">{lemma.lemma}</h1>
        {ipa && (
          <p className="results-ipa">[{ipa}]</p>
        )}
        {lemma.wortart && (
          <p className="results-wortart">{lemma.wortart}</p>
        )}
        {lemma.notiz && (
          <div className="lemma-notiz results-notiz">
            <span>{lemma.notiz}</span>
            {lemma.link && (
              <a href={lemma.link} target="_blank" rel="noopener noreferrer"
                className="lemma-notiz-link"
                aria-label={`Mehr über ${lemma.lemma} erfahren (öffnet externen Link)`}>
                Mehr →
              </a>
            )}
          </div>
        )}
      </header>

      {/* ── Wortprofil ── */}
      <div className="wortprofil-card">
        <div className="wortprofil-header">
          <div className="wortprofil-title-row">
            <p className="wortprofil-title">Wortprofil · {lemma.lemma}</p>
            <a
              className="extern-link"
              href={`https://de.wiktionary.org/wiki/${encodeURIComponent(lemma.lemma)}`}
              target="_blank" rel="noopener noreferrer"
              aria-label={`Mehr über „${lemma.lemma}" auf Wiktionary erfahren (öffnet externen Link)`}
            >Mehr erfahren ↗</a>
          </div>
        </div>

        {getRundInfo(lemma).map(({ key, label, desc }) => {
          const relCode = lemma.rundenInfo?.find(r => r.key === key)?.relCode ?? ''
          const top3 = (lemma.runden[key] || [])
            .filter(k => k.rang <= 3)
            .sort((a, b) => a.rang - b.rang)

          return (
            <div key={key} className="wortprofil-row">
              <span className="wortprofil-label">{label}</span>
              <span className="wortprofil-desc">{desc}</span>
              <div className="wortprofil-items">
                {top3.map(k => (
                  <button
                    key={k.wort}
                    className={`wortprofil-item${openBeleg === k.wort ? ' option--beleg-active' : ''}`}
                    onClick={() => loadBelege(k.wort, k.wort, { rel: relCode })}
                    aria-label={`${k.wort} – Korpusbelege ansehen`}
                    aria-pressed={openBeleg === k.wort}
                  >
                    {k.wort}
                    <span className="logdice" aria-hidden="true">{k.log_dice}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        {openBeleg && (
          <BelegePanel
            lemma={lemma.lemma}
            collocate={openBeleg}
            data={belegeCache[openBeleg]}
            loading={belegeLoading}
          />
        )}
      </div>

      {/* ── Score-Banner (unten, wie Zeitreise) ── */}
      <div className="results-score-banner">
        <div className="results-score-row">
          <span className="results-score-num">{total}</span>
          <span className="results-score-max">/ {maxPoints} Punkte</span>
        </div>
        <p className="results-medal">{medal.emoji} {medal.label}</p>
      </div>

      {/* ── Aktionen ── */}
      <div className="results-actions">
        <button className="btn-secondary" onClick={onToSelection}>
          Alle Wörter ansehen
        </button>
        <button className="btn-primary" onClick={onRestart}>
          Zur Startseite
        </button>
      </div>

      {/* ── Verlauf ── */}
      {kollHistory.length > 0 && (
        <div className="history-strip">
          <span className="history-label">Dein Verlauf · Kollokationen</span>
          <div className="history-emojis" role="list" aria-label="Verlauf Kollokationen">
            {kollHistory.map((h, i) => (
              <span key={i} role="listitem" className="history-emoji"
                    title={`${h.date}: ${h.medal}`} aria-label={`${h.date}: ${h.medal}`}>
                {h.emoji}
              </span>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
