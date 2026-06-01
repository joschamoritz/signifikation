// Klassenraum-Index — die Landing-Ansicht des Lehrer-Tabs.
//
// Wörterbuch-Index des Klassenraum-Modus (analog zur Spielmodi-Startseite):
// vier Einträge mit fester Funktion, nicht eine Liste gespielter Sessions.
//   ① Anleitung  — Info-Sheet „So funktioniert der Klassenraum"
//   ② Sessions   — führt in die Session-Verwaltung (STEPS.LIST)
//   ③ Beitritt   — Info-Sheet „So treten Schüler bei"
//   ④ Vorbereiten — Teaser (in Vorbereitung), bewusst deaktiviert
//
// Reine Navigation/Info — keine Backend-Funktion wird hier neu eingeführt.

import { useState } from 'react'
import { useTeacherClassroom } from '../TeacherClassroomContext'
import { useSessionsList } from '../hooks/useSessionsList'
import Sheet from '../../../ui/Sheet'

export default function ClassroomIndexStep() {
  const { dispatch } = useTeacherClassroom()
  const { sessions, loading } = useSessionsList({ limit: 50 })
  const [sheet, setSheet] = useState(null) // 'how' | 'join' | null

  const sessionCount = sessions.length
  const sessionStatus = loading
    ? 'Wird geladen …'
    : sessionCount === 0
      ? 'Noch keine Session angelegt.'
      : `${sessionCount} ${sessionCount === 1 ? 'Session' : 'Sessions'} angelegt.`

  return (
    <div data-testid="cr2-index">
      <ol className="cr2-entries" aria-label="Klassenraum">

        {/* ① Anleitung ─────────────────────────────────────── */}
        <li className="cr2-entry cr2-entry--index">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">①</span>
            <span className="test-entry-marginalia">INFO</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Anleitung</h2>
              <span className="test-ipa" aria-label="Aussprache: [ˈanlaɪ̯tʊŋ]">[ˈanlaɪ̯tʊŋ]</span>
            </div>
            <div className="test-entry-grammar" aria-hidden="true">
              <span className="test-pos">Klassenraum</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Überblick</span>
            </div>
            <p className="test-definition">
              Was ist der Klassenraum? Eine Live-Stunde in drei Schritten:
              Session anlegen, Code an die Klasse, gemeinsam spielen und auswerten.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">Immer verfügbar.</span>
              <button
                type="button"
                className="test-cta"
                onClick={() => setSheet('how')}
                data-testid="cr2-index-how"
              >
                So funktioniert's
                <span className="test-cta-arrow" aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </li>

        {/* ② Sessions ──────────────────────────────────────── */}
        <li className="cr2-entry cr2-entry--index">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">②</span>
            <span className="test-entry-marginalia">LIVE</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Sessions</h2>
              <span className="test-ipa" aria-label="Aussprache: [ˈsɛʃn̩s]">[ˈsɛʃn̩s]</span>
            </div>
            <div className="test-entry-grammar" aria-hidden="true">
              <span className="test-pos">Verwaltung</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Live-Stunde</span>
            </div>
            <p className="test-definition">
              Lege eine neue Live-Session an oder setze eine laufende fort —
              ein Modus, ein Lemma, ein Beitrittscode für die ganze Klasse.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">{sessionStatus}</span>
              <button
                type="button"
                className="test-cta"
                onClick={() => dispatch({ type: 'GO_TO_LIST' })}
                data-testid="cr2-index-sessions"
              >
                Sessions verwalten
                <span className="test-cta-arrow" aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </li>

        {/* ③ Beitritt ──────────────────────────────────────── */}
        <li className="cr2-entry cr2-entry--index">
          <div className="test-entry-number" aria-hidden="true">
            <span className="test-entry-num-glyph">③</span>
            <span className="test-entry-marginalia">ZUGANG</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Beitritt</h2>
              <span className="test-ipa" aria-label="Aussprache: [ˈbaɪ̯tʁɪt]">[ˈbaɪ̯tʁɪt]</span>
            </div>
            <div className="test-entry-grammar" aria-hidden="true">
              <span className="test-pos">Schüler</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">Zugang</span>
            </div>
            <p className="test-definition">
              Wie kommt die Klasse rein? Über einen kurzen Code oder den
              QR-Code — ohne Anmeldung, ohne Konto, direkt im Browser.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">Code &amp; QR.</span>
              <button
                type="button"
                className="test-cta"
                onClick={() => setSheet('join')}
                data-testid="cr2-index-join"
              >
                So treten Schüler bei
                <span className="test-cta-arrow" aria-hidden="true"> →</span>
              </button>
            </div>
          </div>
        </li>

        {/* ④ Vorbereiten ───────────────────────────────────── */}
        <li className="cr2-entry cr2-entry--index cr2-entry--disabled" aria-hidden="true">
          <div className="test-entry-number">
            <span className="test-entry-num-glyph">④</span>
            <span className="test-entry-marginalia">PLAN</span>
          </div>
          <div className="test-entry-body">
            <div className="test-entry-head">
              <h2 className="test-headword">Vorbereiten</h2>
              <span className="test-ipa">[ˈfoːɐ̯bəˌʁaɪ̯tn̩]</span>
            </div>
            <div className="test-entry-grammar">
              <span className="test-pos">Planung</span>
              <span className="test-pos-rule" />
              <span className="test-entry-category">in Arbeit</span>
            </div>
            <p className="test-definition">
              Sessions im Voraus zusammenstellen und für die nächste Stunde
              bereithalten — geplant für eine spätere Auflage.
            </p>
            <div className="test-entry-footer">
              <span className="test-status">Demnächst verfügbar.</span>
              <span className="test-cta test-cta--disabled" aria-hidden="true">—</span>
            </div>
          </div>
        </li>

      </ol>

      {/* ── Info-Sheet: Anleitung ────────────────────────────── */}
      <Sheet open={sheet === 'how'} onClose={() => setSheet(null)} aria-label="So funktioniert der Klassenraum">
        <Sheet.Header />
        <div className="info-sheet-header">
          <span className="info-sheet-label" aria-hidden="true">Anl.</span>
          <h2 className="info-sheet-title">So funktioniert der Klassenraum</h2>
          <button className="info-sheet-close" type="button" onClick={() => setSheet(null)} aria-label="Schließen">✕</button>
        </div>
        <Sheet.Body>
          <div className="info-sheet-body">
            <p>
              Der <strong>Klassenraum</strong> macht aus dem täglichen Wortspiel eine
              <strong> gemeinsame Live-Stunde</strong>: Du steuerst von vorn, die Klasse
              spielt gleichzeitig auf den eigenen Geräten — anonym, ohne Anmeldung.
            </p>
            <p>In drei Schritten:</p>
            <ol className="info-sheet-steps">
              <li><strong>Session anlegen.</strong> Wähle einen Spielmodus und 1–3 Lemmata. Optional mehrere Modi nacheinander.</li>
              <li><strong>Code teilen.</strong> Die Schüler öffnen <em>signifikation.de</em> und tippen den Beitrittscode ein — oder scannen den QR-Code.</li>
              <li><strong>Spielen &amp; auswerten.</strong> Du startest die Runde, alle spielen synchron, und du siehst die Auswertung live.</li>
            </ol>
            <p>
              Nach der Stunde werden die Spitznamen der Schüler automatisch
              anonymisiert — es bleibt nichts Persönliches gespeichert.
            </p>
          </div>
        </Sheet.Body>
      </Sheet>

      {/* ── Info-Sheet: Beitritt ─────────────────────────────── */}
      <Sheet open={sheet === 'join'} onClose={() => setSheet(null)} aria-label="So treten Schüler bei">
        <Sheet.Header />
        <div className="info-sheet-header">
          <span className="info-sheet-label" aria-hidden="true">Zug.</span>
          <h2 className="info-sheet-title">So treten Schüler bei</h2>
          <button className="info-sheet-close" type="button" onClick={() => setSheet(null)} aria-label="Schließen">✕</button>
        </div>
        <Sheet.Body>
          <div className="info-sheet-body">
            <p>
              Sobald du eine Session öffnest, zeigt die Lobby einen
              <strong> Beitrittscode</strong> und einen <strong>QR-Code</strong>.
              Beide führen zum selben Ziel — die Schüler brauchen kein Konto.
            </p>
            <ol className="info-sheet-steps">
              <li><strong>Code eintippen.</strong> Die Klasse öffnet <em>signifikation.de</em>, geht auf <em>Klassenraum</em> und gibt den Code ein.</li>
              <li><strong>Oder QR scannen.</strong> Mit der Handykamera den QR-Code in der Lobby scannen — der Link öffnet den Beitritt direkt.</li>
              <li><strong>Spitzname wählen.</strong> Jede:r tippt einen kurzen Namen ein. Ein echter Name ist nicht nötig.</li>
            </ol>
            <p>
              Du siehst in der Lobby, wer beigetreten ist, und startest die Runde,
              wenn alle da sind.
            </p>
          </div>
        </Sheet.Body>
      </Sheet>
    </div>
  )
}
