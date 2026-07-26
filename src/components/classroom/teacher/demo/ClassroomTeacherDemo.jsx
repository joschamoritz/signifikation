// Klassenraum-Vorschau für Lehrkräfte (login-frei).
//
// Akquise-Baustein 1: Eine Lehrkraft OHNE Premium/Login sieht den echten
// Ablauf einer Live-Sitzung — Modus wählen, Schüleransicht ansehen, Beitritt
// verstehen — ohne dass serverseitig etwas angelegt wird (kein FK, kein
// Premium-Verschenken). Bewusst „scharf gezogen“:
//   • Wortauswahl NUR aus festen Tageswörtern (kein freies Suchen wie Premium).
//   • Schüleransicht ist STATISCH (eingebaute Demo-Inhalte, nicht /preview).
//   • onSubmit ist ein No-Op — nichts wird gewertet.
//
// Render-Treue: Wir nutzen DIESELBEN Schüler-Spielkomponenten wie der echte
// Kiosk (classroom/student/games/*), nur mit statischem prompt. Dadurch ist die
// Optik 1:1 das echte Spiel (quiz.css), nicht nachgebaut.
//
// HINWEIS für Redaktion: Die Demo-Inhalte unten (DEMO_CONTENT) sind Beispiele
// und können jederzeit ersetzt werden — es ist EIN zentrales Config-Objekt.

import { useState, useEffect } from 'react'
import { apiFetch } from '../../../../utils/apiFetch'
import ModePicker from '../components/ModePicker'
import SessionCodeCard from '../components/SessionCodeCard'
import ClassroomGameKollokationen  from '../../student/games/ClassroomGameKollokationen'
import ClassroomGameWortZwilling   from '../../student/games/ClassroomGameWortZwilling'
import ClassroomGameZeitenwende    from '../../student/games/ClassroomGameZeitenwende'
import ClassroomGameLueckenfueller from '../../student/games/ClassroomGameLueckenfueller'

import '../TeacherClassroomTab.css'
import '../../../../styles/quiz.css'
import '../../student/KioskShell.css'
import '../components/SetupPreview.css'
import './ClassroomTeacherDemo.css'

// ── Fallback-Inhalte (falls der Server nicht antwortet) ─────────────────────
// Editor-freundlicher FLACHER Shape (Felder, keine verschachtelten Prompts) —
// MUSS mit DEMO_CONTENT_DEFAULT in server/classroom/demoContent.js übereinstimmen.
// Im Normalfall kommen die Inhalte aus GET /api/v1/classroom/demo-content
// (im Admin editierbar); dieser Fallback hält die Demo nur offline am Leben.
const DEMO_CONTENT_FALLBACK = {
  kollokationen: {
    lemma: { lemma: 'Debatte', ipa: '[deˈbatə]', definition: 'kontroverse, öffentliche Erörterung einer Frage' },
    words: ['hitzig', 'kontrovers', 'öffentlich', 'sachlich', 'parlamentarisch', 'endlos'],
  },
  wortzwilling: {
    wortA: 'See',
    wortB: 'Meer',
    words: ['tief', 'offen', 'baden', 'rauschen', 'Ufer', 'Welle', 'still', 'Sturm'],
  },
  zeitenwende: {
    lemma: { lemma: 'Netzwerk', ipa: '[ˈnɛtsvɛʁk]' },
    words: ['sozial', 'neuronal', 'kriminell', 'dezentral'],
  },
  lueckenfueller: {
    lemma: { lemma: 'Kritik', ipa: '[kʁiˈtiːk]' },
    sentence: 'Die Opposition übte _____ Kritik an dem Gesetzentwurf.',
    options: ['scharfe', 'milde', 'blaue', 'schnelle'],
  },
}

// Flacher Storage-Shape → die Props, die die echte Spielkomponente erwartet
// (siehe student/games/*). Synthetische Lemma-IDs, da kein DB-Eintrag.
function toGameData(mode, c) {
  const m = c?.[mode]
  if (!m) return null
  switch (mode) {
    case 'kollokationen':
      return {
        lemma:  { id: 'demo-kol', lemma: m.lemma?.lemma || '', ipa: m.lemma?.ipa || '', definition: m.lemma?.definition || '' },
        prompt: { words: m.words || [], definition: m.lemma?.definition || '' },
      }
    case 'wortzwilling':
      return {
        lemma:  { id: 'demo-wz', lemma: `${m.wortA || ''} ↔ ${m.wortB || ''}`, ipa: '' },
        prompt: { wortA: m.wortA || '', wortB: m.wortB || '', words: m.words || [] },
      }
    case 'zeitenwende':
      return {
        lemma:  { id: 'demo-zw', lemma: m.lemma?.lemma || '', ipa: m.lemma?.ipa || '' },
        prompt: { words: m.words || [] },
      }
    case 'lueckenfueller':
      return {
        lemma:  { id: 'demo-lf', lemma: m.lemma?.lemma || '', ipa: m.lemma?.ipa || '' },
        prompt: { roundIndex: 0, currentRound: { type: 'choice', sentence: m.sentence || '', options: m.options || [] } },
      }
    default:
      return null
  }
}

