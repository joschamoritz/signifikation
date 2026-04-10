import { lsGet } from '../utils/storage'

function PlaceholderScreen({ title, ipa, category, isPremium = true, definition, features, footer, children }) {
  return (
    <div className="tab-placeholder">
      <div className="tab-placeholder-inner">
        <hr className="tab-placeholder-rule" />
        <div className="tab-placeholder-head">
          <h2 className="tab-placeholder-title">{title}</h2>
          <span className="tab-placeholder-ipa">{ipa}</span>
        </div>
        <div className="tab-placeholder-grammar">
          <span className="tab-placeholder-pos">Bereich</span>
          <span className="tab-placeholder-rule-line" />
          <span className="tab-placeholder-category">{category}</span>
          {isPremium && <span className="test-entry-premium">Gesamtausgabe</span>}
        </div>
        <p className="tab-placeholder-definition">{definition}</p>
        {children}
        <ul className="tab-placeholder-features">
          {features.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
        <div className="tab-placeholder-footer">
          <span className="tab-placeholder-status">In Entwicklung.</span>
          <span className="tab-placeholder-edition">{footer ?? 'Erscheint in einer späteren Auflage.'}</span>
        </div>
      </div>
    </div>
  )
}

export function KlassenraumTab() {
  return (
    <PlaceholderScreen
      title="Klassenraum"
      ipa="[ˈklasənˌʀaʊ̯m]"
      category="Lehrkräfte"
      definition="Gemeinsame Spielsitzungen für Gruppen und Klassen. Kollaboratives Lernen mit Echtzeit-Vergleich und didaktischer Auswertung."
      features={[
        'Spielsitzung per Code starten — Lernende treten per Link bei',
        'Echtzeit-Vergleich der Gruppe während des Spiels',
        'Auswertung nach Spielmodus und Wort',
        'Export der Ergebnisse für Unterrichtsportfolio',
        'Anpassbare Wortlisten für eigene Unterrichtseinheiten',
      ]}
    />
  )
}

export function KursTab() {
  return (
    <PlaceholderScreen
      title="Kurs"
      ipa="[kʊʁs]"
      category="Didaktik"
      isPremium={false}
      definition="Didaktisch aufgebauter Einstieg in die Korpuslinguistik — von Wortarten über syntaktische Abhängigkeiten bis zur eigenen Korpusrecherche."
      features={[
        'Aufgabe 1 — Wortarten erkennen: Substantive, Verben, Adjektive in echten Texten farbig markieren',
        'Aufgabe 2 — Syntaktische Abhängigkeiten: Akkusativobjekt, Genitivattribut, Prädikativ verstehen',
        'Aufgabe 3 — Kollokationen ermitteln: für ein vorgegebenes Lemma die häufigsten Kollokationen schätzen',
        'Vertiefung — Korpuslinguistik: Wie entsteht ein Textkorpus? Was ist ein Dependenzparser?',
        'Mini-Recherche — eigene Abfrage in einem kleinen Beispielkorpus',
      ]}
      footer="Erscheint in einer späteren Auflage. Kostenlos verfügbar."
    />
  )
}

export function KontoTab({ gesamtausgabe, onUnlock }) {
  return (
    <div className="tab-placeholder">
      <div className="tab-placeholder-inner">
        <hr className="tab-placeholder-rule" />
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
          Dein Konto, dein Abonnement und deine Einstellungen. Login, Push-Benachrichtigungen und geräteübergreifende Synchronisation erscheinen in einer späteren Auflage.
        </p>

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
          <li>Kontoerstellung und Login (E-Mail oder SSO)</li>
          <li>Geräteübergreifender Spielfortschritt und Streak</li>
          <li>Gesamtausgabe-Abonnement verwalten und kündigen</li>
          <li>Spielhistorie der letzten 365 Tage</li>
          <li>Klassenraum-Sitzungen erstellen und verwalten</li>
          <li>Push-Benachrichtigungen – tägliche Erinnerung zum Spielen</li>
          <li>Erscheinungsbild und Sprache konfigurieren</li>
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
