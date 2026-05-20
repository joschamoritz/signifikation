// Spielmodi-Eintrag im Wörterbuch-Stil. Wird für die drei Premium-Modi
// (Wort-Zwilling, Zeitenwende, Lückenfüller) wiederverwendet. Der erste
// Eintrag "Kollokationen" in Home.jsx bleibt eigenständig, weil er
// Drop-Cap-Initial und Multi-Lemma-Liste hat.

function LockIcon() {
  return (
    <svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', marginBottom: '1px' }}>
      <rect x="0.5" y="4.5" width="8" height="6" rx="1" />
      <path d="M2.5 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default function GameEntry({
  glyph,                // "②" / "③" / "④"
  marginalia,           // "KOMPAR." / "DIACH." / "KONSTR."
  category,             // "komparativ" / "diachron" / "konstruktiv"
  headword,             // "Wort-Zwilling" / ...
  ipa,                  // "[ˈvɔʁtˌtsvɪlɪŋ]"
  ipaAriaLabel,         // "Aussprache: [...]"
  definition,           // Definitionstext
  available,            // boolean: Spiel heute verfügbar?
  played,               // played-Objekt mit { medal?.emoji, total } oder null
  playedLabel,          // String für die played-list-Zeile (z. B. "Schwester / Bruder")
  errorState,           // boolean: Lade-/Verbindungsfehler
  onRetry,              // Callback für Retry-Button (optional)
  onPlay,               // Callback für CTA "Starten / Ergebnis ansehen"
  statusText,           // Status-Text unten links
  ctaText,              // Text für den Spiel-CTA, z. B. "Wort-Zwilling starten"
  ctaAriaLabel,         // ARIA-Label für den CTA
  gesamtausgabe,        // boolean: User hat Gesamtausgabe?
  freeAccessToday,      // boolean: heute kostenlos?
  onUnlockGesamtausgabe,
}) {
  const liClassName = `test-entry${!available ? ' test-entry--disabled' : ''}${played ? ' test-entry--done' : ''}`
  const premiumLabel = freeAccessToday ? '✦ Heute kostenlos' : 'Gesamtausgabe'
  const premiumAria  = freeAccessToday ? 'Heute kostenlos' : 'Teil der Gesamtausgabe'

  return (
    <li className={liClassName}>
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">{glyph}</span>
        <span className="test-entry-marginalia">{marginalia}</span>
        <span
          className={`test-entry-premium${freeAccessToday ? ' test-entry-premium--free' : ''}`}
          aria-label={premiumAria}
        >
          {premiumLabel}
        </span>
      </div>
      <div className="test-entry-body">
        <div className="test-entry-head">
          <h2 className="test-headword">{headword}</h2>
          <span className="test-ipa" aria-label={ipaAriaLabel}>{ipa}</span>
        </div>
        <div className="test-entry-grammar" aria-hidden="true">
          <span className="test-pos">Wortspiel</span>
          <span className="test-pos-rule" />
          <span className="test-entry-category">{category}</span>
        </div>
        <p className="test-definition">{definition}</p>

        {played && playedLabel && (
          <ul className="test-played-list">
            <li className="test-played-entry">
              <span className="test-played-word">{played.medal?.emoji ?? ''} {playedLabel}</span>
              <span className="test-played-score">{played.total}/10</span>
            </li>
          </ul>
        )}

        {errorState && onRetry && (
          <p className="test-game-error">
            Verbindungsfehler.{' '}
            <button className="test-game-error-retry" type="button" onClick={onRetry}>
              Erneut versuchen
            </button>
          </p>
        )}

        <div className="test-entry-footer">
          <span className={`test-status${played ? ' test-status--done' : ''}`}>{statusText}</span>
          {!gesamtausgabe ? (
            <button
              className="test-cta test-cta--locked"
              type="button"
              onClick={onUnlockGesamtausgabe}
              aria-label="Gesamtausgabe freischalten"
            >
              <LockIcon /> Gesamtausgabe freischalten
            </button>
          ) : available ? (
            <button
              className="test-cta"
              type="button"
              onClick={onPlay}
              aria-label={ctaAriaLabel}
            >
              {ctaText}
              <span className="test-cta-arrow" aria-hidden="true"> →</span>
            </button>
          ) : (
            <span className="test-cta test-cta--disabled" aria-hidden="true">—</span>
          )}
        </div>
      </div>
    </li>
  )
}
