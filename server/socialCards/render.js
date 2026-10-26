/**
 * server/socialCards/render.js
 *
 * spec → PNG über Playwright/Chromium. Die Karte zeichnet derselbe Code wie im
 * Admin-Editor (shared/socialCards.js) auf ein echtes <canvas>, mit denselben
 * selbst gehosteten Schriften (public/fonts/fonts.css, als data:-URIs
 * eingebettet). So sehen Vorschau und Entwurf pixelgleich aus.
 *
 * Playwright wird wie bei den Kurs-PDFs (course/pdf/render.js) erst beim
 * ersten Rendern geladen; Browser-Setup auf dem Server siehe OPS.md
 * „Kurs-PDF-Generierung“. Ein Renderer hält EINEN Browser für eine Charge.
 */

// window/document gibt es nur in den Funktionen, die page.evaluate im Browser ausführt.
/* global window, document */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = resolve(__dirname, '..', '..', 'public', 'fonts')
const KARTEN_JS = resolve(__dirname, '..', '..', 'shared', 'socialCards.js')

/** fonts.css mit eingebetteten Dateien – unicode-range bleibt wie im Browser erhalten. */
function fontCss() {
  const css = readFileSync(resolve(FONTS_DIR, 'fonts.css'), 'utf8')
  return css.replace(/url\('\/fonts\/([\w.-]+\.woff2)'\)/g, (_m, datei) =>
    `url(data:font/woff2;base64,${readFileSync(resolve(FONTS_DIR, datei)).toString('base64')})`)
}

function seitenHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}</style></head>` +
    '<body style="margin:0"><canvas id="karte"></canvas></body></html>'
}

/**
 * @returns {Promise<{ render(spec:object):Promise<Buffer>, close():Promise<void> }>}
 */
export async function createCardRenderer() {
  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch (err) {
    throw new Error(`Playwright-Paket nicht installiert (Prod-Dependency). Ursprung: ${err.message}`)
  }
  let browser
  try {
    // --no-sandbox wie bei den Kurs-PDFs: nur eigenes HTML, Single-Tenant-VPS.
    browser = await chromium.launch({ args: ['--no-sandbox'] })
  } catch (err) {
    throw new Error(
      'Chromium konnte nicht gestartet werden. Einrichtung siehe OPS.md „Kurs-PDF-Generierung“ ' +
      `(PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH || '(nicht gesetzt)'}). Ursprung: ${err.message}`,
    )
  }

  try {
    const page = await browser.newPage()
    await page.setContent(seitenHtml())
    const quelle = readFileSync(KARTEN_JS, 'utf8')
    await page.addScriptTag({ type: 'module', content: `${quelle}\nwindow.__karten = { drawCard, cardDims, loadCardFonts }` })
    await page.waitForFunction(() => window.__karten)
    logger.info('socialCards: Chromium gestartet')

    return {
      async render(spec) {
        const dataUrl = await page.evaluate(async (s) => {
          const K = window.__karten
          await K.loadCardFonts(document.fonts)
          const canvas = document.getElementById('karte')
          const { W, H } = K.cardDims(s.ratio)
          canvas.width = W; canvas.height = H
          K.drawCard(canvas.getContext('2d'), s)
          return canvas.toDataURL('image/png')
        }, spec)
        return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')
      },
      async close() {
        await browser.close()
        logger.info('socialCards: Chromium beendet')
      },
    }
  } catch (err) {
    await browser.close().catch(() => {})
    throw err
  }
}

export default { createCardRenderer }
