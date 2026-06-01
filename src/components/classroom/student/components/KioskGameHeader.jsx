// Geteilter Spielscreen-Header für die Kiosk-Mini-Spiele.
//
// Spiegelt 1:1 den Header des echten Spiels (Quiz.jsx / quiz.css):
// Badge → Headword (Lemma) → IPA → Aufgabentext, zentriert. Damit sehen
// alle vier Klassenraum-Spielscreens aus wie das normale Spiel.

export default function KioskGameHeader({ badge, lemma = null, ipa = null, instruction = null, instructionId }) {
  return (
    <header className="quiz-header">
      <span className="quiz-game-badge">{badge}</span>
      {lemma ? <h1 className="quiz-lemma-word">{lemma}</h1> : null}
      {ipa ? <p className="quiz-instruction" style={{ fontStyle: 'italic' }}>[{ipa}]</p> : null}
      {instruction ? (
        <p id={instructionId} className="quiz-instruction">{instruction}</p>
      ) : null}
    </header>
  )
}
