import { istWebLink, openUrl } from '../utils/openUrl'

/**
 * Externer Link – funktioniert korrekt in Web und nativer App (Capacitor Browser-Plugin).
 * Ersetzt <a href="..." target="_blank"> für alle externen URLs.
 * Ohne http(s)-Adresse bleibt nur der Text stehen (kein href, kein Öffnen).
 */
export default function ExternalLink({ href, className, children, ...props }) {
  const ziel = istWebLink(href) ? href : undefined

  function handleClick(e) {
    e.preventDefault()
    if (ziel) openUrl(ziel)
  }

  return (
    <a
      href={ziel}
      onClick={handleClick}
      className={className}
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  )
}
