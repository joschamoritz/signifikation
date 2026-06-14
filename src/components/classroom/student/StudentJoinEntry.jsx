// T-5.2 / F5 — S1 Code-Eingabe (Schueler-Einstieg).
//
// Eine einfache Code-Eingabe (keine Slots, weil D16-Decision die Wortliste
// behält — Wörter zwischen 4 und 10 Buchstaben). Paste-Support: alles, was
// nicht a-z0-9- ist, wird gefiltert; Groß-/Kleinschreibung wird normalisiert.
//
// Ein Submit fuehrt KEIN /join aus — das passiert erst in NameState mit
// dem dann ebenfalls gewünschten Namen. Hier nur Routing nach /c/:code.
//
// Zwei Erscheinungsformen:
//   • Vollroute /c → KioskShell-Vollbild (das schlichte Panel `inner`).
//   • embedded (Klassenraum-Tab) → Wörterbuch-Index im test-entry-Karten-
//     Design, analog zum Lehrer-Index: ① Beitreten (Code/QR), ② Fortsetzen
//     (nur wenn eine Sitzung in sessionStorage liegt), plus die Anmerkung
//     „Was ist der Klassenraum?" (Desktop-Fußnote / Mobile-Manicula ☞).

import { useState, useRef, useCallback, lazy, Suspense } from 'react'
import { navigate } from '../routing'
import KioskShell from './KioskShell'
import TabHeader from '../../TabHeader'
import Sheet from '../../ui/Sheet'
import { useActiveSnapCard } from '../../../hooks/useActiveSnapCard'
import { peekKioskSession } from './hooks/useStudentSession'
import ClassroomStudentNote from './ClassroomStudentNote'

const QrScanner = lazy(() => import('./QrScanner'))

function normalizeCode(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 30)
}

