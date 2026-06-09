/**
 * server/classroom/scoring/index.js
 *
 * Duenner Server-Dispatcher fuer serverautoritatives Scoring (D13/R6).
 * Die eigentlichen Bewertungsregeln liegen seit Code-Review P6 framework-frei
 * in shared/scoring.js — derselben Single Source, die der Frontend-Singleplayer
 * (src/utils/gameLogic.js) ueber den Vite-Alias '@shared' nutzt. Hier bleibt nur
 * der Mode-Dispatch + das Re-Export der reinen Funktionen (die modes/<mode>.js
 * weiterhin von hier importieren).
 *
 * Hinweis: Der primaere Laufzeit-Dispatch laeuft ueber die Modus-Registry
 * (server/classroom/modes/index.js → scoreSubmission). Dieser scoreSubmission
 * bleibt fuer die direkte Scoring-Abdeckung (classroom.scoring.test.js).
 */

import {
  scoreKollokationen,
  scoreWortzwilling,
  scoreZeitenwende,
  scoreLueckenfueller,
} from '../../../shared/scoring.js'

export {
  scoreKollokationen,
  scoreWortzwilling,
  scoreZeitenwende,
  scoreLueckenfueller,
}

// ── Dispatcher ───────────────────────────────────────────────────────
//   mode             – 'kollokationen' | 'wortzwilling' | 'zeitenwende' | 'lueckenfueller'
//   contentSnapshot  – das beim addAssignment eingefrorene JSON-Objekt (per lemma_id)
//   rawAnswer        – das vom Client gelieferte JSON (NIEMALS score)
//   roundIndex       – nur fuer lueckenfueller relevant (Index in rounds)
export function scoreSubmission({ mode, contentSnapshot, rawAnswer, roundIndex = 0 }) {
  switch (mode) {
    case 'kollokationen':
      return scoreKollokationen(contentSnapshot, rawAnswer)
    case 'wortzwilling':
      return scoreWortzwilling(contentSnapshot, rawAnswer)
    case 'zeitenwende':
      return scoreZeitenwende(contentSnapshot, rawAnswer)
    case 'lueckenfueller': {
      const rounds = Array.isArray(contentSnapshot?.rounds) ? contentSnapshot.rounds : []
      const round = rounds[roundIndex]
      return scoreLueckenfueller(round, rawAnswer)
    }
    default:
      throw new Error(`scoreSubmission: unbekannter Modus "${mode}"`)
  }
}
