import { useRef, useCallback } from 'react'
import TabHeader from './TabHeader'
import { useKontoAuth } from '../hooks/useKontoAuth'
import { useActiveSnapCard } from '../hooks/useActiveSnapCard'
import KontoZugangBlock from './konto/KontoZugangBlock'
import KontoGeraeteBlock from './konto/KontoGeraeteBlock'
import KontoStatistikenBlock from './konto/KontoStatistikenBlock'
import KontoEinstellungenBlock from './konto/KontoEinstellungenBlock'
import KontoRechtlichesBlock from './konto/KontoRechtlichesBlock'

export default function KontoTab({ gesamtausgabe, gesamtausgabePermanent, freeAccessToday, freeAccessLabel, onAuthStateChange = () => {} }) {
  const auth = useKontoAuth({ onAuthStateChange })
  const entriesRef = useRef(null)
  const activeCard = useActiveSnapCard(entriesRef)

  const scrollToCard = useCallback((index) => {
    const items = entriesRef.current?.querySelectorAll('.test-entry')
    items?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="test-page konto-tab">
      <div className="test-wrapper">
        <TabHeader />

        <nav className="test-raster" aria-label="Konto-Übersicht">
          <span className="test-raster-label" aria-hidden="true">Konto</span>
          <div className="test-raster-words">
            <span className="test-raster-word">
              {auth.isLoggedIn
                ? (auth.sessionData?.user?.name?.split(' ')[0] || 'Angemeldet')
                : 'Gast'}
            </span>
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">
              {gesamtausgabe ? 'Gesamtausgabe' : 'Basis'}
            </span>
          </div>
        </nav>

        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main>
          <ol className="test-entries" aria-label="Konto-Bereiche" ref={entriesRef}>
            
            {/* ① Zugang & Abonnement */}
            <KontoZugangBlock
              auth={auth}
              gesamtausgabe={gesamtausgabe}
              gesamtausgabePermanent={gesamtausgabePermanent}
              freeAccessToday={freeAccessToday}
              freeAccessLabel={freeAccessLabel}
            />

            {/* ② Registrierte Geräte */}
            <KontoGeraeteBlock
              isLoggedIn={auth.isLoggedIn}
              gesamtausgabePermanent={gesamtausgabePermanent}
            />

            {/* ③ Statistiken */}
            <KontoStatistikenBlock 
              isLoggedIn={auth.isLoggedIn}
            />

            {/* ④ Einstellungen */}
            <KontoEinstellungenBlock />

            {/* ⑤ Rechtliches & Info */}
            <KontoRechtlichesBlock />

          </ol>

          {/* ── Vertikale Badge-Navigation (nur mobil) ───────── */}
          <nav className="snap-nav" aria-label="Konto-Navigation">
            <div className="snap-nav-games">
              {['①','②','③','④','⑤'].map((glyph, i) => (
                <button
                  key={i}
                  className={`snap-nav-btn${activeCard === i ? ' snap-nav-btn--active' : ''}`}
                  aria-label={`Sektion ${i + 1}`}
                  aria-current={activeCard === i ? 'true' : undefined}
                  onClick={() => scrollToCard(i)}
                >{glyph}</button>
              ))}
            </div>
          </nav>
        </main>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Dein Konto und deine Einstellungen.</span>
        </div>
      </div>
    </div>
  )
}
