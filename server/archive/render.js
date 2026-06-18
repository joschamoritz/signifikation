/**
 * server/archive/render.js
 *
 * Server-seitiges Rendering der indexierbaren Archiv-Seiten (SEO).
 * Reine String-Funktionen ohne DB-Zugriff – damit unit-testbar und ohne
 * Seiteneffekte. Die Datenschicht (server/archive/index.js) reicht ausschliesslich
 * bereits gewhitelistete "public entries" herein.
 *
 * R1/Datenschutz: Hier werden NUR oeffentliche Felder gerendert
 * (lemma, wortart, ipa, definitionen, Datum). Interne Felder
 * (runden/kollokatoren = LOESUNG, notiz, bonusFrage, rundenInfo, lueckenfueller,
 * link) gelangen gar nicht erst in diese Funktionen – siehe toPublicEntry().
 */

export const BASE_URL = 'https://signifikation.de'

/** HTML-Escape fuer Text-Knoten und Attribute. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Lemma → URL-Slug. Deutsche Umlaute werden transliteriert, damit die URL
 * ASCII-stabil und sprechend bleibt (/wort/oel statt /wort/%C3%B6l).
 */
export function slugifyLemma(lemma) {
  return String(lemma ?? '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // restliche Diakritika entfernen
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Baut aus einem (vollstaendigen) Lemma-Objekt ein oeffentliches Entry-Objekt.
 * Whitelist: was hier nicht explizit uebernommen wird, kann nie gerendert werden.
 */
export function toPublicEntry(lemma, dates = []) {
  let definitionen = Array.isArray(lemma?.definitionen)
    ? lemma.definitionen.filter((d) => typeof d === 'string' && d.trim())
    : []
  // Fallback auf das Einzelfeld `definition`, wenn die Liste leer/fehlt.
  if (!definitionen.length && typeof lemma?.definition === 'string' && lemma.definition.trim()) {
    definitionen = [lemma.definition.trim()]
  }
  return {
    slug: slugifyLemma(lemma?.lemma),
    lemma: String(lemma?.lemma ?? '').trim(),
    wortart: String(lemma?.wortart || lemma?.pos || '').trim(),
    ipa: String(lemma?.ipa ?? '').trim(),
    definitionen,
    dates: [...dates].sort(),
  }
}

/** Deutsches Langdatum aus ISO (YYYY-MM-DD). */
export function formatGermanDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!m) return ''
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
    'August', 'September', 'Oktober', 'November', 'Dezember']
  return `${Number(m[3])}. ${months[Number(m[2]) - 1]} ${m[1]}`
}

/** Gemeinsames HTML-Grundgeruest (Kopf + Pergament-Wrapper). */
function htmlDocument({ title, description, canonicalPath, jsonLd, bodyInner, robots }) {
  const ld = jsonLd
    // </script> im JSON-LD neutralisieren (XSS-Schutz im JSON-Kontext)
    ? `\n  <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c')}\n  </script>`
    : ''
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="${escapeHtml(robots || 'index, follow')}" />
  <link rel="canonical" href="${BASE_URL}${canonicalPath}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${BASE_URL}${canonicalPath}" />
  <meta property="og:site_name" content="Signifikation" />${ld}
  <link rel="stylesheet" href="/static.css" />
</head>
<body>
<div class="wrapper">
${bodyInner}
</div>
</body>
</html>
`
}

/** Gemeinsamer Footer (Kolophon + Rechtliches). */
function footer() {
  return `  <footer>
    <span class="ornament">· · ·</span>
    <nav class="legal">
      <a href="/">Zur App</a>
      <a href="/archiv">Archiv</a>
      <a href="/ueber.html">Über die App</a>
      <a href="/impressum.html">Impressum</a>
    </nav>
  </footer>`
}

/**
 * Einzelseite fuer ein Lemma: /wort/:slug
 * entry = Ergebnis von toPublicEntry(); siblings = [{ slug, lemma }] fuer interne Links.
 */
export function renderWortPage(entry, siblings = []) {
  const defs = entry.definitionen.length ? entry.definitionen : []
  const primaryDef = defs[0] || ''
  const title = `${entry.lemma}${entry.wortart ? ', ' + entry.wortart : ''} – Bedeutung | Signifikation`
  const description = primaryDef
    ? `${entry.lemma}${entry.wortart ? ' (' + entry.wortart + ')' : ''}: ${primaryDef} — Wörterbuch-Eintrag aus dem Signifikation-Archiv.`
    : `${entry.lemma}: Wörterbuch-Eintrag aus dem Signifikation-Archiv, dem täglichen linguistischen Quiz aus eigenen Korpusdaten.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: entry.lemma,
    ...(primaryDef ? { description: primaryDef } : {}),
    ...(entry.wortart ? { termCode: entry.wortart } : {}),
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: 'Signifikation – Wörterbuch-Archiv',
      url: `${BASE_URL}/archiv`,
    },
    url: `${BASE_URL}/wort/${entry.slug}`,
  }

  const defsHtml = defs.length
    ? `<ol class="arc-defs${defs.length === 1 ? ' single' : ''}">${defs.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ol>`
    : ''

  const datesHtml = entry.dates.length
    ? `<p class="arc-meta">Im Signifikation-Archiv${entry.dates.length > 1 ? ' u. a.' : ''} am ${escapeHtml(formatGermanDate(entry.dates[entry.dates.length - 1]))}.</p>`
    : ''

  const relatedHtml = siblings.length
    ? `<nav class="arc-related" aria-label="Weitere Einträge">
    <p class="arc-related-label">Weitere Einträge</p>
    <ul>${siblings.map((s) => `<li><a href="/wort/${escapeHtml(s.slug)}">${escapeHtml(s.lemma)}</a></li>`).join('')}</ul>
  </nav>`
    : ''

  const bodyInner = `  <a class="back" href="/archiv">‹ Archiv</a>

  <article class="arc-entry">
    <p class="arc-overline">Wörterbuch-Archiv</p>
    <h1 class="arc-headword">${escapeHtml(entry.lemma)}${entry.ipa ? ` <span class="arc-ipa">[${escapeHtml(entry.ipa)}]</span>` : ''}</h1>
    ${entry.wortart ? `<span class="arc-pos">${escapeHtml(entry.wortart)}</span>` : ''}
    ${defsHtml}
    ${datesHtml}
    <p class="arc-play"><a href="/">Heutiges Wort spielen →</a></p>
  </article>
${relatedHtml}
${footer()}`

  return htmlDocument({
    title,
    description,
    canonicalPath: `/wort/${entry.slug}`,
    jsonLd,
    bodyInner,
  })
}

