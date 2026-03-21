import { useState } from 'react'
import './test.css'

/* ── Statische Demodaten ──────────────────────────────────── */
const HEUTE = {
  datum: '21. März 2026',
  woerter: ['Frühling', 'Wandel', 'Aufbruch'],
}

const EINTRAEGE = [
  {
    id: 1,
    numeral: '①',
    headword: 'Kollokationen',
    ipa: '[kɔlokaˈtsi̯oːnən]',
    pos: 'Wortspiel',
    kategorie: 'täglich',
    definition:
      'Finde die stärksten Kollokate zu den Wörtern des Tages. Welche Ausdrücke gehören wirklich zusammen?',
    status: 'unplayed',
    statusText: 'Noch nicht gespielt.',
    ctaText: 'Jetzt spielen',
    available: true,
    dropCap: true,
    marginalia: 'KOLLOKT.',
  },
  {
    id: 2,
    numeral: '②',
    headword: 'Zeitreise',
    ipa: '[ˈtsaɪ̯tˌʁaɪ̯zə]',
    pos: 'Wortspiel',
    kategorie: 'historisch',
    definition:
      'Entdecke, wie sich die Sprache über 500 Jahre verändert hat. Welche Kollokate waren üblich — damals, heute?',
    status: 'unavailable',
    statusText: 'Heute nicht verfügbar.',
    ctaText: null,
    available: false,
    dropCap: false,
    marginalia: 'HIST.',
  },
  {
    id: 3,
    numeral: '③',
    headword: 'Wort-Zwilling',
    ipa: '[ˈvɔʁtˌtsvɪlɪŋ]',
    pos: 'Wortspiel',
    kategorie: 'komparativ',
    definition:
      'Ordne zehn Kollokate den richtigen Zwillingswörtern zu. Zwei verwandte Wörter — aber welches Kollokat gehört wohin?',
    status: 'unplayed',
    statusText: 'Noch nicht gespielt.',
    ctaText: 'Jetzt spielen',
    available: true,
    dropCap: false,
    marginalia: 'KOMPAR.',
  },
  {
    id: 4,
    numeral: '④',
    headword: '???',
    ipa: '[ˈfʁaːɡəˌtsaɪ̯çən]',
    pos: 'Wortspiel',
    kategorie: 'in Arbeit',
    definition:
      'Ein neues Wortspiel befindet sich in Entwicklung. Bald mehr.',
    status: 'soon',
    statusText: 'Demnächst verfügbar.',
    ctaText: null,
    available: false,
    dropCap: false,
    marginalia: 'i.V.',
  },
]

