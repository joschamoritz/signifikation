import { useMemo } from 'react'
import {
  computeStreak,
  computeLongestStreak,
  computePlayedDays,
  localDateStr,
  readLocalPlayedDates,
} from '../../utils/homeUtils'
import { getMedal } from '../../utils/gameLogic'
import { lsGet, lsParse } from '../../utils/storage'
import { useAccountStats } from '../../hooks/useAccountStats'

// Führt den lokalen Verlauf mit der serverseitigen Statistik zusammen.
// Eingeloggte Nutzer sehen so auch Spiele von anderen Geräten; der lokale
// Verlauf (z.B. von vor dem Login) bleibt erhalten. Server-Medaillen haben
// bei Überschneidung Vorrang.
function buildMergedData(serverStats) {
  const dateSet = readLocalPlayedDates()

  const medalMap = {}
  lsParse(lsGet('sig_koll_history'), []).forEach((h) => {
    if (h?.date && h?.medal) medalMap[h.date] = h.medal.toLowerCase()
  })

  if (serverStats) {
    for (const datum of serverStats.playedDates || []) dateSet.add(datum)
    for (const [datum, agg] of Object.entries(serverStats.kollokationen || {})) {
      dateSet.add(datum)
      medalMap[datum] = getMedal(agg.score, agg.max).label.toLowerCase()
    }
  }
  return { dateSet, medalMap }
}

function buildHeatmapData(dateSet, medalMap) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Über Kalendertage iterieren (setDate), nicht über Millisekunden –
  // sonst erzeugt der DST-Wechsel zwei Zellen mit demselben Datum.
  const days = []
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = localDateStr(d)
    const played = dateSet.has(dateStr)
    days.push({ dateStr, played, medal: played ? (medalMap[dateStr] || 'gespielt') : null })
  }
  return days
}

function Heatmap({ days }) {
  const played = days.filter(d => d.played).length
  const gold   = days.filter(d => d.medal === 'gold').length
  const label  = `Spielhistorie: ${played} ${played === 1 ? 'Tag' : 'Tage'} gespielt, davon ${gold} mit Gold-Medaille`
  return (
    <div className="konto-heatmap-wrapper" role="img" aria-label={label}>
      <div className="konto-heatmap-grid">
        {days.map(day => (
          <div
            key={day.dateStr}
            className={`konto-heatmap-cell${day.played ? ` konto-heatmap-cell--${day.medal}` : ''}`}
            title={day.dateStr}
          />
        ))}
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

export default function KontoStatistikenBlock() {
  const serverStats = useAccountStats()

  const { dateSet, medalMap } = useMemo(() => buildMergedData(serverStats), [serverStats])
  const streak     = useMemo(() => computeStreak(dateSet), [dateSet])
  const longest    = useMemo(() => computeLongestStreak(dateSet), [dateSet])
  const playedDays = useMemo(() => computePlayedDays(dateSet), [dateSet])
  const heatmap    = useMemo(() => buildHeatmapData(dateSet, medalMap), [dateSet, medalMap])
  const goldMedals = useMemo(
    () => Object.values(medalMap).filter(m => m === 'gold').length,
    [medalMap],
  )

  const streakLabel  = streak > 0  ? `🔥 ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` : '–'
  const longestLabel = longest > 0 ? `${longest} ${longest === 1 ? 'Tag' : 'Tage'}`  : '–'

  const goldLabel = goldMedals > 0 ? `🥇 ${goldMedals}` : '–'

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
              <span className="konto-stat-label">Gold-Medaillen</span>
              <span className="konto-stat-value">{goldLabel}</span>
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
