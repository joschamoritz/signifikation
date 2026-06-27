import LegalLinks from './LegalLinks'

// Geteilter Desktop-Kolophon (Footer) für Tab-Seiten ohne eigene Tagesabschluss-
// Ornamentik (Kurs, Klassenraum). Bewusst ohne Spiel-Status — anders als der
// Home-Footer in Home.jsx, der das Tages-Ornament trägt. Per CSS nur Desktop
// (.test-colophon--standalone wird im Mobile-Media-Query ausgeblendet), passend
// dazu, dass dieser Footer bislang nur auf der Spielmodi-Startseite erscheint.
export default function Colophon() {
  return (
    <footer className="test-colophon test-colophon--standalone" role="contentinfo">
      <p className="feedback-hint colophon-feedback">
        Fehler oder Anregungen? <a href="mailto:info@signifikation.de">Schreib uns.</a>
      </p>
      <LegalLinks variant="full" />
      <p className="test-colophon-edition">
        v{__APP_VERSION__} · {__BUILD_DATE__}
      </p>
    </footer>
  )
}
