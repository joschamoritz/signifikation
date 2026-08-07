import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { getRoundOptions, calculateMixedScore, shuffle, getMedal } from '../utils/gameLogic'
import { useBelege } from '../hooks/useBelege'
import { lsGet, lsSet } from '../utils/storage'
import BelegePanel from './BelegePanel'
import Sheet from './ui/Sheet'
import '../styles/quiz.css'

const BELEG_HINT_KEY = 'sig_beleg_hint'

// ── Haupt-Quiz (Einzelrunde, gemischte Top-3) ─────────────────
// Phase-5/T-5.6: zusaetzliche Props (mode, onSubmit, disableProgress,
// hideHeader) werden derzeit nur durchgereicht — Defaults erhalten das
// Singleplayer-Verhalten 1:1. Der Classroom-Pfad rendert seine eigene
// Mini-Variante in classroom/student/games/ClassroomGameKollokationen.jsx,
// d.h. diese Komponente bleibt unangetastet. Die Props ermoeglichen aber
// einen kuenftigen In-Place-Klassenraum-Render ohne weiteren Eingriff hier.
export default function Quiz({
  lemma,
  currentRound,
  onRoundComplete,
  onBack,
  mode = 'single',          // 'single' | 'classroom'
  onSubmit,                 // Classroom: (rawAnswer) => void
  onProgress,               // Classroom: Entwurf spiegeln (Reload, 7.2)
  initialSelected = null,   // Classroom: Auswahl aus dem Entwurf
  serverDatum = null,       // Tages-Seed fuer das Score-Label (Server-Tag statt Client-Uhr)
  savedResult = null,       // Bereits gespielte Runde ansehen: { selected } → Quiz startet ausgewertet
  onRestart,                // "Zur Startseite" (nur nach Auswertung sichtbar)
}) {
  // Klassenraum: dieselbe Quiz-Optik, aber ohne Joker/Belege/Sofort-Feedback
  // (server-autoritativ; Joker/Feedback braeuchten die Loesung `rang`). Eine
  // Abgabe via onSubmit({ selected }); Aufloesung gibt die Lehrkraft frei.
  const isClassroom = mode === 'classroom'
  const submittedRef = useRef(false)
  const [selected, setSelected]   = useState(() => {
    if (isClassroom && Array.isArray(initialSelected)) return initialSelected.slice(0, 3)
    if (savedResult?.selected) return savedResult.selected.slice(0, 3)
    return []
  })
  const [submitted, setSubmitted] = useState(() => !!savedResult)
  const [showBelegHint, setShowBelegHint] = useState(() => !lsGet(BELEG_HINT_KEY))

  const kollokatoren = useMemo(() => lemma.runden?.kollokatoren ?? [], [lemma])

  const { openBeleg, belegeCache, belegeLoading, loadBelege, closeBelege } = useBelege(lemma.lemma, '')
  const wrapRef = useRef(null)

  const handleScroll = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const atEnd = rect.bottom <= window.innerHeight + 4
    el.classList.toggle('options-grid-wrap--scrolled-to-end', atEnd)
  }, [])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Klassenraum: Auswahl als Entwurf spiegeln → Reload-sicher (7.2).
  useEffect(() => {
    if (!isClassroom || typeof onProgress !== 'function') return
    onProgress(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClassroom, selected])

  const options        = useMemo(() => getRoundOptions(kollokatoren), [kollokatoren])
  const displayOptions = useMemo(
    () => submitted
      ? [...options].sort((a, b) => (b.log_dice ?? 0) - (a.log_dice ?? 0))
      : options,
    [options, submitted]
  )

  // ── Joker ────────────────────────────────────────────────────
  // Hooks muessen VOR dem shouldSkip-Early-Return stehen (Rules of Hooks):
  // wechselt kollokatoren zwischen Renders von leer → befuellt, wuerde sich
  // sonst die Hook-Anzahl aendern und React crashen.
  const [jokerVisible, setJokerVisible] = useState(false)
  const [jokerUsed,    setJokerUsed]    = useState(false)
  const [grayedWords,  setGrayedWords]  = useState(new Set())
  const jokerTimer = useRef(null)

  useEffect(() => {
    if (submitted || jokerUsed || isClassroom) return
    setJokerVisible(false)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 15000)
    return () => clearTimeout(jokerTimer.current)
  }, [currentRound, submitted, jokerUsed, isClassroom])

  // Keine Daten → überspringen (0 Punkte). onRoundComplete ueber eine Ref
  // stabilisieren: so haengt der Effekt nur an shouldSkip (feuert genau einmal
  // beim Wechsel auf true) und ruft trotzdem den aktuellen Callback — ohne
  // eslint-disable und ohne Doppelaufruf bei nicht-memoizierter Prop.
  const onRoundCompleteRef = useRef(onRoundComplete)
  useEffect(() => { onRoundCompleteRef.current = onRoundComplete })
  const shouldSkip = !kollokatoren.length
  useEffect(() => {
    if (shouldSkip) onRoundCompleteRef.current(0)
  }, [shouldSkip])

  // Direkt beim Auswerten melden (kein separater Ergebnis-Screen/Extra-Klick
  // mehr): der Screen bleibt derselbe und zeigt die Auswertung inline.
  // savedResult-Ansicht (schon gespielte Runde) meldet nichts erneut.
  useEffect(() => {
    if (submitted && !savedResult && !isClassroom) {
      onRoundCompleteRef.current(calculateMixedScore(selected, kollokatoren), selected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted])

  if (shouldSkip) return null

  const roundScore = submitted ? calculateMixedScore(selected, kollokatoren) : null
  const medal       = submitted ? getMedal(roundScore, 10) : null

  function resetJokerTimer() {
    if (jokerUsed || submitted) return
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    jokerTimer.current = setTimeout(() => setJokerVisible(true), 15000)
  }

  function activateJoker() {
    if (jokerUsed || submitted) return
    setJokerUsed(true)
    setJokerVisible(false)
    clearTimeout(jokerTimer.current)
    const wrong = options.filter(opt => {
      const k = kollokatoren.find(k => k.wort === opt.wort)
      return (!k || k.rang > 3) && !selected.includes(opt.wort)
    })
    const toGray = new Set(shuffle([...wrong]).slice(0, 3).map(o => o.wort))
    setGrayedWords(toGray)
  }

  function selectedRank(word) {
    const i = selected.indexOf(word)
    return i >= 0 ? i + 1 : null
  }

  function toggleWord(word) {
    if (submitted) return
    setSelected(prev =>
      prev.includes(word)
        ? prev.filter(w => w !== word)
        : prev.length < 3 ? [...prev, word] : prev
    )
  }

  function getOptionState(word) {
    if (!submitted) return selected.includes(word) ? 'selected' : ''
    const k = kollokatoren.find(k => k.wort === word)
    const isSelected = selected.includes(word)
    const isTop3 = k && k.rang <= 3
    if (isSelected && isTop3)  return 'correct'
    if (isSelected && !isTop3) return 'wrong'
    if (!isSelected && isTop3) return 'missed'
    return ''
  }

  const STATE_ICON  = { correct: '✓', wrong: '✗', missed: '→' }
  const STATE_LABEL = { correct: 'korrekt', wrong: 'falsch', missed: 'verpasst' }

  function handleLoadBelege(collocate) {
    if (showBelegHint) {
      setShowBelegHint(false)
      lsSet(BELEG_HINT_KEY, '1')
    }
    loadBelege(collocate)
  }

  return (
    <div className="screen quiz-screen" onClick={resetJokerTimer}>
      {onBack && !isClassroom && (
        <button className="back-btn" type="button" onClick={onBack} aria-label="Zurück zur Wortauswahl"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true"><path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
      )}
      <header className="quiz-header">
        <span className="quiz-game-badge">Kollokationen</span>
        <h1 className="quiz-lemma-word">{lemma.lemma}</h1>
        <p id="quiz-instruction" className="quiz-instruction">
          Wähle die 3 stärksten Kollokatoren zu <strong>{lemma.lemma}</strong>
          {!submitted && !jokerUsed && jokerVisible && (
            <button className="joker-btn" type="button" onClick={e => { e.stopPropagation(); activateJoker() }} aria-label="Hinweis aktivieren" title="Hinweis"><em>i</em></button>
          )}
        </p>
        {/* Regulaer sind es 10 Optionen (Top-3 + 7 schwaechere Kollokatoren,
            fest in den Daten). Der Hinweis erscheint nur bei Abweichung — ohne
            die Bezugsgroesse „statt 10" war die nackte Zahl aber wertlos: Wer
            das zum ersten Mal sieht, weiss nicht, dass hier etwas fehlt. */}
        {options.length < 10 && (
          <p className="quiz-options-hint" aria-live="polite">
            <em>Heute nur {options.length} statt 10 Kollokatoren</em>
          </p>
        )}
      </header>

      <div ref={wrapRef} className="options-grid-wrap">
      <div className="options-grid" aria-describedby="quiz-instruction">
        {displayOptions.map((opt, i) => {
          const rank  = selectedRank(opt.wort)
          const state = getOptionState(opt.wort)
          const isActive = submitted && openBeleg === opt.wort

          const ariaLabel = submitted
            ? `${opt.wort} – ${STATE_LABEL[state] ?? ''}`
            : rank
              ? `${opt.wort} – gewählt`
              : opt.wort

          return (
            <button
              key={opt.wort}
              className={`option${state ? ' ' + state : ''}${isActive ? ' option--beleg-active' : ''}${!submitted && grayedWords.has(opt.wort) ? ' option--grayed' : ''}`}
              type="button"
              disabled={!submitted && grayedWords.has(opt.wort) || undefined}
              style={{ animationDelay: submitted ? '0ms' : `${i * 35}ms` }}
              onClick={() => submitted ? handleLoadBelege(opt.wort) : toggleWord(opt.wort)}
              aria-label={ariaLabel}
              aria-pressed={!submitted ? selected.includes(opt.wort) : undefined}
            >
              {submitted && STATE_ICON[state] && (
                <span className="option-icon" aria-hidden="true">{STATE_ICON[state]}</span>
              )}
              {/* Vor dem Auswerten war die Auswahl allein farblich markiert
                  (Rahmen links + Tonung). Die Rangziffer wurde zwar schon
                  berechnet, landete aber nur im aria-label. Sichtbar gerendert
                  traegt sie die Information jetzt auch ohne Farbwahrnehmung. */}
              {!submitted && rank && (
                <span className="option-rank" aria-hidden="true">{rank}</span>
              )}
              {opt.wort}
              {submitted && opt.log_dice != null && (
                <span className="logdice" aria-hidden="true">{opt.log_dice}</span>
              )}
            </button>
          )
        })}
      </div>
      </div>

      {submitted && showBelegHint && (
        <button
          type="button"
          className="beleg-hint"
          onClick={() => { setShowBelegHint(false); lsSet(BELEG_HINT_KEY, '1') }}
          aria-label="Tipp schließen: Tippe auf ein Wort, um Beispielsätze aus dem Korpus zu sehen."
        >
          💡 Tipp: Tippe auf ein Wort, um Beispielsätze aus dem Korpus zu sehen.
        </button>
      )}

      <Sheet
        open={submitted && !!openBeleg}
        onClose={closeBelege}
        aria-label={openBeleg ? `Belege für ${lemma.lemma} und ${openBeleg}` : 'Belege'}
      >
        <Sheet.Header />
        <Sheet.Body>
          {openBeleg && (
            <BelegePanel
              lemma={lemma.lemma}
              collocate={openBeleg}
              data={belegeCache[openBeleg]}
              loading={belegeLoading}
            />
          )}
        </Sheet.Body>
      </Sheet>

      {submitted && (
        <div className="round-feedback" aria-live="polite" aria-atomic="true">
          <div className="round-feedback-score">
            <span className="round-score-display">+{roundScore}</span>
            <span className="round-score-label">
              {(() => {
                // Tages-Seed: serverDatum (der Tag, zu dem der Content gehoert)
                // hat Vorrang; Fallback Lokaldatum (en-CA = YYYY-MM-DD) statt UTC,
                // sonst wuerde das Label um Mitternacht ±2h inkonsistent wechseln.
                const v = (serverDatum || new Intl.DateTimeFormat('en-CA').format(new Date())).replace(/-/g, '')
                const seed = parseInt(v, 10) % 4
                const labelGroups = {
                  3: ['treffend','präzise','belegt','nachgewiesen'],
                  2: ['nahezu','weitgehend','annähernd','überwiegend'],
                  1: ['bedingt','partiell','vereinzelt','ansatzweise'],
                  0: ['nicht belegt','fraglich','abweichend','ungesichert'],
                }
                const cat = roundScore >= 9 ? 3 : roundScore >= 6 ? 2 : roundScore >= 3 ? 1 : 0
                return <em>{labelGroups[cat][seed]}</em>
              })()}
            </span>
          </div>
          <div className="round-feedback-answer">
            {/* Top-3: korrekte Wörter mit Rang und Punkten */}
            {kollokatoren
              .filter(k => k.rang <= 3)
              .sort((a, b) => a.rang - b.rang)
              .map(k => {
                const guessed = selected.includes(k.wort)
                const pts = guessed ? 3 : null
                return (
                  <span key={k.wort} className="feedback-word">
                    <span className={`feedback-rang ${guessed ? 'feedback-rang--ok' : 'feedback-rang--miss'}`}>
                      #{k.rang}
                    </span>
                    {k.wort}
                    <span className="logdice">{k.log_dice}</span>
                    {pts !== null && <span className="feedback-pts">+{pts}</span>}
                  </span>
                )
              })
            }
            {/* Nahe Treffer (Rang 4–7) die gewählt wurden */}
            {selected
              .map(word => kollokatoren.find(k => k.wort === word))
              .filter(k => k && k.rang >= 4 && k.rang <= 7)
              .map(k => (
                <span key={k.wort} className="feedback-word">
                  <span className="feedback-rang feedback-rang--off">#{k.rang}</span>
                  {k.wort}
                  <span className="logdice">{k.log_dice}</span>
                  <span className="feedback-pts">+2</span>
                </span>
              ))
            }
            {/* Schwache Treffer (Rang 8–10) die gewählt wurden */}
            {selected
              .map(word => kollokatoren.find(k => k.wort === word))
              .filter(k => k && k.rang >= 8 && k.rang <= 10)
              .map(k => (
                <span key={k.wort} className="feedback-word">
                  <span className="feedback-rang feedback-rang--off">#{k.rang}</span>
                  {k.wort}
                  <span className="logdice">{k.log_dice}</span>
                  <span className="feedback-pts">+1</span>
                </span>
              ))
            }
            {/* Bonus-Indikator */}
            {selected.length === 3 && selected.every(word => {
              const k = kollokatoren.find(k => k.wort === word)
              return k && k.rang <= 3
            }) && (
              <span className="feedback-word feedback-bonus">
                Alle Top-3 gewählt
                <span className="feedback-pts">+1</span>
              </span>
            )}
          </div>
          <p className="results-medal">{medal.emoji}&thinsp;{medal.label}</p>
        </div>
      )}

      {submitted && !isClassroom && (
        <div className="results-actions">
          <button className="btn-primary" type="button" onClick={onRestart}>
            Zur Startseite<span className="test-cta-arrow" aria-hidden="true"> →</span>
          </button>
        </div>
      )}

      {!submitted && (
        <footer className="quiz-footer">
          <span className="select-count" aria-live="polite" aria-atomic="true">{selected.length} / 3 gewählt</span>
          <button
            className="quiz-cta"
            type="button"
            disabled={selected.length !== 3}
            onClick={() => {
              if (selected.length !== 3) return
              if (isClassroom) {
                // Server-autoritativ: keine lokale Auswertung, eine Abgabe.
                if (submittedRef.current) return
                submittedRef.current = true
                onSubmit?.({ selected })
                return
              }
              setSubmitted(true)
            }}
          >
            {isClassroom ? 'Abgeben' : 'Auswerten'}
            <span className="quiz-cta-arrow" aria-hidden="true"> →</span>
          </button>
        </footer>
      )}
    </div>
  )
}
