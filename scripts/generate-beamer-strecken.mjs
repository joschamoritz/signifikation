// CLI: erzeugt die Querformat-Beamer-Folien (16:9) je Station aus den vier
// Strecken der Instagram-Vorlage (tools/instagram-kollokation.html als Basis).
// Live-Werte aus wortprofil.db, Export als PDF. Schwester von pdf:course.
//
//   node scripts/generate-beamer-strecken.mjs [--lemma <Wort>] [--out <dir>] [--html]
//
// --lemma  Anker-Substantiv für die Live-Kollokationen/logDice-Werte (Default „Haar")
// --out    Zielordner (Default server/data/beamer-pdfs)
// --html   zusätzlich die HTML-Decks schreiben (Browser-Vorschau)
//
// Voraussetzung: wortprofil.db vorhanden + `npx playwright install chromium`.
// NICHT für den Server-Runtime gedacht (Playwright/Chromium-Abhängigkeit) –
// PDFs werden vorerzeugt, analog scripts/generate-course-pdfs.mjs.

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import logger from '../server/logger.js'
import { getCorpusData, fmtBytes } from '../server/course/beamer/corpus.js'
import { buildDeckHtml } from '../server/course/beamer/strecken.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const next = process.argv[i + 1]
  return next && !next.startsWith('--') ? next : true
}

const lemma = typeof arg('lemma') === 'string' ? arg('lemma') : 'Haar'
const outDir = typeof arg('out') === 'string'
  ? resolve(arg('out'))
  : resolve(__dirname, '..', 'server', 'data', 'beamer-pdfs')
const alsoHtml = arg('html') === true

async function main() {
  const data = getCorpusData(lemma)
  if (!data.ok) {
    throw new Error(`Keine ausreichenden Korpus-Werte für „${lemma}" (mind. 4 Adjektiv-Attribute nötig).`)
  }
  const dbSize = fmtBytes(data.db.bytes)
  logger.info({ lemma, dbSize, strong: data.strong.word, weak: data.weak.word },
    'beamer: Live-Werte geladen')

  const decks = [buildDeckHtml('1', data, dbSize), buildDeckHtml('4', data, dbSize)]
  mkdirSync(outDir, { recursive: true })

  const { createRenderer } = await import('../server/course/pdf/render.js')
  const renderer = await createRenderer()
  const manifest = []
  try {
    for (const deck of decks) {
      if (alsoHtml) {
        const htmlPath = join(outDir, deck.filename.replace(/\.pdf$/, '.html'))
        writeFileSync(htmlPath, deck.html)
      }
      const pdf = await renderer.render(deck.html)
      const filePath = join(outDir, deck.filename)
      writeFileSync(filePath, pdf)
      manifest.push({ filename: deck.filename, path: filePath, bytes: pdf.length })
      logger.info({ filename: deck.filename, bytes: pdf.length }, 'beamer: PDF geschrieben')
    }
  } finally {
    await renderer.close()
  }
  return manifest
}

main()
  .then(manifest => {
    for (const m of manifest) logger.info(`✓ ${m.filename} (${(m.bytes / 1024).toFixed(0)} KB)`)
    logger.info(`Fertig: ${manifest.length} Beamer-PDF(s) in ${outDir}`)
    process.exit(0)
  })
  .catch(err => {
    logger.error({ err }, 'Beamer-Erzeugung fehlgeschlagen')
    process.exit(1)
  })
