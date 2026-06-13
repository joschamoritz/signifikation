// Classroom-Kollokationen — Adapter um die ECHTE Spiel-Engine (Quiz.jsx).
//
// W4-S4: Nutzt jetzt die echte Quiz-Komponente (mode="classroom") statt einer
// Mini-Variante. Unterschiede: kein Joker, keine Belege, kein Sofort-Feedback
// (server-autoritativ; Joker/Feedback braeuchten die Loesung `rang`). Genau ein
// onSubmit({ selected: [...] }) nach Auswahl der 3 staerksten Kollokationen.
//
// Server-Whitelist: prompt = { words:[strings], definition } (kein rang) →
// lemma.runden.kollokatoren = words.map(w => ({ wort: w })). Reload-Persistenz
// (7.2) via Draft + onProgress/initialSelected.

import { useMemo } from 'react'
import Quiz from '../../../Quiz'
import { readDraft, writeDraft } from '../hooks/useAnswerDraft'

export default function ClassroomGameKollokationen({ lemma, prompt, onSubmit, draftKey = null }) {
  const words = useMemo(() => Array.isArray(prompt?.words) ? prompt.words : [], [prompt])
  const key = draftKey ? `${draftKey}::0` : null

  const quizLemma = useMemo(() => ({
    lemma: lemma?.lemma || '',
    ipa:   lemma?.ipa || '',
    // Im Klassenraum ohne `rang` (die Loesung) — nur die Woerter.
    runden: { kollokatoren: words.map((w) => ({ wort: w })) },
  }), [lemma, words])

  const draft = key ? readDraft(key) : null
  const initialSelected = Array.isArray(draft) ? draft : (Array.isArray(draft?.selected) ? draft.selected : null)

  return (
    <div data-testid="classroom-kiosk-game-kollokationen">
      <Quiz
        lemma={quizLemma}
        currentRound={0}
        onRoundComplete={() => {}}
        onBack={() => {}}
        mode="classroom"
        onSubmit={onSubmit}
        onProgress={key ? (sel) => writeDraft(key, sel) : undefined}
        initialSelected={initialSelected}
        disableProgress
        hideHeader={false}
      />
    </div>
  )
}
