/**
 * server/course/pdf/render.js
 *
 * HTML → PDF via Playwright (Chromium). EINZIGER browserabhängiger Schritt der
 * Pipeline. Playwright wird LAZY importiert (dynamic import), damit der normale
 * Server-Runtime beim Start NIE Chromium lädt: PDFs sind kuratiertes, statisches
 * Material. Sie werden entweder per CLI/CI vorerzeugt ODER on-demand über den
 * Admin-Button (POST /admin/course/regenerate-pdfs) als Hintergrund-Job – dann
 * läuft Chromium einmalig auf dem Server. Der Browser liegt in einem festen
 * Cache (PLAYWRIGHT_BROWSERS_PATH, siehe OPS.md „Kurs-PDF-Generierung“), das
 * playwright-Paket ist dafür Prod-Dependency.
 *
 * Tooling-Begründung (Kurs-Umsetzung AP5): HTML/CSS gibt volle CD-Kontrolle (DM Sans,
 * Gentium, Rot/Gold, Querformat via @page) und triviale Fußnoten/Tabellen –
 * gegenüber pdfkit/pdf-lib (kein Layout-Engine) und wkhtmltopdf/WeasyPrint
 * (Fremd-Binary/Python, nicht im Stack).
 *
 * `preferCSSPageSize: true` ⇒ das @page-Format aus theme.js gewinnt (A4 hoch für
 * Dokumente, Querformat für Beamer) – kein doppeltes Größen-Setzen hier.
 */

import logger from '../../logger.js'
import { loadFontFaceCss } from './fonts.js'

/**
 * Bettet die Base64-Fonts in ein HTML-Dokument ein (vor </style> der ersten
 * <style>). So bleiben die HTML-Builder font-frei; erst hier werden die
 * @font-face-Regeln injiziert.
 */
function injectFonts(html) {
  const fontCss = loadFontFaceCss()
  if (!fontCss) return html
  return html.replace('<style>', `<style>${fontCss}\n`)
}

/**
 * Erzeugt einen wiederverwendbaren Renderer mit EINEM Browser für eine Charge.
 * @returns {Promise<{ render(html:string):Promise<Buffer>, close():Promise<void> }>}
 */
export async function createRenderer() {
  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch (err) {
    throw new Error(
      'Playwright-Paket nicht installiert. Auf dem Server: `npm ci --omit=dev` sollte es liefern ' +
      '(playwright ist Prod-Dependency). ' +
      `Ursprung: ${err.message}`,
    )
  }
  let browser
  try {
    // --no-sandbox: wir rendern ausschließlich unser eigenes, vertrauenswürdiges
    // Kurs-HTML (kein Nutzer-Input) auf einem Single-Tenant-VPS; der Chromium-
    // Sandbox-Setup (User-Namespaces/SUID) ist auf dem Hetzner-Host nicht nötig
    // und die häufigste Startfehlerquelle bei headless Chromium auf Servern.
    browser = await chromium.launch({ args: ['--no-sandbox'] })
  } catch (err) {
    throw new Error(
      'Chromium konnte nicht gestartet werden. Browser-Binary fehlt oder System-Libs nicht installiert. ' +
      'Einmalige Einrichtung siehe OPS.md „Kurs-PDF-Generierung“ ' +
      `(PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH || '(nicht gesetzt)'}). ` +
      `Ursprung: ${err.message}`,
    )
  }
  logger.info('course/pdf: Chromium gestartet')

  return {
    async render(html) {
      const page = await browser.newPage()
      try {
        await page.setContent(injectFonts(html), { waitUntil: 'networkidle' })
        return await page.pdf({ printBackground: true, preferCSSPageSize: true })
      } finally {
        await page.close()
      }
    },
    async close() {
      await browser.close()
      logger.info('course/pdf: Chromium beendet')
    },
  }
}

/** Bequemlichkeit: ein einzelnes HTML rendern (eigener Browser-Lifecycle). */
export async function htmlToPdf(html) {
  const r = await createRenderer()
  try {
    return await r.render(html)
  } finally {
    await r.close()
  }
}

export default { createRenderer, htmlToPdf }
