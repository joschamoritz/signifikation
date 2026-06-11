// Build-Guard: stellt sicher, dass ALLE gebauten JS/CSS/HTML-Dateien im
// Precache-Manifest des Service Workers gelandet sind.
//
// Hintergrund: vite.config.js setzt maximumFileSizeToCacheInBytes auf 512 KB.
// Waechst ein Chunk (z.B. vendor.js) darueber hinaus, faellt er STILL aus dem
// Precache — und genau die Mischversions-Invariante aus dem Kommentar in
// vite.config.js (alte JS-Chunks + frisches HTML nach Deploy) ist verletzt.
// Dieser Check macht das zum harten Build-Fehler.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = new URL('../dist', import.meta.url).pathname

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
// Inlined-Manifest: Workbox schreibt url:"..." bzw. {"url":"..."} Eintraege.
const manifestUrls = new Set(
  [...sw.matchAll(/"?url"?\s*:\s*"([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ''))
)

const wanted = walk(DIST)
  .map((p) => relative(DIST, p))
  .filter((p) => /\.(js|css|html|webmanifest)$/.test(p))
  // Der SW selbst und sein Registrierungs-Stub gehoeren nicht in den Precache
  .filter((p) => p !== 'sw.js' && p !== 'registerSW.js' && !p.startsWith('workbox-'))

const missing = wanted.filter((p) => !manifestUrls.has(p))

if (missing.length > 0) {
  console.error('FEHLER: Dateien fehlen im SW-Precache-Manifest (Limit in vite.config.js ueberschritten?):')
  for (const m of missing) {
    const size = statSync(join(DIST, m)).size
    console.error(`  - ${m} (${(size / 1024).toFixed(1)} KB)`)
  }
  process.exit(1)
}

console.log(`Precache-Guard OK: ${wanted.length} Dateien, alle im Manifest (${manifestUrls.size} Eintraege).`)
