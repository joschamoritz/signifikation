/**
 * server/course/pdf/render.js
 *
 * HTML → PDF via Playwright (Chromium). EINZIGER browserabhängiger Schritt der
 * Pipeline. Playwright wird LAZY importiert (dynamic import), damit der normale
 * Server-Runtime auf Hetzner NIE Chromium lädt: PDFs sind kuratiertes,
 * statisches Material und werden per CLI/CI vorerzeugt (als Datei abgelegt,
 * referenziert über course_materials.file_ref), nicht pro Request gerendert.
 *
 * Tooling-Begründung (Kurs-Umsetzung AP5): Playwright ist bereits devDependency
 * (E2E-Tests) → kein neuer Prod-Dep. HTML/CSS gibt volle CD-Kontrolle (DM Sans,
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
      'Playwright nicht verfügbar. Für die PDF-Erzeugung: `npm i -D playwright` + `npx playwright install chromium`. ' +
      `Ursprung: ${err.message}`,
    )
  }
  const browser = await chromium.launch()
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
