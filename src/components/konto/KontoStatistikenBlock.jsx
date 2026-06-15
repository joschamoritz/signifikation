import { useMemo } from 'react'
import { computeStreak, localDateStr, readLocalPlayedDates } from '../../utils/homeUtils'
import { useAccountStats } from '../../hooks/useAccountStats'

const SPIELE_INFO = [
  { key: 'kollokationen',  label: 'Kollokationen' },
  { key: 'wortzwilling',   label: 'Wort-Zwilling' },
  { key: 'zeitenwende',    label: 'Zeitenwende' },
  { key: 'lueckenfueller', label: 'Lückenfüller' },
]

function mergeDateSet(serverStats) {
  const dateSet = readLocalPlayedDates()
  if (serverStats) {
    for (const d of serverStats.playedDates || []) dateSet.add(d)
    for (const { key } of SPIELE_INFO) {
      for (const d of Object.keys(serverStats[key] || {})) dateSet.add(d)
    }
  }
  return dateSet
}

function buildHeatmapDays(dateSet) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = localDateStr(d)
    days.push({ dateStr, played: dateSet.has(dateStr) })
  }
  return days
}

function computeFavoriteMode(plays) {
  if (!plays) return null
  let bestLabel = null
  let bestCount = 0
  for (const { key, label } of SPIELE_INFO) {
    const c = plays[key] || 0
    if (c > bestCount) {
      bestLabel = label
      bestCount = c
    }
  }
  return bestLabel
}

function computeAccuracyPerMode(serverStats) {
  return SPIELE_INFO.map(({ key, label }) => {
    let score = 0
    let max = 0
    if (serverStats) {
      for (const v of Object.values(serverStats[key] || {})) {
        score += v.score || 0
        max += v.max || 0
      }
    }
    return {
      key,
      label,
      pct: max > 0 ? Math.round((score / max) * 100) : null,
      hasData: max > 0,
    }
  })
}

