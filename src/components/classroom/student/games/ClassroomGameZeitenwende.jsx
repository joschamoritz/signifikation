// Classroom-Zeitenwende — Adapter um die ECHTE Spiel-Engine (Zeitenwende.jsx).
//
// W4-S4: Statt einer eigenen Mini-Variante (einfache Buttons) nutzt der
// Klassenraum jetzt dieselbe Tinder-Swipe-Engine + Karten-Optik wie das
// Hauptspiel. Unterschiede laufen über mode="classroom" in Zeitenwende.jsx:
//   - kein lokales Scoring/Feedback/Belege (Server-autoritativ, Auflösung
//     erst durch die Lehrkraft),
//   - genau ein onSubmit({ answers: ['pre'|'post', …] }) nach dem letzten Wort.
//
// Die Server-Whitelist liefert nur Wort-Strings (keine `periode`) → wir mappen
// prompt.words → [{ wort }]. Reload-Persistenz (7.2) via Draft + onProgress.

import { useMemo } from 'react'
import Zeitenwende from '../../../Zeitenwende'
import { readDraft, writeDraft } from '../hooks/useAnswerDraft'

export default function ClassroomGameZeitenwende({ lemma, prompt, onSubmit, draftKey = null }) {
  const words = useMemo(() => Array.isArray(prompt?.words) ? prompt.words : [], [prompt])
  const key = draftKey ? `${draftKey}::0` : null

  const data = useMemo(() => ({
    lemma: lemma?.lemma || '',
    ipa:   lemma?.ipa || '',
    // Im Klassenraum gibt es KEINE periode (würde die Lösung verraten).
    words: words.map((w) => ({ wort: w })),
  }), [lemma, words])

  // Gespeicherten Entwurf (Reload) als initialProgress einspeisen.
  const draft = key ? readDraft(key) : null
  const draftAnswers = draft && Array.isArray(draft.answers) ? draft.answers : null
  const initialProgress = (draftAnswers && draftAnswers.length < words.length)
    ? { round: draftAnswers.length, answers: draftAnswers }
    : null

  return (
    <div data-testid="cr2-kiosk-game-zeitenwende">
      <Zeitenwende
        data={data}
        mode="classroom"
        onSubmit={onSubmit}
        onProgress={key ? (p) => writeDraft(key, p) : undefined}
        initialProgress={initialProgress}
        onBack={() => {}}
        hideHeader={false}
        disableProgress={false}
      />
    </div>
  )
}
