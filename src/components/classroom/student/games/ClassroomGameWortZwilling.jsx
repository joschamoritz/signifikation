// Classroom-Wort-Zwilling — Adapter um die ECHTE Spiel-Engine (WortZwilling.jsx).
//
// W4-S4: Statt der vereinfachten Tap-Variante nutzt der Klassenraum jetzt das
// echte Drag-and-Drop (dnd-kit) des Hauptspiels — identischer Look & Feel.
// Unterschiede laufen über mode="classroom" in WortZwilling.jsx:
//   - kein Joker, kein lokales Scoring/Feedback (Server-autoritativ; Joker und
//     Bewertung bräuchten die Lösung `zuordnung`, die der Server nicht schickt),
//   - genau ein onSubmit({ zoneA, zoneB }) nach dem Zuordnen aller Wörter.
//
// Server-Whitelist: prompt = { wortA, wortB, words:[strings] } (keine zuordnung)
// → kollokatoren = words.map(w => ({ wort: w })). Reload-Persistenz (7.2) via
// Draft + onProgress/initialZones.

import { useMemo } from 'react'
import WortZwilling from '../../../WortZwilling'
import { readDraft, writeDraft } from '../hooks/useAnswerDraft'

export default function ClassroomGameWortZwilling({ prompt, onSubmit, draftKey = null }) {
  const words = useMemo(() => Array.isArray(prompt?.words) ? prompt.words : [], [prompt])
  const key = draftKey ? `${draftKey}::0` : null

  const data = useMemo(() => ({
    wortA: prompt?.wortA || '',
    wortB: prompt?.wortB || '',
    pos:   '',
    // Im Klassenraum ohne `zuordnung` (die Lösung) — nur die Wörter.
    kollokatoren: words.map((w) => ({ wort: w })),
  }), [prompt, words])

  const draft = key ? readDraft(key) : null
  const initialZones = (draft && (Array.isArray(draft.zoneA) || Array.isArray(draft.zoneB)))
    ? { zoneA: draft.zoneA || [], zoneB: draft.zoneB || [] }
    : null

  return (
    <div data-testid="classroom-kiosk-game-wortzwilling">
      <WortZwilling
        data={data}
        mode="classroom"
        onSubmit={onSubmit}
        onProgress={key ? (p) => writeDraft(key, p) : undefined}
        initialZones={initialZones}
        onBack={() => {}}
        hideHeader={false}
        disableProgress
      />
    </div>
  )
}
