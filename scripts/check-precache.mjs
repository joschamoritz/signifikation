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
import { fileURLToPath } from 'node:url'

// fileURLToPath statt .pathname – auf Windows liefert .pathname einen
// fuehrenden Slash ("/D:/...") der join() zu einem doppelten Laufwerksbuchstaben fuehrt.
const DIST = fileURLToPath(new URL('../dist', import.meta.url))

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
  // relative() liefert auf Windows Backslash-Pfade, die nicht mit den
  // Workbox-Manifest-URLs (immer Forward-Slash) uebereinstimmen.
  .map((p) => relative(DIST, p).replace(/\\/g, '/'))
  .filter((p) => /\.(js|css|html|webmanifest)$/.test(p))
  // Der SW selbst und sein Registrierungs-Stub gehoeren nicht in den Precache
  .filter((p) => p !== 'sw.js' && p !== 'registerSW.js' && !p.startsWith('workbox-'))
  // realtime-vendor (socket.io) ist bewusst per globIgnores aus dem Precache
  // ausgenommen (siehe vite.config.js) — Runtime-Cache via StaleWhileRevalidate.
  // Muss daher hier ebenfalls uebersprungen werden, sonst false-positiver Fehler.
  .filter((p) => !/(^|\/)realtime-vendor-[^/]*\.js$/.test(p))

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
