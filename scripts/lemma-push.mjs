// Schickt geplante Tage als Entwürfe ins Postfach des Admin-Panels.
//
//   npm run lemma:push -- planning/lemma-import-2026-10-26_bis_11-01.json
//
// Die Datei ist ein Array von Tagen im Format von POST /admin/tag (das bisherige
// Import-JSON). Im Kalender landet dadurch nichts: Übernommen wird im
// Admin-Panel unter „Vorschläge".
//
// Liest LEMMA_API_KEY und optional LEMMA_API_URL aus der .env (Schlüssel
// erzeugen: npm run lemma:key).
import '../server/env.js'
import { readFileSync } from 'node:fs'

const datei = process.argv[2]
if (!datei) {
  console.error('Aufruf: npm run lemma:push -- <datei.json>')
  process.exit(1)
}

const schluessel = process.env.LEMMA_API_KEY
if (!schluessel) {
  console.error('LEMMA_API_KEY fehlt in der .env. Erst npm run lemma:key ausführen.')
  process.exit(1)
}
const basis = (process.env.LEMMA_API_URL || 'https://signifikation.de').replace(/\/$/, '')

// Ältere Exporte beginnen mit einer Kopfzeile „--- ADMIN-JSON-EXPORT ---".
const roh = readFileSync(datei, 'utf8').replace(/^---[^\n]*---\s*/m, '').trim()
let geparst
try {
  geparst = JSON.parse(roh)
} catch (err) {
  console.error(`Kein gültiges JSON: ${err.message}`)
  process.exit(1)
}
const tage = Array.isArray(geparst) ? geparst : geparst?.tage
if (!Array.isArray(tage) || tage.length === 0 || tage.some((tag) => !tag?.datum)) {
  console.error('Erwartet wird ein Array von Tagen, jeder mit „datum".')
  process.exit(1)
}

const ziel = `${basis}/api/v1/lemma-entwuerfe`
console.log(`Sende ${tage.length} Tage (${tage[0].datum} bis ${tage.at(-1).datum}) an ${ziel} …`)

let antwort
try {
  antwort = await fetch(ziel, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${schluessel}`,
      // CSRF-Schutz auf /api verlangt diesen Header (server/middleware/auth.js).
      'x-requested-with': 'signifikation-app',
    },
    body: JSON.stringify({ tage }),
    signal: AbortSignal.timeout(30_000),
  })
} catch (err) {
  console.error(`Server nicht erreichbar: ${err.message}`)
  process.exit(1)
}

const text = await antwort.text()
let daten = null
try { daten = JSON.parse(text) } catch { /* Fehlerseite statt JSON */ }

if (antwort.status === 201 && daten?.ok) {
  console.log(`${daten.angelegt} Entwürfe angelegt: ${daten.daten.join(', ')}`)
  console.log('Jetzt im Admin-Panel unter „Vorschläge" prüfen und übernehmen.')
  process.exit(0)
}

const grund = daten?.error || text.slice(0, 200) || 'keine Antwort'
const hinweis = {
  401: 'Schlüssel stimmt nicht mit dem Hash auf dem Server überein.',
  503: 'Auf dem Server ist LEMMA_API_KEY_SHA256 nicht gesetzt.',
  429: 'Zu viele Versuche, in 15 Minuten erneut probieren.',
}[antwort.status]
console.error(`Fehlgeschlagen (HTTP ${antwort.status}): ${grund}`)
if (hinweis) console.error(hinweis)
if (Array.isArray(daten?.details)) console.error(JSON.stringify(daten.details, null, 2))
process.exit(1)
