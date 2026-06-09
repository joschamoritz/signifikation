// Spielmodi-Eintrag im Wörterbuch-Stil. Wird für die drei weiteren Modi
// (Wort-Zwilling, Zeitenwende, Lückenfüller) wiederverwendet. Der erste
// Eintrag "Kollokationen" in Home.jsx bleibt eigenständig, weil er
// Drop-Cap-Initial und Multi-Lemma-Liste hat.
//
// Seit dem Premium-Umbau sind alle vier Modi dauerhaft frei spielbar – die
// frühere Gesamtausgabe-/Heute-kostenlos-Sperre an dieser Stelle ist entfallen.

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
}) {
  const liClassName = `test-entry${!available ? ' test-entry--disabled' : ''}${played ? ' test-entry--done' : ''}`

  return (
    <li className={liClassName}>
      <div className="test-entry-number" aria-hidden="true">
        <span className="test-entry-num-glyph">{glyph}</span>
        <span className="test-entry-marginalia">{marginalia}</span>
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
          {available ? (
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
