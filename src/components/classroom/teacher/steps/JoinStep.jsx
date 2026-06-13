// ③ Beitritt — Unterseite „So treten Schüler bei".
//
// Öffnet wie ein Modus-Klick (Vollbild-Takeover), kein Bottom-Sheet.
// Inhalt: Einführung + Beitrittswege als Wörterbuch-Einträge.

import ClassroomSubScreen from '../components/ClassroomSubScreen'

const STEPS_DATA = [
  {
    title: 'Code eintippen',
    text: 'Die Klasse öffnet signifikation.de, geht auf Klassenraum und gibt den Beitrittscode ein.',
  },
  {
    title: 'Oder QR scannen',
    text: 'Mit der Handykamera den QR-Code aus der Lobby scannen — der Link öffnet den Beitritt direkt.',
  },
  {
    title: 'Spitznamen wählen',
    text: 'Jede:r tippt einen kurzen Namen ein. Ein echter Name ist nicht nötig.',
  },
]

export default function JoinStep() {
  return (
    <ClassroomSubScreen
      testId="classroom-join"
      title="Beitritt"
      label="Zugang"
      lead="So kommt die Klasse in deine Session."
    >
      <p className="classroom-subscreen__intro">
        Sobald du eine Session öffnest, zeigt die Lobby einen Beitrittscode und
        einen QR-Code. Beide führen zum selben Ziel — ohne Konto, direkt im
        Browser.
      </p>

      <ol className="classroom-steps" aria-label="Beitrittswege">
        {STEPS_DATA.map((s, i) => (
          <li className="classroom-step" key={i}>
            <span className="classroom-step__num" aria-hidden="true">{i + 1}</span>
            <div className="classroom-step__body">
              <h2 className="classroom-step__title">{s.title}</h2>
              <p className="classroom-step__text">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="classroom-subscreen__note">
        In der Lobby siehst du, wer beigetreten ist — und startest die Runde,
        wenn alle da sind.
      </p>
    </ClassroomSubScreen>
  )
}
