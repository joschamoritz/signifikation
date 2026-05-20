import ExternalLink from './ExternalLink'

// Rechtliche Links – wird in zwei Varianten genutzt:
// - "compact" für den Mobile-Snap-Footer (Über/Impressum/Datenschutz)
// - "full"    für den Desktop-Kolophon (zusätzlich Nutzungsbedingungen)
// Mobile verwendet ExternalLink (Capacitor Browser-Plugin), Desktop interne
// <a>-Tags, weil die HTML-Seiten Teil der Web-App sind.

const PAGES = [
  { key: 'ueber',    label: 'Über',                      pathOnly: '/ueber.html',              full: 'https://signifikation.de/ueber.html' },
  { key: 'impressum', label: 'Impressum',                pathOnly: '/impressum.html',          full: 'https://signifikation.de/impressum.html' },
  { key: 'datenschutz', label: 'Datenschutz',            pathOnly: '/datenschutz.html',        full: 'https://signifikation.de/datenschutz.html' },
  { key: 'nutzung', label: 'Nutzungsbedingungen',        pathOnly: '/nutzungsbedingungen.html', full: 'https://signifikation.de/nutzungsbedingungen.html' },
]

export default function LegalLinks({ variant = 'compact', className = '' }) {
  if (variant === 'compact') {
    // Mobile: 3 Links, "Über" verkürzt
    return (
      <nav className={className || 'snap-footer-links'} aria-label="Rechtliche Links">
        <ExternalLink href={PAGES[0].full}>Über</ExternalLink>
        <ExternalLink href={PAGES[1].full}>Impressum</ExternalLink>
        <ExternalLink href={PAGES[2].full}>Datenschutz</ExternalLink>
      </nav>
    )
  }
  // Desktop: alle 4 Links, "Über die App"
  return (
    <nav className={className || 'legal-links'} aria-label="Rechtliche Links">
      <a href={PAGES[0].pathOnly}>Über die App</a>
      <a href={PAGES[1].pathOnly}>Impressum</a>
      <a href={PAGES[2].pathOnly}>Datenschutz</a>
      <a href={PAGES[3].pathOnly}>Nutzungsbedingungen</a>
    </nav>
  )
}