function pickGameComponent(mode) {
  switch (mode) {
    case 'kollokationen':   return ClassroomGameKollokationen
    case 'wortzwilling':    return ClassroomGameWortZwilling
    case 'zeitenwende':     return ClassroomGameZeitenwende
    case 'lueckenfueller':  return ClassroomGameLueckenfueller
    default:                 return null
  }
}

const noop = () => {}

export default function ClassroomTeacherDemo({ onBack = noop, onGoPremium = noop }) {
  const [mode, setMode] = useState('kollokationen')
  // Inhalte aus dem Admin (GET /demo-content); Fallback hält die Demo offline am Leben.
  const [content, setContent] = useState(DEMO_CONTENT_FALLBACK)

  useEffect(() => {
    let alive = true
    apiFetch('/api/v1/classroom/demo-content')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.content) setContent(d.content) })
      .catch(() => { /* Fallback bleibt — Demo bricht nie */ })
    return () => { alive = false }
  }, [])

  const data = toGameData(mode, content)
  const Game = pickGameComponent(mode)

  return (
    <div
      className="classroom-teacher screen selection-screen classroom-subscreen classroom-teacher-demo"
      data-testid="classroom-teacher-demo"
    >
      <header className="selection-header">
        <button
          className="back-btn"
          type="button"
          onClick={onBack}
          aria-label="Vorschau schließen"
          data-testid="classroom-demo-back"
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="none" aria-hidden="true">
            <path d="M8.5 1L1.5 8L8.5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="classroom-subscreen__title">Klassenraum-Vorschau</h1>
        <div className="selection-thema-block">
          <span className="selection-thema-label">Für Lehrkräfte</span>
          <hr className="selection-thema-rule" aria-hidden="true" />
          <p className="selection-thema">So läuft eine Live-Sitzung — ganz ohne Login.</p>
        </div>
      </header>

      {/* I — Modus & Wort (scharf gezogen: nur Tageswort) ─────────────── */}
      <section className="classroom-section" aria-labelledby="demo-modes-label">
        <span id="demo-modes-label" className="classroom-section__label">I · Modus &amp; Wort</span>
        <ModePicker value={mode} onChange={setMode} />

        {data && (
          <div className="classroom-demo-word" data-testid="classroom-demo-word">
            <span className="classroom-demo-word__tag">Wort des Tages</span>
            <span className="classroom-demo-word__lemma">{data.lemma.lemma}</span>
            {data.lemma.ipa && <span className="classroom-demo-word__ipa">{data.lemma.ipa}</span>}
          </div>
        )}

        <p className="classroom-demo-hint" role="note">
          In der Vorschau wählst du aus den heutigen Wörtern. Mit der
          Gesamtausgabe suchst du frei im Korpus.
        </p>
      </section>

      <div className="test-rule--double" role="separator" aria-hidden="true" />

      {/* II — Schüleransicht (statisch, nur ansehen) ──────────────────── */}
      <section className="classroom-section" aria-labelledby="demo-student-label">
        <span id="demo-student-label" className="classroom-section__label">II · Das sehen deine Schüler</span>

        <div className="classroom-kiosk classroom-preview classroom-demo-preview">
          <p className="classroom-preview__banner" role="note">
            Vorschau — so sehen es deine Schüler:innen. Eingaben werden nicht gewertet.
          </p>
          <div className="classroom-kiosk__main">
            {data && Game && (
              <Game
                key={mode}
                lemma={data.lemma}
                prompt={data.prompt}
                onSubmit={noop}
                submitting={false}
              />
            )}
          </div>
        </div>
      </section>

      <div className="test-rule--double" role="separator" aria-hidden="true" />

      {/* III — Beitritt (Beispiel-Code + QR) ──────────────────────────── */}
      <section className="classroom-section" aria-labelledby="demo-join-label">
        <span id="demo-join-label" className="classroom-section__label">III · So treten sie bei</span>
        <p className="classroom-demo-hint">
          Ein Code, ein Scan, kein Login — deine Klasse ist in Sekunden dabei.
        </p>
        <p className="classroom-demo-example-tag" aria-hidden="true">Beispiel</p>
        <SessionCodeCard code="beispiel" />
      </section>

      <div className="test-rule--double" role="separator" aria-hidden="true" />

      {/* Schluss — Premium-Ausblick + CTA ─────────────────────────────── */}
      <section className="classroom-section classroom-demo-outro" aria-label="Gesamtausgabe">
        <p className="classroom-demo-outro__text">
          Mit der Gesamtausgabe startest du echte Live-Sitzungen — freie
          Wortsuche, eigenes Lemma, Kurse.
        </p>
        <button
          type="button"
          className="test-cta classroom-demo-outro__cta"
          onClick={onGoPremium}
          data-testid="classroom-demo-premium"
        >
          Zur Gesamtausgabe
          <span className="test-cta-arrow" aria-hidden="true"> →</span>
        </button>
      </section>
    </div>
  )
}
