import { useRef } from 'react'
import TabHeader from './TabHeader'
import { useKontoAuth } from '../hooks/useKontoAuth'
import KontoZugangBlock from './konto/KontoZugangBlock'
import KontoStatistikenBlock from './konto/KontoStatistikenBlock'
import KontoEinstellungenBlock from './konto/KontoEinstellungenBlock'
import KontoRechtlichesBlock from './konto/KontoRechtlichesBlock'

export default function KontoTab({ gesamtausgabe, onUnlock, onAuthStateChange = () => {} }) {
  const auth = useKontoAuth({ onAuthStateChange })
  const entriesRef = useRef(null)

  return (
    <div className="test-page konto-tab">
      <div className="test-wrapper">
        <TabHeader />

        <nav className="test-raster" aria-label="Konto-Übersicht">
          <span className="test-raster-label" aria-hidden="true">Konto</span>
          <div className="test-raster-words">
            <span className="test-raster-word">Profil</span>
          </div>
          <div className="test-raster-end">
            <span className="test-raster-folio" aria-hidden="true">Einstellungen</span>
          </div>
        </nav>

        <div className="test-rule--double" role="separator" aria-hidden="true" />

        <main>
          <ol className="test-entries" aria-label="Konto-Bereiche" ref={entriesRef}>
            
            {/* ① Zugang & Abonnement */}
            <KontoZugangBlock 
              auth={auth}
              gesamtausgabe={gesamtausgabe}
              onUnlock={onUnlock}
            />

            {/* ② Statistiken */}
            <KontoStatistikenBlock 
              isLoggedIn={auth.isLoggedIn}
            />

            {/* ③ Einstellungen */}
            <KontoEinstellungenBlock 
              isLoggedIn={auth.isLoggedIn}
            />

            {/* ④ Rechtliches & Info */}
            <KontoRechtlichesBlock />

          </ol>
        </main>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-edition">Dein Konto und deine Einstellungen.</span>
        </div>
      </div>
    </div>
  )
}
