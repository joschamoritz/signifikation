// ① Anleitung — Unterseite „So funktioniert der Klassenraum".
//
// Öffnet wie ein Modus-Klick (Vollbild-Takeover mit Zurück-Pfeil + Titel),
// kein Bottom-Sheet. Inhalt: kurze Einführung + 3-Schritt-Ablauf als
// Wörterbuch-Einträge + Datenschutz-Hinweis.

import ClassroomSubScreen from '../components/ClassroomSubScreen'

const STEPS_DATA = [
  {
    title: 'Session anlegen',
    text: 'Wähle einen Spielmodus und 1–3 Lemmata. Optional mehrere Modi nacheinander.',
  },
  {
    title: 'Code teilen',
    text: 'Die Schüler öffnen signifikation.de und tippen den Beitrittscode ein — oder scannen den QR-Code.',
  },
  {
    title: 'Spielen & auswerten',
    text: 'Du startest die Runde, alle spielen synchron, und du siehst die Auswertung live.',
  },
]

export default function HowToStep() {
  return (
    <ClassroomSubScreen
      testId="cr2-howto"
      title="Anleitung"
      label="Klassenraum"
      lead="So läuft eine Live-Stunde."
    >
      <p className="cr2-subscreen__intro">
        Der Klassenraum macht aus dem täglichen Wortspiel eine gemeinsame
        Live-Stunde: Du steuerst von vorn, die Klasse spielt gleichzeitig auf
        den eigenen Geräten — anonym, ohne Anmeldung.
      </p>

      <ol className="cr2-steps" aria-label="Ablauf in drei Schritten">
        {STEPS_DATA.map((s, i) => (
          <li className="cr2-step" key={i}>
            <span className="cr2-step__num" aria-hidden="true">{i + 1}</span>
            <div className="cr2-step__body">
              <h2 className="cr2-step__title">{s.title}</h2>
              <p className="cr2-step__text">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="cr2-subscreen__note">
        Nach der Stunde werden die Spitznamen der Schüler automatisch
        anonymisiert — es bleibt nichts Persönliches gespeichert.
      </p>
    </ClassroomSubScreen>
  )
}
