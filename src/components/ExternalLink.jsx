import { openUrl } from '../utils/openUrl'

/**
 * Externer Link – funktioniert korrekt in Web und nativer App (Capacitor Browser-Plugin).
 * Ersetzt <a href="..." target="_blank"> für alle externen URLs.
 */
export default function ExternalLink({ href, className, children, ...props }) {
  function handleClick(e) {
    e.preventDefault()
    if (href) openUrl(href)
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  )
}
