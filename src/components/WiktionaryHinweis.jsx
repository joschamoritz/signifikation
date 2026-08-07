import ExternalLink from './ExternalLink'

/**
 * Lizenzhinweis für übernommene Wiktionary-Inhalte (Bedeutungen, Lautschrift).
 *
 * de.wiktionary.org steht unter CC BY-SA 4.0. Die Lizenz verlangt
 * Namensnennung, Lizenzangabe mit Link und einen Hinweis auf Bearbeitungen —
 * wir übernehmen die Bedeutungen gekürzt und ohne Wikitext-Markup.
 *
 * Überall dort einsetzen, wo Bedeutungen oder Lautschrift angezeigt werden.
 * Ohne `lemma` verweist der Hinweis auf die Wiktionary-Startseite, mit `lemma`
 * direkt auf den konkreten Eintrag.
 */
export default function WiktionaryHinweis({ lemma = null, className = '' }) {
  const href = lemma
    ? `https://de.wiktionary.org/wiki/${encodeURIComponent(String(lemma).trim())}`
    : 'https://de.wiktionary.org/'

  return (
    <p className={`wiktionary-hinweis${className ? ` ${className}` : ''}`}>
      Bedeutungen und Lautschrift:{' '}
      <ExternalLink href={href}>Wiktionary</ExternalLink>
      {', gekürzt · '}
      <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/deed.de">
        CC BY-SA 4.0
      </ExternalLink>
    </p>
  )
}
