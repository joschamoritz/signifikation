// T-4.4 — Modus-Picker (Setup Schritt A).
//
// Progressive Disclosure (P1 „SETUP entzerren“): vor der Wahl kompakte
// Auswahl-Zeilen (Headword + IPA + Kategorie, einzeilig); nach der Wahl klappt
// der Picker auf die gewählte Zeile zusammen — mit Beschreibung als Bestätigung
// — plus „Anderer Modus“-Toggle. So kostet die Modus-Sektion im Arbeitszustand
// ~120px statt ~650px (4 dauerhaft aufgeklappte Beschreibungs-Karten).
//
// Einspaltige Wörterbuch-Einträge, single-select (D2). Hover + Auswahl im
// dezenten Rot mit rotem Linksakzent — wie die Optionen im Kollokationen-Spiel.

import { useState } from 'react'

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

function ModeHead({ mode }) {
  return (
    <span className="classroom-mode-card__head">
      <span className="classroom-mode-card__name">{mode.label}</span>
      <span className="classroom-mode-card__ipa">{mode.ipa}</span>
      <span className="classroom-mode-card__cat">{mode.cat}</span>
    </span>
  )
}

export default function ModePicker({ value, onChange }) {
  // Nach der Wahl eingeklappt; „Anderer Modus“ öffnet die volle Liste erneut.
  const [expanded, setExpanded] = useState(false)
  const selected = MODES.find((m) => m.id === value) || null
  const collapsed = !!selected && !expanded

  // ── Eingeklappt: nur die gewählte Modus-Zeile (kompakt) + Ändern-Toggle ──
  if (collapsed) {
    return (
      <div className="classroom-mode-picker classroom-mode-picker--chosen">
        <div className="classroom-card classroom-mode-card classroom-mode-card--compact classroom-mode-card--chosen classroom-card--active">
          <ModeHead mode={selected} />
        </div>
        <button
          type="button"
          className="classroom-mode-change"
          onClick={() => setExpanded(true)}
          data-testid="classroom-mode-change"
        >
          Anderer Modus <span aria-hidden="true">▾</span>
        </button>
      </div>
    )
  }

  // ── Aufgeklappt: kompakte Auswahl-Zeilen (einzeilig, ohne Dauer-Beschreibung) ──
  return (
    <ul className="classroom-mode-picker classroom-mode-picker--expanded" role="radiogroup" aria-label="Spielmodus wählen">
      {MODES.map((m) => {
        const active = m.id === value
        return (
          <li key={m.id}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              className={`classroom-card classroom-mode-card classroom-mode-card--compact${active ? ' classroom-card--active' : ''}`}
              onClick={() => { onChange(m.id); setExpanded(false) }}
              data-testid={`classroom-mode-${m.id}`}
            >
              <ModeHead mode={m} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
