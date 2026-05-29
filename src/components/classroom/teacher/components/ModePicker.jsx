// T-4.4 — Modus-Picker (Setup Schritt A).
//
// 4 Karten, single-select (D2). Aktive Karte bekommt Gold-Border.
// Bewusst keine Icons — Wörterbuch-Stil arbeitet mit Typografie.

const MODES = [
  {
    id: 'kollokationen',
    label: 'Kollokationen',
    pos: 'Spielmodus',
    desc: 'Häufige Begleitwörter zu einem Lemma — Klassiker fürs Sprachgefühl.',
  },
  {
    id: 'wortzwilling',
    label: 'Wort-Zwilling',
    pos: 'Spielmodus',
    desc: 'Zwei Wörter, eine Kollokationsfamilie. Was passt zu beiden?',
  },
  {
    id: 'zeitenwende',
    label: 'Zeitenwende',
    pos: 'Spielmodus',
    desc: 'Ein Wort in unterschiedlichen Epochen — Bedeutung im Wandel.',
  },
  {
    id: 'lueckenfueller',
    label: 'Lückenfüller',
    pos: 'Spielmodus',
    desc: 'Eine Lücke im Satz, eine zielgenaue Lösung — schneller Drill.',
  },
]

export default function ModePicker({ value, onChange }) {
  return (
    <ul className="cr2-mode-picker" role="radiogroup" aria-label="Spielmodus wählen">
      {MODES.map((m) => {
        const active = m.id === value
        return (
          <li key={m.id}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              className={`cr2-card cr2-mode-card${active ? ' cr2-card--active' : ''}`}
              onClick={() => onChange(m.id)}
              data-testid={`cr2-mode-${m.id}`}
            >
              <div className="cr2-card__row">
                <h3 className="cr2-card__title">{m.label}</h3>
                <span className="cr2-card__badge">{m.pos}</span>
              </div>
              <p className="cr2-mode-card__desc">{m.desc}</p>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