/* ── Komponente ───────────────────────────────────────────── */
export default function TestPage() {
  const [footnoteOpen, setFootnoteOpen] = useState(false)

  return (
    <div className="test-page" lang="de">
      <div className="test-wrapper">

        {/* ── Titelseite ─────────────────────────────────── */}
        <header className="test-title-section" role="banner">
          <p className="test-overline">Tägliches Wortspiel · Experimentell</p>
          <h1 className="test-title">Signifikation</h1>
          <p className="test-subtitle">
            <time dateTime="2026-03-21">{HEUTE.datum}</time>
          </p>
        </header>

        {/* ── Laufzeile / Raster ─────────────────────────── */}
        <nav
          className="test-raster"
          aria-label="Wörter des Tages"
        >
          <span className="test-raster-label" aria-hidden="true">Wörter des Tages</span>
          <div className="test-raster-words">
            {HEUTE.woerter.map((w) => (
              <span key={w} className="test-raster-word">{w}</span>
            ))}
          </div>
          <span className="test-raster-folio" aria-hidden="true">Nr. 80 · 2026</span>
        </nav>

        {/* ── Doppellinie vor den Einträgen ──────────────── */}
        <div className="test-rule--double" role="separator" aria-hidden="true" />

        {/* ── Einträge ───────────────────────────────────── */}
        <p className="test-section-label" aria-hidden="true">Spielmodi</p>

        <main>
          <ol className="test-entries" aria-label="Spielmodi">
            {EINTRAEGE.map((entry) => (
              <li
                key={entry.id}
                className={`test-entry${!entry.available ? ' test-entry--disabled' : ''}${entry.dropCap ? ' test-drop-cap' : ''}`}
              >
                {/* Randnotiz mit Ziffer */}
                <div className="test-entry-number" aria-hidden="true">
                  <span className="test-entry-num-glyph">{entry.numeral}</span>
                  <span className="test-entry-marginalia">{entry.marginalia}</span>
                </div>

                {/* Eintrags-Inhalt */}
                <div className="test-entry-body">
                  {/* Stichwort + IPA */}
                  <div className="test-entry-head">
                    <h2 className="test-headword">{entry.headword}</h2>
                    <span className="test-ipa" aria-label={`Aussprache: ${entry.ipa}`}>
                      {entry.ipa}
                    </span>
                  </div>

                  {/* Grammatik-Zeile */}
                  <div className="test-entry-grammar" aria-hidden="true">
                    <span className="test-pos">{entry.pos}</span>
                    <span className="test-pos-rule" />
                    <span className="test-entry-category">{entry.kategorie}</span>
                  </div>

                  {/* Definition */}
                  <p className="test-definition">{entry.definition}</p>

                  {/* Status & CTA */}
                  <div className="test-entry-footer">
                    <span
                      className={`test-status${entry.status === 'done' ? ' test-status--done' : ''}`}
                    >
                      {entry.statusText}
                    </span>

                    {entry.ctaText ? (
                      <button
                        className="test-cta"
                        type="button"
                        aria-label={`${entry.ctaText}: ${entry.headword}`}
                      >
                        {entry.ctaText}
                        <span className="test-cta-arrow" aria-hidden="true"> →</span>
                      </button>
                    ) : (
                      <span className="test-cta test-cta--disabled" aria-hidden="true">
                        —
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </main>

        {/* ── Fußnote: Was ist eine Kollokation? ─────────── */}
        <section
          className="test-footnote"
          aria-label="Anmerkung: Was ist eine Kollokation?"
        >
          <button
            className="test-footnote-toggle"
            type="button"
            onClick={() => setFootnoteOpen((v) => !v)}
            aria-expanded={footnoteOpen}
            aria-controls="test-kollokation-note"
          >
            <span className="test-footnote-label" aria-hidden="true">Anm.</span>
            <span className="test-footnote-title">Was ist eine Kollokation?</span>
            <span className="test-footnote-chevron" aria-hidden="true">▾</span>
          </button>

          <div
            id="test-kollokation-note"
            className={`test-footnote-body${footnoteOpen ? ' open' : ''}`}
            role="region"
          >
            <p>
              Eine <em>Kollokation</em> ist eine typische, statistisch bevorzugte Verbindung zweier Wörter —
              zum Beispiel <em>»blinder Fleck«</em> oder <em>»Fehler begehen«</em>. Solche Verbindungen
              klingen für Muttersprachler selbstverständlich, obwohl es meist keine grammatische
              Notwendigkeit gibt, gerade diese Wörter zusammenzustellen.
            </p>
            <p>
              Im Deutschen werden Kollokationen aus großen Textkorpora wie dem DWDS-Kernkorpus
              gewonnen — Millionen von Texten, die zeigen, welche Wörter einander besonders häufig
              begleiten. Signifikation nutzt diese Daten für seine täglichen Wortspiele.
            </p>
          </div>
        </section>

        {/* ── Kolophon ───────────────────────────────────── */}
        <footer className="test-colophon" role="contentinfo">
          <span className="test-colophon-ornament" aria-hidden="true">· · ·</span>
          <nav aria-label="Rechtliches">
            <ul className="test-colophon-links">
              <li><a href="/impressum">Impressum</a></li>
              <li><a href="/datenschutz">Datenschutz</a></li>
              <li>
                <a
                  href="https://www.dwds.de"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Daten: DWDS
                </a>
              </li>
            </ul>
          </nav>
          <p className="test-colophon-edition">
            Signifikation · Experimentelles Design · 2026
          </p>
        </footer>

      </div>
    </div>
  )
}
