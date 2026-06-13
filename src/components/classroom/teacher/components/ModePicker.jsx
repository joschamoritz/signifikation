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
    desc: 'Welche Wörter treten am häufigsten gemeinsam auf? Bestimme die stärksten Kollokationen des Tages aus eigenen Korpusdaten.',
  },
  {
    id: 'wortzwilling',
    label: 'Wort-Zwilling',
    ipa: '[ˈvɔʁtˌtsvɪlɪŋ]',
    cat: 'Komparativ',
    desc: 'Zwei bedeutungsnahe Wörter — zwei unterschiedliche Kollokationsprofile. Ordne zehn Kollokationen dem richtigen Lemma zu.',
  },
  {
    id: 'zeitenwende',
    label: 'Zeitenwende',
    ipa: '[ˈtsaɪ̯tənˌvɛndə]',
    cat: 'Diachron',
    desc: 'Gehört dieses Wort eher in die Zeit vor oder nach der Jahrtausendwende? Entscheide für zehn Kollokationen eines Lemmas.',
  },
  {
    id: 'lueckenfueller',
    label: 'Lückenfüller',
    ipa: '[ˈlʏkənˌfʏlɐ]',
    cat: 'Konstruktiv',
    desc: 'Ein echter Korpussatz mit fehlender Kollokation — welches Wort gehört in die Lücke? Drei Runden, vier Optionen, zehn Punkte.',
  },
]

export default function ModePicker({ value, onChange }) {
  return (
    <ul className="classroom-mode-picker" role="radiogroup" aria-label="Spielmodus wählen">
      {MODES.map((m) => {
        const active = m.id === value
        return (
          <li key={m.id}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              className={`classroom-card classroom-mode-card${active ? ' classroom-card--active' : ''}`}
              onClick={() => onChange(m.id)}
              data-testid={`classroom-mode-${m.id}`}
            >
              <span className="classroom-mode-card__head">
                <span className="classroom-mode-card__name">{m.label}</span>
                <span className="classroom-mode-card__ipa">{m.ipa}</span>
                <span className="classroom-mode-card__cat">{m.cat}</span>
              </span>
              <span className="classroom-mode-card__desc">{m.desc}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