function computeBestDayThisMonth(serverStats) {
  if (!serverStats) return null
  const now = new Date()
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`

  const perDay = new Map()
  for (const { key } of SPIELE_INFO) {
    for (const [d, v] of Object.entries(serverStats[key] || {})) {
      if (!d.startsWith(prefix)) continue
      const acc = perDay.get(d) || { score: 0, max: 0 }
      acc.score += v.score || 0
      acc.max += v.max || 0
      perDay.set(d, acc)
    }
  }

  let best = null
  for (const [dateStr, v] of perDay.entries()) {
    if (v.max === 0) continue
    const pct = v.score / v.max
    if (!best || pct > best.pct || (pct === best.pct && dateStr > best.dateStr)) {
      best = { dateStr, pct }
    }
  }
  return best
}

function computeWeekDelta(serverStats, dateSet) {
  if (!serverStats) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  function rangeStats(offsetDays) {
    let playedDays = 0
    let score = 0
    let max = 0
    for (let i = 0; i < 7; i++) {
      const cursor = new Date(today)
      cursor.setDate(cursor.getDate() - (offsetDays + i))
      const ds = localDateStr(cursor)
      if (dateSet.has(ds)) playedDays += 1
      for (const { key } of SPIELE_INFO) {
        const v = (serverStats[key] || {})[ds]
        if (v) {
          score += v.score || 0
          max += v.max || 0
        }
      }
    }
    return { playedDays, accuracy: max > 0 ? score / max : null }
  }

  const cur = rangeStats(0)
  const prev = rangeStats(7)
  if (cur.playedDays === 0 && prev.playedDays === 0) return null

  const daysDiff = cur.playedDays - prev.playedDays
  const accDiff =
    cur.accuracy !== null && prev.accuracy !== null
      ? Math.round((cur.accuracy - prev.accuracy) * 100)
      : null
  return { daysDiff, accDiff }
}

function formatDayOfMonth(dateStr) {
  const day = parseInt(dateStr.slice(-2), 10)
  return `${day}.`
}

function Heatmap({ days }) {
  const played = days.filter((d) => d.played).length
  return (
    <div
      className="konto-heatmap-wrapper"
      role="img"
      aria-label={`Spielhistorie: ${played} ${played === 1 ? 'Tag' : 'Tage'} gespielt in den letzten 365 Tagen`}
    >
      <div className="konto-heatmap-grid">
        {days.map((day) => (
          <div
            key={day.dateStr}
            className={`konto-heatmap-cell${day.played ? ' konto-heatmap-cell--on' : ''}`}
            title={day.dateStr}
          />
        ))}
      </div>
      <div className="konto-heatmap-legend">
        <div className="konto-heatmap-cell" />
        <span>inaktiv</span>
        <div className="konto-heatmap-cell konto-heatmap-cell--on" />
        <span>aktiv</span>
      </div>
    </div>
  )
}

function AccuracyBars({ rows }) {
  if (!rows.some((r) => r.hasData)) {
    return (
      <p className="konto-empty">
        Spiele mit Account, um deine Trefferquote zu sehen.
      </p>
    )
  }
  return (
    <ul className="konto-bars" aria-label="Trefferquote pro Spielmodus">
      {rows.map((r) => (
        <li key={r.key} className="konto-bar-row">
          <span className="konto-bar-label">{r.label}</span>
          <div className="konto-bar-track" aria-hidden="true">
            {r.hasData && (
              <div className="konto-bar-fill" style={{ width: `${r.pct}%` }} />
            )}
          </div>
          <span className="konto-bar-value">{r.hasData ? `${r.pct} %` : '–'}</span>
        </li>
      ))}
    </ul>
  )
}

function WeekDelta({ delta }) {
  if (!delta) return null
  const parts = []
  if (delta.daysDiff !== 0) {
    const abs = Math.abs(delta.daysDiff)
    parts.push(`${delta.daysDiff > 0 ? '+' : '−'}${abs} ${abs === 1 ? 'Tag' : 'Tage'}`)
  }
  if (delta.accDiff !== null && delta.accDiff !== 0) {
    const abs = Math.abs(delta.accDiff)
    parts.push(`${delta.accDiff > 0 ? '+' : '−'}${abs} % Trefferquote`)
  }
  const text = parts.length > 0 ? parts.join(' · ') : 'wie in der Vorwoche'
  return (
    <p className="konto-trend">
      <span className="konto-trend-label">vs. Vorwoche</span>
      <span className="konto-trend-value">{text}</span>
    </p>
  )
}

export default function KontoStatistikenBlock() {
  const serverStats = useAccountStats()

  const dateSet      = useMemo(() => mergeDateSet(serverStats), [serverStats])
  const streak       = useMemo(() => computeStreak(dateSet), [dateSet])
  const heatmap      = useMemo(() => buildHeatmapDays(dateSet), [dateSet])
  const accuracyRows = useMemo(() => computeAccuracyPerMode(serverStats), [serverStats])
  const favorite     = useMemo(() => computeFavoriteMode(serverStats?.plays), [serverStats])
  const bestDay      = useMemo(() => computeBestDayThisMonth(serverStats), [serverStats])
  const weekDelta    = useMemo(() => computeWeekDelta(serverStats, dateSet), [serverStats, dateSet])

  const streakLabel = streak > 0 ? `🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` : '–'
  const favLabel    = favorite || '–'
  const bestLabel   = bestDay
    ? `${formatDayOfMonth(bestDay.dateStr)} · ${Math.round(bestDay.pct * 100)} %`
    : '–'

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
          <span className="test-pos">Verlauf</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">Spielhistorie</span>
        </div>
        <p className="test-definition">
          Deine Streak, deine Lieblingsspiele und der beste Tag dieses Monats.
        </p>

        <div className="konto-stats-content">
          <div className="konto-stats-grid konto-stats-grid--three">
            <div className="konto-stat-card">
              <span className="konto-stat-label">Aktueller Streak</span>
              <span className="konto-stat-value">{streakLabel}</span>
            </div>
            <div className="konto-stat-card">
              <span className="konto-stat-label">Lieblingsmodus</span>
              <span className="konto-stat-value">{favLabel}</span>
            </div>
            <div className="konto-stat-card">
              <span className="konto-stat-label">Bester Tag</span>
              <span className="konto-stat-value">{bestLabel}</span>
            </div>
          </div>

          <div className="konto-history-section">
            <h3 className="konto-section-title">Trefferquote pro Spiel</h3>
            <AccuracyBars rows={accuracyRows} />
            <WeekDelta delta={weekDelta} />
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