/**
 * Index-Seite /archiv: alphabetisch gruppierte Liste aller Eintraege.
 * entries = [toPublicEntry(...)] (bereits oeffentlich).
 */
export function renderArchivIndex(entries) {
  const sorted = [...entries].sort((a, b) => a.lemma.localeCompare(b.lemma, 'de'))
  const title = 'Archiv – Wörterbuch-Einträge | Signifikation'
  const description = `Das vollständige Wörterbuch-Archiv von Signifikation: ${sorted.length} Einträge aus dem täglichen linguistischen Quiz, mit Definition und Lautschrift.`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Signifikation – Wörterbuch-Archiv',
    url: `${BASE_URL}/archiv`,
    description: 'Alle bisher gespielten Wörter mit Bedeutung und Lautschrift.',
  }

  let groups = ''
  let currentLetter = ''
  for (const e of sorted) {
    const letter = (e.lemma[0] || '#').toUpperCase()
    if (letter !== currentLetter) {
      if (currentLetter) groups += `</ul>`
      currentLetter = letter
      groups += `<p class="arc-group-letter">${escapeHtml(letter)}</p><ul class="arc-index-list">`
    }
    const def = e.definitionen[0] || ''
    groups += `<li><a href="/wort/${escapeHtml(e.slug)}"><span class="arc-index-word">${escapeHtml(e.lemma)}${e.ipa ? ` <span class="arc-ipa">[${escapeHtml(e.ipa)}]</span>` : ''}</span>${def ? `<span class="arc-index-def">${escapeHtml(def)}</span>` : ''}</a></li>`
  }
  if (currentLetter) groups += `</ul>`

  const bodyInner = `  <a class="back" href="/">‹ Zur App</a>

  <header>
    <p class="overline">Tägliches Wortspiel · Linguistik</p>
    <h1>Archiv</h1>
    <p class="subtitle">Alle bisher gespielten Wörter — Bedeutung &amp; Lautschrift</p>
  </header>

  <hr class="rule-double" />
${sorted.length ? groups : '<p class="arc-meta">Noch keine Archiv-Einträge.</p>'}
${footer()}`

  return htmlDocument({
    title,
    description,
    canonicalPath: '/archiv',
    jsonLd,
    bodyInner,
  })
}

/** robots-„noindex"-404 fuer unbekannte Slugs. */
export function renderNotFound() {
  const bodyInner = `  <a class="back" href="/archiv">‹ Archiv</a>
  <header>
    <p class="overline">Wörterbuch-Archiv</p>
    <h1>Eintrag nicht gefunden</h1>
    <p class="subtitle">Dieses Wort ist (noch) nicht im Archiv.</p>
  </header>
  <hr class="rule-double" />
  <p class="arc-play"><a href="/archiv">Zum vollständigen Archiv →</a></p>
${footer()}`
  return htmlDocument({
    title: 'Nicht gefunden – Signifikation',
    description: 'Dieser Archiv-Eintrag existiert nicht.',
    canonicalPath: '/archiv',
    jsonLd: null,
    bodyInner,
    robots: 'noindex, follow',
  })
}

/** sitemap.xml-Inhalt aus statischen Pfaden + Archiv-Slugs. */
export function renderSitemap(slugs, lastmod) {
  const today = lastmod || new Date().toISOString().slice(0, 10)
  const url = (loc, freq, prio, mod) =>
    `  <url>\n    <loc>${BASE_URL}${loc}</loc>\n    <lastmod>${mod || today}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n  </url>`
  const staticUrls = [
    url('/', 'daily', '1.0'),
    url('/archiv', 'daily', '0.8'),
    url('/ueber.html', 'monthly', '0.5'),
  ]
  const wortUrls = slugs.map((s) => url(`/wort/${s}`, 'monthly', '0.6'))
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...wortUrls].join('\n')}\n</urlset>\n`
}
