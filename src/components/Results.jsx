import { useState, useEffect } from 'react'
import { useBelege } from '../hooks/useBelege'
import { getMedal, getRundInfo } from '../utils/gameLogic'
import { lsGet, lsParse } from '../utils/storage'
import { API } from '../config'
import BelegePanel from './BelegePanel'

/**
 * Filtert `definitionen`-Strings auf echte Bedeutungseinträge.
 * Schließt aus: Synonymlisten, Beispielsätze, Oberbegriffe.
 * Heuristik: Synonyme sind kommagetrennte Wortlisten oder Einzelwörter;
 * Beispiele sind vollständige Sätze (Großbuchstabe + Satzzeichen am Ende oder Anführungszeichen).
 */
function filterDefinitionen(list) {
  return (list ?? []).filter(text => {
    const content = text.replace(/^\[\d+[a-z]?\]\s*/, '').trim()
    // Direkte Zitate / Beispiele
    if (content.startsWith('„') || content.startsWith('"')) return false
    // Vollständige Sätze (Beispiele)
    if (/^[A-ZÄÖÜ].*[.!?]$/.test(content)) return false
    // Klammern herausnehmen für weitere Analyse
    const noParens = content.replace(/\([^)]*\)/g, '').trim()
    // Einzelwörter oder Schrägstrich-Varianten → Synonym/Oberbegriff
    if (/^[\wäöüÄÖÜß/-]+$/.test(noParens)) return false
    // Kommagetrennte Wortliste (je ≤ 2 Wörter pro Segment) → Synonyme
    const parts = noParens.split(/,\s*/).filter(Boolean)
    if (parts.length >= 2 && parts.every(p => p.trim().split(/\s+/).length <= 2)) return false
    return true
  })
}

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

  const [ipa, setIpa] = useState(lemma.ipa || '')
  useEffect(() => {
    if (lemma.ipa || !lemma?.lemma) return   // gespeicherte IPA vorhanden → kein Fetch nötig
    fetch(`${API}/ipa?q=${encodeURIComponent(lemma.lemma)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d) && d[0]?.ipa) setIpa(d[0].ipa) })
      .catch(() => {})
  }, [lemma?.lemma])
  const isGemischt = !!lemma?.runden?.gemischt
  const hasBonus   = !isGemischt && roundScores.length >= 4
  const maxPoints  = (isGemischt || hasBonus) ? 10 : 9
  const medal      = getMedal(total, maxPoints)

  const isPerfect  = total === maxPoints
  const [showSine, setShowSine] = useState(isPerfect)
  useEffect(() => {
    if (!isPerfect) return
    const t = setTimeout(() => setShowSine(false), 1500)
    return () => clearTimeout(t)
  }, [isPerfect])

  const { openBeleg, belegeCache, belegeLoading, loadBelege } = useBelege(lemma.lemma)

  return (
    <div className="screen results-screen">

      {/* ── Kopf: Wort + Wortart + Notiz ── */}
      <header className="results-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <div className="results-title-wrap">
          {isPerfect && (
            <p className={`sine-errore${showSine ? '' : ' sine-errore--out'}`} aria-hidden="true">
              sine errore
            </p>
          )}
          <h1 className={`lemma-played-title${showSine ? ' lemma-played-title--veiled' : ''}`}>
            {lemma.lemma}
          </h1>
        </div>
        {ipa && (
          <p className="results-ipa">[{ipa}]</p>
        )}
        {lemma.wortart && (
          <p className="results-wortart">{lemma.wortart}</p>
        )}
        {(lemma.definitionen?.length > 0 || lemma.definition) && (() => {
          const defs = lemma.definitionen?.length > 0
            ? filterDefinitionen(lemma.definitionen)
            : [lemma.definition]
          return defs.length > 0 ? (
            <div className="results-definitionen">
              {defs.map((d, i) => (
                <p key={i} className="results-definition-item">{d}</p>
              ))}
            </div>
          ) : null
        })()}
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
