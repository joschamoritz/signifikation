import { useState } from 'react'
import './test.css'

const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
const MONTHS   = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

function todayLabel() {
  const d = new Date()
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function computeStreak() {
  const activity = JSON.parse(localStorage.getItem('sig_activity') || '[]')
  const legacy   = JSON.parse(localStorage.getItem('sig_history') || '[]').map(h => h.date)
  const dateSet  = new Set([...activity, ...legacy])
  if (!dateSet.size) return 0
  const msDay = 86_400_000
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr     = localDateStr(today)
  const yesterdayStr = localDateStr(new Date(today - msDay))
  if (!dateSet.has(todayStr) && !dateSet.has(yesterdayStr)) return 0
  let d = dateSet.has(todayStr) ? new Date(today) : new Date(today - msDay)
  let streak = 0
  while (dateSet.has(localDateStr(d))) { streak++; d = new Date(d - msDay) }
  return streak
}

function streakFlames(n) {
  if (n >= 30) return '🔥🔥🔥'
  if (n >= 7)  return '🔥🔥'
  return '🔥'
}

/* ── Statische Demodaten ──────────────────────────────────── */
const HEUTE = {
  datum: todayLabel(),
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
  const [copied, setCopied] = useState(false)
  const streak = computeStreak()

  async function shareResult() {
    const text = `📖 Signifikation · ${new Date().getDate()}. ${MONTHS[new Date().getMonth()]}\n\n💬 Schaffst du es besser? → signifikation.de`
    if (navigator.share) { try { await navigator.share({ text }); return } catch {} }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2200) } catch {}
  }

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

        {/* ── Streak ─────────────────────────────────────── */}
        {streak > 0 && (
          <div className="streak-pill">
            <span className="streak-flames">{streakFlames(streak)}</span>
            <div className="streak-text">
              <span className="streak-count">{streak}</span>
              <span className="streak-label">{streak === 1 ? 'Tag' : 'Tage'} am Stück</span>
            </div>
          </div>
        )}

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
            <p className="home-card-text home-card-text--dropcap">
              Kollokationen sind <strong>charakteristische syntagmatische Wortverbindungen</strong>,
              in denen ein Element (die <strong>Basis</strong>) den anderen Bestandteil (den{' '}
              <strong>Kollokator</strong>) semantisch selegiert. Man sagt <em>blondes Haar</em> und
              nicht <em>gelbes Haar</em> — nicht weil Letzteres grammatisch falsch wäre, sondern
              weil der konventionalisierte Sprachgebrauch <em>blond</em> als typischen Kollokator
              von <em>Haar</em> fordert.<sup>1</sup>
            </p>
            <p className="home-card-text">
              Kollokationen liegen zwischen freien Wortverbindungen (<em>rotes Auto</em>) und
              Idiomen (<em>ins Gras beißen</em>): semantisch motiviert, aber lexikalisch
              konventionalisiert.
            </p>
            <p className="home-card-text">
              Der <strong>logDice-Wert</strong><sup>2</sup> misst die statistische Signifikanz
              von Kookkurrenzen im Korpus — je höher der Wert, desto charakteristischer die
              Verbindung. Die Daten stammen aus dem <strong>DWDS-Wortprofil</strong><sup>3</sup>{' '}
              und dem <strong>DiaCollo</strong>-System<sup>4</sup>, basierend auf mehreren
              Milliarden Textwörtern aus Tageszeitungen, Literatur und historischen Korpora.
            </p>
            <ol className="home-card-footnotes">
              <li>Hausmann, F.&thinsp;J. (2003): Was sind eigentlich Kollokationen? In: Steyer, K. (Hrsg.): <em>Wortverbindungen — mehr oder weniger fest</em>. de Gruyter, S.&thinsp;309–334.</li>
              <li>Rychlý, P. (2008): A Lexicographer-Friendly Association Score. In: <em>Proceedings of RASLAN 2008</em>, S.&thinsp;6–9.</li>
              <li>DWDS-Wortprofil, erstellt durch das Digitale Wörterbuch der deutschen Sprache, Berlin-Brandenburgische Akademie der Wissenschaften (BBAW). <a href="https://www.dwds.de/d/zitieren" target="_blank" rel="noopener">Zitierregeln</a></li>
              <li>Jurish, B. et&thinsp;al. (2014): DiaCollo: On the Trail of Diachronic Collocations. In: <em>Proceedings of DH 2014</em>. <a href="https://www.dwds.de/d/zitieren" target="_blank" rel="noopener">Zitierregeln</a></li>
            </ol>
          </div>
        </section>

        {/* ── Teilen ─────────────────────────────────────── */}
        <div className="test-share-row">
          <button
            className={`btn-share${copied ? ' btn-share--copied' : ''}`}
            onClick={shareResult}
            aria-label="Ergebnis teilen oder kopieren"
          >
            {copied ? '✓ Kopiert!' : '↗ Ergebnis teilen'}
          </button>
        </div>

        {/* ── Kolophon ───────────────────────────────────── */}
        <footer className="test-colophon" role="contentinfo">
          <span className="test-colophon-ornament" aria-hidden="true">· · ·</span>
          <p className="feedback-hint">
            Fehler oder Anregungen? <a href="mailto:info@signifikation.de">Schreib uns.</a>
          </p>
          <nav className="legal-links" aria-label="Rechtliche Links">
            <a href="/ueber.html">Über die App</a>
            <a href="/impressum.html">Impressum</a>
            <a href="/datenschutz.html">Datenschutz</a>
            <a href="/nutzungsbedingungen.html">Nutzungsbedingungen</a>
          </nav>
          <p className="test-colophon-edition">
            v{__APP_VERSION__} · {__BUILD_DATE__}
          </p>
        </footer>

      </div>
    </div>
  )
}
