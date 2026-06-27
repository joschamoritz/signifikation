// CLI: erzeugt die Kurs-PDFs (Arbeitsblatt/Lösung je Niveau, Unterrichtsentwurf,
// Beamer) für eine oder alle Stationen. Vorgesehen für lokale Ausführung / CI –
// NICHT für den Server-Runtime (Playwright/Chromium-Abhängigkeit).
//
//   node scripts/generate-course-pdfs.mjs [--station <1-5|all>] [--out <dir>] [--lemma <Wort>] [--register]
//
// --station  Station 1–5 oder "all" (Default: 1)
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

function parseStation(raw) {
  if (!raw || raw === true) return 1
  if (raw === 'all') return 'all'
  const n = Number(raw)
  if (Number.isInteger(n) && n >= 1 && n <= 5) return n
  logger.error({ raw }, '--station muss 1–5 oder "all" sein'); process.exit(1)
}

const opts = {
  stationNo: parseStation(arg('station')),
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
