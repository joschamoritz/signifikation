/**
 * Wiktionary-Utility: holt IPA und Bedeutungen für ein deutsches Lemma.
 * Verwendet die MediaWiki-API (Wikitext-Parse), damit IPA-Vorlage und
 * Bedeutungs-Einträge strukturiert ausgelesen werden können.
 */

import logger from './logger.js'

const USER_AGENT = 'Signifikation/1.0 (signifikation.de; Bildungsprojekt)'

/**
 * Bereinigt einen Wikitext-Abschnitt:
 * – entfernt Templates {{...}}
 * – löst Wikilinks [[link|Text]] → Text und [[link]] → link auf
 * – entfernt '' / ''' (Kursiv/Fett-Markup)
 */
function cleanWikitext(text) {
  return text
    .replace(/\{\{[^}]*\}\}/g, '')                         // {{Template}} entfernen
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')     // [[link|text]] oder [[link]]
    .replace(/'''([^']+)'''/g, '$1')                       // '''fett'''
    .replace(/''([^']+)''/g, '$1')                         // ''kursiv''
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Fetcht IPA + Bedeutungen für `lemma` aus der deutschen Wiktionary.
 * @param {string} lemma
 * @returns {Promise<{ ipa: string, definitionen: string[] }>}
 */
export async function fetchWiktionary(lemma) {
  if (!lemma || typeof lemma !== 'string' || lemma.trim().length === 0 || lemma.length > 200) {
    return { ipa: '', definitionen: [] }
  }
  try {
    const url =
      `https://de.wiktionary.org/w/api.php` +
      `?action=parse&page=${encodeURIComponent(lemma)}&prop=wikitext&format=json&formatversion=2`

    const r = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': USER_AGENT },
    })

    if (!r.ok) return { ipa: '', definitionen: [] }

    const data     = await r.json()
    const wikitext = data.parse?.wikitext ?? ''

    // ── IPA ──────────────────────────────────────────────────────────────────
    const ipaMatch = wikitext.match(/\{\{Lautschrift\|([^|}]+)\}\}/)
    const ipa = ipaMatch?.[1] ?? ''

    // ── Bedeutungen ───────────────────────────────────────────────────────────
    // Den {{Bedeutungen}}-Block per Regex herausschneiden, dann Einträge extrahieren.
    // Robuster als ein Zeilenstatus-Automat: Template-Parameter und verschachtelte
    // Templates in Sektionsmarkern führen nicht mehr zu falschen Treffern.
    const definitionen = []
    const block = wikitext.match(
      /\{\{Bedeutungen[^}]*\}\}([\s\S]*?)(?=\n\{\{[A-ZÄÖÜ\w]|\n={2,}|$)/
    )?.[1] ?? ''
    for (const line of block.split('\n')) {
      const m = line.match(/^:\[(\d+[a-z]?)\]\s*(.+)$/)
      if (!m) continue
      const text = cleanWikitext(m[2])
      if (text.length > 2) definitionen.push(`[${m[1]}] ${text}`)
    }

    return { ipa, definitionen }
  } catch (err) {
    logger.warn({ err, lemma }, 'fetchWiktionary: Fehler beim Abrufen')
    return { ipa: '', definitionen: [] }
  }
}
