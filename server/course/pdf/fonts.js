/**
 * server/course/pdf/fonts.js
 *
 * Baut die `@font-face`-Deklarationen mit eingebetteten Schriften (Base64
 * data:-URI) aus public/fonts/. So sind die PDFs selbsttragend: identisches
 * Rendering in CI/lokal ohne System- oder Google-Fonts (DESIGN.md: Schriften
 * laufen lokal, kein CDN-Request).
 *
 * Einziger FS-Zugriff der PDF-Pipeline – bewusst hier isoliert, damit die
 * HTML-Builder (pdf/html.js) rein bleiben. Wird nur vom Renderer aufgerufen.
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = resolve(__dirname, '..', '..', '..', 'public', 'fonts')

// Reihenfolge spielt keine Rolle; unicode-range deckt latin + latin-ext.
const FACES = [
  { family: 'DM Sans',     weight: '100 900', style: 'normal', file: 'dm-sans-latin.woff2' },
  { family: 'DM Sans',     weight: '100 900', style: 'normal', file: 'dm-sans-latin-ext.woff2' },
  { family: 'Gentium Plus', weight: '400', style: 'normal', file: 'gentium-plus-400-latin.woff2' },
  { family: 'Gentium Plus', weight: '400', style: 'normal', file: 'gentium-plus-400-latin-ext.woff2' },
  { family: 'Gentium Plus', weight: '700', style: 'normal', file: 'gentium-plus-700-latin.woff2' },
  { family: 'Gentium Plus', weight: '700', style: 'normal', file: 'gentium-plus-700-latin-ext.woff2' },
  { family: 'Gentium Plus', weight: '400', style: 'italic', file: 'gentium-plus-400-italic-latin.woff2' },
]

let _cache = null

/**
 * @returns {string} CSS mit allen @font-face-Regeln (Base64-eingebettet).
 *   Fällt bei fehlenden Dateien auf leere Regeln zurück (Renderer nutzt dann
 *   System-Fallbacks; nie ein harter Fehler nur wegen Fonts).
 */
export function loadFontFaceCss() {
  if (_cache != null) return _cache
  const blocks = []
  for (const face of FACES) {
    try {
      const b64 = readFileSync(resolve(FONTS_DIR, face.file)).toString('base64')
      blocks.push(
        `@font-face{font-family:'${face.family}';font-style:${face.style};` +
        `font-weight:${face.weight};font-display:block;` +
        `src:url(data:font/woff2;base64,${b64}) format('woff2');}`,
      )
    } catch (err) {
      logger.warn({ err, file: face.file }, 'course/pdf: Font nicht ladbar – Fallback')
    }
  }
  _cache = blocks.join('\n')
  return _cache
}

export default loadFontFaceCss
