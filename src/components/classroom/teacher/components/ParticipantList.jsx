// T-4.5 / T-4.6 — Teilnehmer-Liste in Lobby und Live-Step.
//
// Lobby: Status-Dot pulsiert wenn connected. Live: Dot wird gefuellt sobald
// abgegeben wurde, „abwesend" kursiv nach connected=false (Server sendet
// student:left mit Grund nach 60s laut Phase 3).
//
// Wir akzeptieren NICHT die Live-Einzelantworten (D7) — nur Identitaet +
// Online-Status + grobe Progress-Markierung.

const STATUS_TEXT = {
  joined:    'beigetreten',
  connected: 'verbunden',
  away:      'abwesend',
  submitted: 'abgegeben',
  left:      'verlassen',
}

function statusFor(p, mode = 'lobby') {
  if (p.leftAt) return 'left'
  if (mode === 'live' && p.submitted) return 'submitted'
  if (mode === 'live' && !p.connected) return 'away'
  if (p.connected) return 'connected'
  return 'joined'
}

export default function ParticipantList({
  participants = [],
  mode = 'lobby',
  showNames = true,
  emptyLabel = 'Noch niemand beigetreten.',
}) {
  if (!participants.length) {
    return (
      <p className="cr2-loading" data-testid="cr2-participants-empty">{emptyLabel}</p>
    )
  }

  return (
    <ul className="cr2-participant-list" aria-label="Teilnehmer">
      {participants.map((p, i) => {
        const status = statusFor(p, mode)
        return (
          <li key={p.id} className="cr2-participant" data-status={status}>
            <span className={`cr2-participant__dot cr2-participant__dot--${status}`} aria-hidden="true" />
            <span className="cr2-participant__name">
              {showNames ? (p.displayName || `Schüler:in ${i + 1}`)
                         : <em style={{ color: 'var(--cr2-muted)' }}>Schüler:in {i + 1}</em>}
            </span>
            <span className="cr2-participant__status">{STATUS_TEXT[status]}</span>
          </li>
        )
      })}
    </ul>
  )
}
