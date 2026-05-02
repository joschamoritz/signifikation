import { useState, useEffect, useMemo } from 'react'
import { computeStreak, computeLongestStreak, computePlayedDays, localDateStr } from '../../utils/homeUtils'
import { lsGet, lsParse } from '../../utils/storage'

function buildHeatmapData() {
  const activity  = lsParse(lsGet('sig_activity'), [])
  const legacy    = lsParse(lsGet('sig_history'), []).map(h => h.date)
  const playedSet = new Set([...activity, ...legacy])

  const kollHistory = lsParse(lsGet('sig_koll_history'), [])
  const medalMap = {}
  kollHistory.forEach(h => { medalMap[h.date] = h.medal.toLowerCase() })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return Array.from({ length: 365 }, (_, i) => {
    const d = new Date(today - (364 - i) * 86_400_000)
    const dateStr = localDateStr(d)
    const played = playedSet.has(dateStr)
    return { dateStr, played, medal: played ? (medalMap[dateStr] || 'gespielt') : null }
  })
}

function Heatmap({ days }) {
  const firstDayOfWeek = (new Date(days[0].dateStr).getDay() + 6) % 7
  return (
    <div className="konto-heatmap-wrapper">
      <div className="konto-heatmap-scroll">
      <div className="konto-heatmap-grid">
        {Array.from({ length: firstDayOfWeek }, (_, i) => (
          <div key={`p${i}`} className="konto-heatmap-cell konto-heatmap-cell--pad" />
        ))}
        {days.map(day => (
          <div
            key={day.dateStr}
            className={`konto-heatmap-cell${day.played ? ` konto-heatmap-cell--${day.medal}` : ''}`}
            title={day.dateStr}
          />
        ))}
      </div>
      </div>
      <div className="konto-heatmap-legend">
        <div className="konto-heatmap-cell" />
        <span>kein Spiel</span>
        <div className="konto-heatmap-cell konto-heatmap-cell--gespielt" />
        <span>gespielt</span>
        <div className="konto-heatmap-cell konto-heatmap-cell--gold" />
        <span>Gold</span>
      </div>
    </div>
  )
}

export default function KontoStatistikenBlock({ isLoggedIn }) {
  const streak     = useMemo(() => computeStreak(), [])
  const longest    = useMemo(() => computeLongestStreak(), [])
  const playedDays = useMemo(() => computePlayedDays(), [])
  const heatmap    = useMemo(() => buildHeatmapData(), [])

  const [totalScore, setTotalScore]   = useState(null)
  const [scoreLoading, setScoreLoading] = useState(false)

  useEffect(() => {
    if (!isLoggedIn) return
    setScoreLoading(true)
    fetch('/api/v1/stats/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTotalScore(data.totalScore) })
      .catch(() => {})
      .finally(() => setScoreLoading(false))
  }, [isLoggedIn])

  const streakLabel  = streak > 0  ? `🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'}`   : '–'
  const longestLabel = longest > 0 ? `${longest} ${longest === 1 ? 'Tag' : 'Tage'}`    : '–'
  const scoreLabel   = !isLoggedIn ? '–' : scoreLoading ? '…' : totalScore !== null ? String(totalScore) : '–'

  return (
    <li className="test-entry">
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">③</span>
        <span className="test-entry-marginalia">STATS</span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">Statistiken</h2>
          <span className="test-ipa">[ʃtaˈtɪstɪkən]</span>
        </div>
        <div className="test-entry-grammar">
          <span className="test-pos">Bereich</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Spielhistorie</span>
        </div>
        <p className="test-definition">
          Deine Spielhistorie der letzten 365 Tage, Streak-Übersicht und Gesamtpunktestand.
        </p>

        <div className="konto-stats-content">
          <div className="konto-stats-grid">
            <div className="konto-stat-card">
              <span className="konto-stat-label">Aktueller Streak</span>
              <span className="konto-stat-value">{streakLabel}</span>
            </div>
            <div className="konto-stat-card">
              <span className="konto-stat-label">Längster Streak</span>
              <span className="konto-stat-value">{longestLabel}</span>
            </div>
            <div className="konto-stat-card">
              <span className="konto-stat-label">Gespielte Tage</span>
              <span className="konto-stat-value">{playedDays || '–'}</span>
            </div>
            <div className="konto-stat-card">
              <span className="konto-stat-label">Gesamtpunkte</span>
              <span className="konto-stat-value">{scoreLabel}</span>
            </div>
          </div>

          <div className="konto-history-section">
            <h3 className="konto-section-title">Spielhistorie (365 Tage)</h3>
            <Heatmap days={heatmap} />
          </div>
        </div>
      </div>
    </li>
  )
}
