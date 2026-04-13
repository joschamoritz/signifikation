import { useState } from 'react'
import { API } from '../config'
import { getMedal } from '../utils/gameLogic'
import { lsGet, lsParse } from '../utils/storage'
import BelegePanel from './BelegePanel'

export function computeScore(zoneA, zoneB, zuordnungMap) {
  return [...zoneA, ...zoneB].filter(w =>
    (zoneA.includes(w) && zuordnungMap[w] === 'A') ||
    (zoneB.includes(w) && zuordnungMap[w] === 'B')
  ).length
}

/** Ergebnisansicht (nach Spielen oder beim Revisit) */
export default function WzResultsView({ data, zoneA, zoneB, onBack, ipaA, ipaB }) {
  const zuordnungMap = Object.fromEntries(data.kollokatoren.map(k => [k.wort, k.zuordnung]))
  const score  = computeScore(zoneA, zoneB, zuordnungMap)
  const medal  = getMedal(score, 10)
  const wzHistory = lsParse(lsGet('sig_wz_history'), []).slice(0, 14).reverse()

  const [openBeleg,     setOpenBeleg]     = useState(null)
  const [belegeCache,   setBelegeCache]   = useState({})
  const [belegeLoading, setBelegeLoading] = useState(false)
  async function loadWZBeleg(word) {
    if (openBeleg === word) { setOpenBeleg(null); return }
    if (belegeCache[word] !== undefined) { setOpenBeleg(word); return }
    setOpenBeleg(word)
    setBelegeLoading(true)
    const lemma = zuordnungMap[word] === 'A' ? data.wortA : data.wortB
    try {
      const params = new URLSearchParams({ collocate: word, lemma, rel: '' })
      const r = await fetch(`${API}/belege?${params}`)
      const d = await r.json()
      setBelegeCache(prev => ({ ...prev, [word]: Array.isArray(d) ? d : [] }))
    } catch {
      setBelegeCache(prev => ({ ...prev, [word]: [] }))
    } finally {
      setBelegeLoading(false)
    }
  }

  const activeLemma = openBeleg
    ? (zuordnungMap[openBeleg] === 'A' ? data.wortA : data.wortB)
    : null

  return (
    <div className="screen wz-screen">
      <button className="back-btn" onClick={onBack}><span className="back-btn-chevron">‹</span>Zurück</button>
      <header className="wz-header">
        <span className="wz-badge">Wort-Zwilling</span>
        <div className="wz-dict-pair">
          <div className="dict-entry-header">
            <h1 className="wz-title">{data.wortA}</h1>
            <div className="dict-entry-meta">
              {ipaA && <span className="lautschrift">[{ipaA}]</span>}
              {data.pos && <span className="dict-entry-wortart">{data.pos}</span>}
            </div>
            {(ipaA || data.pos) && <hr className="dict-entry-rule" aria-hidden="true" />}
          </div>
          <span className="wz-dict-vs" aria-hidden="true">·</span>
          <div className="dict-entry-header">
            <h1 className="wz-title">{data.wortB}</h1>
            <div className="dict-entry-meta">
              {ipaB && <span className="lautschrift">[{ipaB}]</span>}
              {data.pos && <span className="dict-entry-wortart">{data.pos}</span>}
            </div>
            {(ipaB || data.pos) && <hr className="dict-entry-rule" aria-hidden="true" />}
          </div>
        </div>
      </header>

      <div className="wz-zones">
        {[['A', data.wortA, zoneA], ['B', data.wortB, zoneB]].map(([z, label, zone]) => (
          <div key={z} className="wz-zone wz-zone--result">
            <div className="wz-zone-label">{label}</div>
            <div className="wz-zone-chips">
              {zone.map(w => {
                const correct = zuordnungMap[w] === z
                return (
                  <button
                    key={w}
                    className={`wz-chip wz-chip--${correct ? 'correct' : 'wrong'}${openBeleg === w ? ' wz-chip--beleg-active' : ''}`}
                    onClick={() => loadWZBeleg(w)}
                    title="Belege anzeigen"
                    aria-label={`${w} – Belege anzeigen`}
                    aria-pressed={openBeleg === w}
                  >
                    <span>{w}</span>
                    <span className="wz-chip-icon" aria-hidden="true">{correct ? '✓' : '✗'}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {openBeleg && (
        <BelegePanel
          lemma={activeLemma}
          collocate={openBeleg}
          data={belegeCache[openBeleg]}
          loading={belegeLoading}
        />
      )}

      <p className="wz-beleg-hint">Tippe auf eine Kollokation, um Beispielsätze aus dem Korpus zu sehen.</p>

      <div className="wz-result-banner">
        <span className="wz-result-medal">{medal.emoji}</span>
        <div>
          <p className="wz-result-score">{score} / 10 richtig</p>
          <p className="wz-result-label">{medal.label}</p>
        </div>
      </div>

      {wzHistory.length > 0 && (
        <div className="history-strip">
          <span className="history-label">Dein Verlauf · Wort-Zwilling</span>
          <div className="history-emojis" role="list" aria-label="Verlauf Wort-Zwilling">
            {wzHistory.map((h, i) => (
              <span key={i} role="listitem" className="history-emoji"
                    title={`${h.date}: ${h.medal}`} aria-label={`${h.date}: ${h.medal}`}>
                {h.emoji}
              </span>
            ))}
          </div>
        </div>
      )}

      <button className="btn-primary btn-full" onClick={onBack}>
        Zur Startseite
      </button>
    </div>
  )
}
