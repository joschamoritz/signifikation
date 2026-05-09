import { useRef, useCallback } from 'react'
import TabHeader from './TabHeader'
import { useActiveSnapCard } from '../hooks/useActiveSnapCard'

function LockIcon() {
  return (
    <svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', marginBottom: '1px' }}>
      <rect x="0.5" y="4.5" width="8" height="6" rx="1" />
      <path d="M2.5 4.5V3a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

const KURS_MODULES = [
  {
    id: 'wortarten',
    glyph: '①',
    marginalia: 'MORPH.',
    title: 'Wortarten erkennen',
    ipa: '[ˈvɔʁtˌaʁtən]',
    category: 'Morphologie',
    definition: 'Substantive, Verben, Adjektive in echten Texten markieren und klassifizieren.',
    isPremium: false,
  },
  {
    id: 'grammatik',
    glyph: '②',
    marginalia: 'SYNT.',
    title: 'Grammatische Abhängigkeiten',
    ipa: '[ɡʁaˈmatɪʃə ʔapˈhɛŋɪçkaɪ̯tən]',
    category: 'Syntax',
    definition: 'Subjekt, Objekt und Prädikativer verstehen — einfache syntaktische Relationen erkennen.',
    isPremium: false,
  },
  {
    id: 'kollokationen',
    glyph: '③',
    marginalia: 'KOLLO.',
    title: 'Kollokationen antizipieren',
    ipa: '[kɔlokaˈtsi̯oːnən]',
    category: 'Lexikologie',
    definition: 'Für ein vorgegebenes Lemma die häufigsten Verben und Adjektive schätzen und mit dem Korpus abgleichen.',
    isPremium: false,
  },
  {
    id: 'korpuslingu',
    glyph: '④',
    marginalia: 'TEOR.',
    title: 'Korpuslinguistik verstehen',
    ipa: '[kɔrˈpʊsˌlɪŋɡvɪstɪk]',
    category: 'Theorie',
    definition: 'Wie entstehen Textkorpora? Was ist automatische Annotation? Überblick über die Methoden.',
    isPremium: false,
  },
  {
    id: 'mini-recherche',
    glyph: '⑤',
    marginalia: 'ANWND.',
    title: 'Mini-Recherche',
    ipa: '[ˈmiːniʁəˌʃɛʁʃə]',
    category: 'Anwendung',
    definition: 'Eigene Fragestellung in einem kleinen Beispielkorpus — belegen statt raten.',
    isPremium: false,
  },
]

export default function KursTab({ gesamtausgabe = false, onNavigateToKonto = () => {} }) {
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)

  const scrollToCard = useCallback((index) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="test-page kurs-tab">
      <div className="test-wrapper">
        <TabHeader />

        <nav className="test-raster" aria-label="Kurs-Übersicht">
          <span className="test-raster-label" aria-hidden="true">Kurs</span>
          <div className="test-raster-words">
            <span className="test-raster-word">Didaktischer Lernpfad</span>
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">
              {gesamtausgabe ? 'Freigeschaltet' : 'Basis'}
            </span>
          </div>
        </nav>

        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main>
          <ol className="test-entries" aria-label="Kurs-Module" ref={entriesRef}>

            {KURS_MODULES.map((mod, idx) => (
              <li key={mod.id} className="test-entry test-entry--disabled">
                <div className="test-entry-number" aria-hidden="true">
                  <span className="test-entry-num-glyph">{mod.glyph}</span>
                  <span className="test-entry-marginalia">{mod.marginalia}</span>
                  {mod.isPremium && (
                    <span className="test-entry-premium" aria-label="Teil der Gesamtausgabe">
                      Gesamtausgabe
                    </span>
                  )}
                </div>
                <div className="test-entry-body">
                  <div className="test-entry-head">
                    <h2 className="test-headword">{mod.title}</h2>
                    <span className="test-ipa" aria-label={`Aussprache: ${mod.ipa}`}>{mod.ipa}</span>
                  </div>
                  <div className="test-entry-grammar" aria-hidden="true">
                    <span className="test-pos">Modul</span>
                    <span className="test-pos-rule" />
                    <span className="test-entry-category">{mod.category}</span>
                  </div>
                  <p className="test-definition">{mod.definition}</p>

                  <div className="test-entry-footer">
                    <span className="test-status">In Entwicklung.</span>
                    <span className="test-cta test-cta--disabled" aria-hidden="true">
                      Bald verfügbar
                    </span>
                  </div>
                </div>
              </li>
            ))}

          </ol>

          {/* ── Vertikale Badge-Navigation (nur mobil) ───────── */}
          <nav className="snap-nav" aria-label="Kurs-Navigation">
            <div className="snap-nav-games">
              {KURS_MODULES.map((mod, i) => (
                <button
                  key={mod.id}
                  className={`snap-nav-btn${activeCard === i ? ' snap-nav-btn--active' : ''}`}
                  aria-label={`Modul ${i + 1}: ${mod.title}`}
                  aria-current={activeCard === i ? 'true' : undefined}
                  onClick={() => scrollToCard(i)}
                >{mod.glyph}</button>
              ))}
            </div>
            <div className="snap-nav-spacer" aria-hidden="true" />
          </nav>
        </main>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Systematischer Einstieg in die Korpuslinguistik: von Wortarten über Syntaktik bis zur eigenen Recherche.</span>
        </div>
      </div>
    </div>
  )
}
