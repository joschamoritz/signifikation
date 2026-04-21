import TabHeader from './TabHeader'
import KontoAuthCard from './konto/KontoAuthCard'
import { useKontoAuth } from '../hooks/useKontoAuth'

const KONTO_FEATURES = [
  'Kontoerstellung und Login (E-Mail) verfuegbar',
  'Geräteübergreifender Spielfortschritt und Streak',
  'Gesamtausgabe-Abonnement verwalten und kündigen',
  'Spielhistorie der letzten 365 Tage',
  'Klassenraum-Sitzungen erstellen und verwalten',
  'Push-Benachrichtigungen – tägliche Erinnerung zum Spielen',
  'Erscheinungsbild und Sprache konfigurieren',
]

export default function KontoTab({ gesamtausgabe, onUnlock, onAuthStateChange = () => {} }) {
  const auth = useKontoAuth({ onAuthStateChange })

  return (
    <div className="tab-placeholder">
      <TabHeader />
      <div className="tab-placeholder-inner">
        <div className="tab-placeholder-head">
          <h2 className="tab-placeholder-title">Konto</h2>
          <span className="tab-placeholder-ipa">[ˈkɔnto]</span>
        </div>
        <div className="tab-placeholder-grammar">
          <span className="tab-placeholder-pos">Bereich</span>
          <span className="tab-placeholder-rule-line" />
          <span className="tab-placeholder-category">Einstellungen</span>
        </div>
        <p className="tab-placeholder-definition">
          Dein Konto, dein Abonnement und deine Einstellungen. Anmeldung und Registrierung sind jetzt verfuegbar; weitere Kontofunktionen folgen schrittweise.
        </p>

        <KontoAuthCard {...auth} />

        <div className="tab-placeholder-unlock-status">
          {gesamtausgabe ? (
            <>
              <span className="tab-placeholder-unlock-check">✓</span>
              <span className="tab-placeholder-unlock-label">Gesamtausgabe freigeschaltet</span>
              <span className="tab-placeholder-unlock-sub">kostenlos bis Paywall aktiv</span>
            </>
          ) : (
            <>
              <span className="tab-placeholder-unlock-label">Gesamtausgabe nicht freigeschaltet</span>
              <button
                className="test-cta test-cta--locked"
                type="button"
                onClick={onUnlock}
                style={{ marginLeft: 'auto', fontSize: '0.75rem', padding: '3px 10px' }}
              >
                Freischalten
              </button>
            </>
          )}
        </div>

        <ul className="tab-placeholder-features">
          {KONTO_FEATURES.map((feature) => <li key={feature}>{feature}</li>)}
        </ul>

        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-status">In Entwicklung.</span>
          <span className="tab-placeholder-edition">Erscheint in einer späteren Auflage.</span>
        </div>

        <nav className="tab-profil-legal" aria-label="Rechtliche Links">
          <a href="/ueber.html" target="_blank" rel="noopener">Über die App</a>
          <a href="/impressum.html" target="_blank" rel="noopener">Impressum</a>
          <a href="/datenschutz.html" target="_blank" rel="noopener">Datenschutz</a>
          <a href="/nutzungsbedingungen.html" target="_blank" rel="noopener">Nutzungsbedingungen</a>
        </nav>
      </div>
    </div>
  )
}
