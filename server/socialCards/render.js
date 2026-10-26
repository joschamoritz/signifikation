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
 *
 * Je Karte entstehen zwei Fassungen im selben Seitenkontext: die volle (zum
 * Posten und Herunterladen) und eine kleine Vorschau (Breite 432 px) für die
 * Entwurfsliste im Admin – ein zweiter Browserstart ist dafür nicht nötig.
 */

// window/document gibt es nur in den Funktionen, die page.evaluate im Browser ausführt.
/* global window, document */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import logger from '../logger.js'

/** Breite der kleinen Vorschau; die Höhe folgt dem Seitenverhältnis (4:5 → 432 × 540). */
export const KLEIN_BREITE = 432

/** Höchstdauer für das Zeichnen einer Karte; danach wird der Browser beendet (hängende Seite). */
export const ZEICHEN_ZEITLIMIT_MS = 30_000

/**
 * Wartet auf `promise`, höchstens `ms`. Bei Ablauf wird `beiAblauf` aufgerufen (Browser schließen)
 * und mit einer verständlichen Meldung abgelehnt. Der Timer wird immer aufgeräumt.
 */
export async function mitZeitlimit(promise, ms, text, beiAblauf = async () => {}) {
  let timer
  const ablauf = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${text} dauerte länger als ${Math.round(ms / 1000)} s`), { zeitlimit: true })), ms)
  })
  try {
    return await Promise.race([promise, ablauf])
  } catch (err) {
    if (err?.zeitlimit) {
      promise.catch(() => {}) // später ablehnende Seite nicht unbehandelt lassen
      await Promise.resolve(beiAblauf()).catch(() => {})
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

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
 * @returns {Promise<{ render(spec:object):Promise<{ gross:Buffer, klein:Buffer }>, close():Promise<void> }>}
 */
export async function createCardRenderer({ zeitlimitMs = ZEICHEN_ZEITLIMIT_MS } = {}) {
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
    // Alles Nötige steckt in der Seite (Schriften als data:-URIs, Skript inline): Nichts darf nachgeladen werden
    await page.route('**/*', (route) => route.abort())
    const quelle = readFileSync(KARTEN_JS, 'utf8')
    await page.addScriptTag({ type: 'module', content: `${quelle}\nwindow.__karten = { drawCard, cardDims, loadCardFonts }` })
    await page.waitForFunction(() => window.__karten)
    logger.info('socialCards: Chromium gestartet')

    return {
      async render(spec) {
        const zeichnen = page.evaluate(async ({ s, kleinBreite }) => {
          const K = window.__karten
          await K.loadCardFonts(document.fonts)
          const canvas = document.getElementById('karte')
          const { W, H } = K.cardDims(s.ratio)
          canvas.width = W; canvas.height = H
          K.drawCard(canvas.getContext('2d'), s)
          const klein = document.createElement('canvas')
          klein.width = kleinBreite
          klein.height = Math.round(kleinBreite * H / W)
          const kctx = klein.getContext('2d')
          kctx.imageSmoothingEnabled = true
          kctx.imageSmoothingQuality = 'high'
          kctx.drawImage(canvas, 0, 0, klein.width, klein.height)
          return { gross: canvas.toDataURL('image/png'), klein: klein.toDataURL('image/png') }
        }, { s: spec, kleinBreite: KLEIN_BREITE })
        const urls = await mitZeitlimit(zeichnen, zeitlimitMs, 'Zeichnen der Karte', () => browser.close())
        const png = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64')
        return { gross: png(urls.gross), klein: png(urls.klein) }
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
