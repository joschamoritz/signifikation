import {
  WEEKDAYS,
  MONTHS,
  localDateStr,
  computeStreak,
} from '../utils/homeUtils'

export default function TabHeader({ extraRight = null }) {
  const streak = computeStreak()
  const today = new Date()
  const dateStr = localDateStr(today)

  return (
    <header className="test-title-section" role="banner">
      <p className="test-overline">Tägliches Wortspiel · Linguistik</p>
      <h1 className="test-title">Signifikation</h1>
      <p className="test-subtitle">
        <time dateTime={dateStr}>
          {`${WEEKDAYS[today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`}
        </time>
      </p>
      <div className="test-title-right">
        {extraRight}
        {streak > 0 && (
          <span className="test-title-streak" aria-label={`${streak} Tage Streak`}>
            🔥 {streak}
          </span>
        )}
      </div>
    </header>
  )
}
