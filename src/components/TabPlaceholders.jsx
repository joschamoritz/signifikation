import {
  WEEKDAYS, MONTHS,
  localDateStr, computeStreak,
} from '../utils/homeUtils'

function TabHeader() {
  const streak  = computeStreak()
  const today   = new Date()
  const dateStr = localDateStr(today)
  return (
    <>
      <header className="test-title-section" role="banner">
        <p className="test-overline">Tägliches Wortspiel · Linguistik</p>
        <h1 className="test-title">Signifikation</h1>
        <p className="test-subtitle">
          <time dateTime={dateStr}>
            {`${WEEKDAYS[today.getDay()]}, ${today.getDate()}. ${MONTHS[today.getMonth()]} ${today.getFullYear()}`}
          </time>
        </p>
        {streak > 0 && (
          <span className="test-title-streak" aria-label={`${streak} Tage Streak`}>
            🔥 {streak}
          </span>
        )}
      </header>
    </>
  )
}

function PlaceholderScreen({ title, ipa, category, isPremium = true, definition, features, footer, children }) {
  return (
    <div className="tab-placeholder">
      <TabHeader />
      <div className="tab-placeholder-inner">
        <div className="tab-placeholder-head">
          <h2 className="tab-placeholder-title">{title}</h2>
          <span className="tab-placeholder-ipa">{ipa}</span>
        </div>
        <div className="tab-placeholder-grammar">
          <span className="tab-placeholder-pos">Bereich</span>
          <span className="tab-placeholder-rule-line" />
          <span className="tab-placeholder-category">{category}</span>
          {isPremium && <span className="test-entry-premium">Gesamtausgabe</span>}
        </div>
        <p className="tab-placeholder-definition">{definition}</p>
        {children}
        <ul className="tab-placeholder-features">
          {features.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-status">In Entwicklung.</span>
          <span className="tab-placeholder-edition">{footer ?? 'Erscheint in einer späteren Auflage.'}</span>
        </div>
      </div>
    </div>
  )
}

export { PlaceholderScreen }
