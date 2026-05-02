import TabHeader from './TabHeader'

function PlaceholderScreen({ title, ipa, category, isPremium = true, definition, features, footer, children }) {
  const dropcap = title[0]
  const rest = title.slice(1)
  return (
    <div className="tab-placeholder">
      <TabHeader />
      <div className="tab-placeholder-inner">
        <div className="tab-placeholder-head">
          <span className="test-dropcap-k" aria-hidden="true">{dropcap}</span>
          <h2 className="tab-placeholder-title" aria-label={title}>{rest}</h2>
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