export default function StudentJoinEntry({ initialNotice = null, embedded = false }) {
  const [code, setCode]       = useState('')
  const [error, setError]     = useState(initialNotice || null)
  const [shake, setShake]     = useState(false)
  const [scanning, setScanning] = useState(false)
  const inputRef              = useRef(null)

  // Persistierte Sitzung einmalig beim Mount lesen (für die „Fortsetzen"-Karte).
  const [resume] = useState(() => (embedded ? peekKioskSession() : null))

  // Anmerkung „Was ist der Klassenraum?" — Desktop-Fußnote + Mobile-Sheet.
  const [sheetOpen,       setSheetOpen]       = useState(false)
  const [desktopInfoOpen, setDesktopInfoOpen] = useState(false)

  // Snap-Navigation (mobil) wie auf der Spielmodi-/Lehrer-Startseite.
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)
  const scrollToCard = useCallback((i) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  function handleChange(e) {
    const v = normalizeCode(e.target.value)
    setCode(v)
    if (error) setError(null)
  }

  function handlePaste(e) {
    const txt = (e.clipboardData || window.clipboardData)?.getData('text') || ''
    if (!txt) return
    e.preventDefault()
    setCode(normalizeCode(txt))
  }

  function go(raw) {
    const c = normalizeCode(raw)
    if (c.length < 4) {
      setError('Zugangscode zu kurz.')
      triggerShake()
      return
    }
    navigate(`/c/${encodeURIComponent(c)}`)
  }

  function handleSubmit(e) {
    e.preventDefault()
    go(code)
  }

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 320)
    try { inputRef.current?.focus() } catch {}
  }

  if (scanning) {
    return (
      <Suspense fallback={null}>
        <QrScanner
          onResult={(c) => { setScanning(false); go(c) }}
          onClose={() => setScanning(false)}
        />
      </Suspense>
    )
  }

  // Gemeinsames Code-Eingabe-Formular (auch in der Karte wiederverwendet).
  const codeForm = (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="classroom-kiosk-code" style={{ position: 'absolute', left: -9999 }}>
        Zugangscode
      </label>
      <input
        id="classroom-kiosk-code"
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={`classroom-kiosk__code-field ${shake ? 'classroom-kiosk__input--shake' : ''}`}
        value={code}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder="z. B. MORGENTAU"
        maxLength={30}
        data-testid="classroom-kiosk-code-input"
      />
      {error && (
        <p className="classroom-kiosk__hint classroom-kiosk__hint--error" data-testid="classroom-kiosk-code-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="btn-primary btn-full"
        disabled={code.length < 4}
        data-testid="classroom-kiosk-code-submit"
      >
        Beitreten
      </button>
    </form>
  )

  // Schlichtes Panel — Vollroute /c (KioskShell-Vollbild).
  const inner = (
    <div className="classroom-kiosk__panel">
      <p className="classroom-kiosk__overline">Live-Sitzung · Beitreten</p>
      <h1 className="classroom-kiosk__title">Klassenraum</h1>
      <p className="classroom-kiosk__lead">
        Tipp den Zugangscode deiner Lehrkraft ein – oder scanne den QR-Code.
      </p>
      {codeForm}
      <button
        type="button"
        className="btn-ghost classroom-kiosk__skip"
        onClick={() => { setError(null); setScanning(true) }}
        data-testid="classroom-kiosk-scan-btn"
      >
        QR-Code scannen
      </button>
    </div>
  )

  if (!embedded) {
    return <KioskShell confirmExit={false}>{inner}</KioskShell>
  }

  // Eingebettet im Klassenraum-Tab → Wörterbuch-Index. test-page liefert die
  // --t-*-Tokens + das Mobil-Layout des geteilten Headers; classroom-kiosk die
  // --k-*-Tokens für das Code-Feld; classroom-student-entry mappt --t-* aus --*.
  const snapNav = resume
    ? [['①', 'Beitreten'], ['②', 'Fortsetzen']]
    : [['①', 'Beitreten']]

  return (
    <div className="classroom-kiosk test-page classroom-student-entry" data-testid="classroom-student-tab">
      <div className="test-wrapper">
        <TabHeader />
        <nav className="test-raster" aria-label="Klassenraum">
          <span className="test-raster-label" aria-hidden="true">Klassenraum</span>
          <div className="test-raster-words">
            <span className="test-raster-word">Live-Sitzung beitreten</span>
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">Schüler:in</span>
          </div>
        </nav>
        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main>
          <ol className="test-entries" aria-label="Klassenraum" ref={entriesRef} data-testid="classroom-student-index">

            {/* ① Beitreten ─────────────────────────────────────── */}
            <li className="test-entry test-drop-cap">
              <div className="test-entry-number" aria-hidden="true">
                <span className="test-entry-num-glyph">①</span>
                <span className="test-entry-marginalia">CODE</span>
              </div>
              <div className="test-entry-body">
                <div className="test-entry-head">
                  <span className="test-dropcap-k" aria-hidden="true">B</span>
                  <h2 className="test-headword" aria-label="Beitreten">eitreten</h2>
                  <span className="test-ipa" aria-label="Aussprache: [ˈbaɪ̯tʁeːtn̩]">[ˈbaɪ̯tʁeːtn̩]</span>
                </div>
                <div className="test-entry-grammar" aria-hidden="true">
                  <span className="test-pos">Schüler:in</span>
                  <span className="test-pos-rule" />
                  <span className="test-entry-category">Zugang</span>
                </div>
                <p className="test-definition">
                  Tipp den Zugangscode deiner Lehrkraft ein — oder scanne den QR-Code.
                </p>

                <div className="classroom-student-entry__form">
                  {codeForm}
                  <button
                    type="button"
                    className="test-cta classroom-student-entry__scan"
                    onClick={() => { setError(null); setScanning(true) }}
                    data-testid="classroom-kiosk-scan-btn"
                  >
                    QR-Code scannen
                  </button>
                </div>
              </div>
            </li>

            {/* ② Fortsetzen ────────────────────── (nur bei aktiver Sitzung) */}
            {resume && (
              <li className="test-entry test-drop-cap">
                <div className="test-entry-number" aria-hidden="true">
                  <span className="test-entry-num-glyph">②</span>
                  <span className="test-entry-marginalia">LIVE</span>
                </div>
                <div className="test-entry-body">
                  <div className="test-entry-head">
                    <h2 className="test-headword">Fortsetzen</h2>
                    <span className="test-ipa" aria-label="Aussprache: [ˈfɔʁtˌzɛtsn̩]">[ˈfɔʁtˌzɛtsn̩]</span>
                  </div>
                  <div className="test-entry-grammar" aria-hidden="true">
                    <span className="test-pos">Sitzung</span>
                    <span className="test-pos-rule" />
                    <span className="test-entry-category">aktiv</span>
                  </div>
                  <p className="test-definition">
                    Du bist noch in einer Sitzung{resume.displayName ? ` als „${resume.displayName}“` : ''} —
                    kehre zurück und spiel weiter.
                  </p>
                  <div className="test-entry-footer">
                    <span className="test-status">Code {String(resume.code).toUpperCase()}</span>
                    <button
                      type="button"
                      className="test-cta"
                      onClick={() => navigate(`/c/${encodeURIComponent(resume.code)}`)}
                      data-testid="classroom-student-resume"
                    >
                      Zurück in deine Sitzung
                      <span className="test-cta-arrow" aria-hidden="true"> →</span>
                    </button>
                  </div>
                </div>
              </li>
            )}

          </ol>
        </main>

        {/* ── Anmerkung: nur Desktop (mobil via ☞ Bottom Sheet) ── */}
        <section className="test-footnote desktop-footnote" aria-label="Anmerkung: Was ist der Klassenraum?">
          <button
            className="test-footnote-toggle"
            type="button"
            onClick={() => setDesktopInfoOpen(v => !v)}
            aria-expanded={desktopInfoOpen}
            aria-controls="desktop-student-note"
          >
            <span className="test-footnote-label" aria-hidden="true">Anm.</span>
            <span className="test-footnote-title">Was ist der Klassenraum?</span>
            <span className="test-footnote-chevron" aria-hidden="true">▾</span>
          </button>
          <div
            id="desktop-student-note"
            className={`test-footnote-body${desktopInfoOpen ? ' open' : ''}`}
            role="region"
          >
            <ClassroomStudentNote />
          </div>
        </section>

        {/* Vertikale Badge-Navigation + Manicula (nur mobil). */}
        <nav className="snap-nav" aria-label="Klassenraum-Navigation">
          <div className="snap-nav-games">
            {snapNav.map(([glyph, label], i) => (
              <button
                key={label}
                type="button"
                className={`snap-nav-btn${activeCard === i ? ' snap-nav-btn--active' : ''}`}
                aria-label={label}
                aria-current={activeCard === i ? 'true' : undefined}
                onClick={() => scrollToCard(i)}
              >{glyph}</button>
            ))}
          </div>
          <button
            className="snap-nav-info"
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Was ist der Klassenraum? – Erklärung öffnen"
          >☞</button>
        </nav>

        {/* ── Info Bottom Sheet (nur mobil erreichbar) ─────────── */}
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} aria-label="Was ist der Klassenraum?">
          <Sheet.Header />
          <div className="info-sheet-header">
            <span className="info-sheet-label" aria-hidden="true">Anm.</span>
            <h2 className="info-sheet-title">Was ist der Klassenraum?</h2>
            <button className="info-sheet-close" type="button" onClick={() => setSheetOpen(false)} aria-label="Schließen">✕</button>
          </div>
          <Sheet.Body>
            <div className="info-sheet-body">
              <ClassroomStudentNote />
            </div>
          </Sheet.Body>
        </Sheet>
      </div>
    </div>
  )
}
