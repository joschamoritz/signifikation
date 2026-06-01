// T-4.4 — Modus-Picker (Setup Schritt A).
//
// Einspaltige Wörterbuch-Einträge (Headword + IPA + Definition), single-select
// (D2). Hover + Auswahl im dezenten Rot mit rotem Linksakzent — wie die
// Optionen im Kollokationen-Spiel. Keine Icons (Typografie statt Symbole).

const MODES = [
  {
    id: 'kollokationen',
    label: 'Kollokationen',
    ipa: '[kɔlokaˈtsi̯oːnən]',
    cat: 'Lexik',
    desc: 'Häufige Begleitwörter zu einem Lemma — Klassiker fürs Sprachgefühl.',
  },
  {
    id: 'wortzwilling',
    label: 'Wort-Zwilling',
    ipa: '[ˈvɔʁtˌtsvɪlɪŋ]',
    cat: 'Komparativ',
    desc: 'Zwei Wörter, eine Kollokationsfamilie. Was passt zu beiden?',
  },
  {
    id: 'zeitenwende',
    label: 'Zeitenwende',
    ipa: '[ˈtsaɪ̯tənˌvɛndə]',
    cat: 'Diachron',
    desc: 'Ein Wort in unterschiedlichen Epochen — Bedeutung im Wandel.',
  },
  {
    id: 'lueckenfueller',
    label: 'Lückenfüller',
    ipa: '[ˈlʏkənˌfʏlɐ]',
    cat: 'Konstruktiv',
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
              <span className="cr2-mode-card__head">
                <span className="cr2-mode-card__name">{m.label}</span>
                <span className="cr2-mode-card__ipa">{m.ipa}</span>
                <span className="cr2-mode-card__cat">{m.cat}</span>
              </span>
              <span className="cr2-mode-card__desc">{m.desc}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
