export default function ClassroomSnapNav({ isTeacher, activeCard, onSelect }) {
  const items = isTeacher
    ? [['①', 'Klassenraum'], ['②', 'Sitzung'], ['③', 'Live'], ['④', 'Protokoll']]
    : [['①', 'Klassenraum'], ['②', 'Beitritt'], ['③', 'Abgaben']]

  return (
    <nav className="snap-nav" aria-label="Klassenraum-Navigation">
      <div className="snap-nav-games">
        {items.map(([glyph, label], index) => (
          <button
            key={index}
            className={`snap-nav-btn${activeCard === index ? ' snap-nav-btn--active' : ''}`}
            aria-label={label}
            aria-current={activeCard === index ? 'true' : undefined}
            onClick={() => onSelect(index)}
          >{glyph}</button>
        ))}
      </div>
    </nav>
  )
}
