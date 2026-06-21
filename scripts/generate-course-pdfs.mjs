// CLI: erzeugt die Kurs-PDFs (Arbeitsblatt/Lösung je Niveau, Unterrichtsentwurf,
// Beamer) für Station ①. Vorgesehen für lokale Ausführung / CI – NICHT für den
// Server-Runtime (Playwright/Chromium-Abhängigkeit).
//
//   node scripts/generate-course-pdfs.mjs [--out <dir>] [--lemma <Wort>] [--register]
//
// --out      Zielordner (Default server/data/course-pdfs)
// --lemma    „Eigenes Lemma": überschreibt das Anker-Lemma der corpus-Templates
// --register course_materials-Zeilen anlegen/aktualisieren (schreibt in die DB)
//
// Voraussetzung: wortprofil.db + belege.db vorhanden (sonst leere Korpuswerte,
// strukturell gültiges Material) und `npx playwright install chromium`.

import { generateStationPdfs } from '../server/course/pdf/generate.js'
import logger from '../server/logger.js'

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const opts = {
  outDir: typeof arg('out') === 'string' ? arg('out') : undefined,
  lemma: typeof arg('lemma') === 'string' ? arg('lemma') : undefined,
  register: arg('register') === true,
}

generateStationPdfs(opts)
  .then(manifest => {
    for (const m of manifest) {
      logger.info(`✓ ${m.filename} (${(m.bytes / 1024).toFixed(0)} KB)`)
    }
    logger.info(`Fertig: ${manifest.length} PDF(s) erzeugt.`)
    process.exit(0)
  })
  .catch(err => {
    logger.error({ err }, 'Kurs-PDF-Erzeugung fehlgeschlagen')
    process.exit(1)
  })
