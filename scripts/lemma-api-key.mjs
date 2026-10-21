// Erzeugt den Schlüssel für die Vorschlags-API (Entwurfs-Postfach).
//
//   npm run lemma:key          neuen Schlüssel anlegen
//   npm run lemma:key -- --neu vorhandenen Schlüssel ersetzen (Rotation)
//
// Der Schlüssel landet nur in der lokalen .env (LEMMA_API_KEY) und wird nie
// ausgegeben. Ausgegeben wird sein SHA-256-Hash: Der gehört auf dem Server in
// die .env (LEMMA_API_KEY_SHA256). Mit dem Hash allein kann niemand pushen.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashLemmaApiKey } from '../server/middleware/lemmaApiKey.js'

const ENV_PFAD = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
const ersetzen = process.argv.includes('--neu')

const inhalt = existsSync(ENV_PFAD) ? readFileSync(ENV_PFAD, 'utf8') : ''
const eol = inhalt.includes('\r\n') ? '\r\n' : '\n'
const vorhanden = /^LEMMA_API_KEY=.+$/m.test(inhalt)

if (vorhanden && !ersetzen) {
  console.error('In der .env steht schon ein LEMMA_API_KEY.')
  console.error('Zum Ersetzen: npm run lemma:key -- --neu  (danach den neuen Hash auf dem Server eintragen)')
  process.exit(1)
}

const schluessel = randomBytes(32).toString('base64url')
const zeile = `LEMMA_API_KEY=${schluessel}`
const neu = vorhanden
  ? inhalt.replace(/^LEMMA_API_KEY=.*$/m, zeile)
  : `${inhalt}${inhalt && !inhalt.endsWith(eol) ? eol : ''}${eol}# Vorschlags-API (lokal, für npm run lemma:push)${eol}${zeile}${eol}`

writeFileSync(ENV_PFAD, neu)

console.log(vorhanden ? 'Neuer Schlüssel in der lokalen .env gespeichert (alter ersetzt).' : 'Schlüssel in der lokalen .env gespeichert.')
console.log('')
console.log('Auf dem Server in /opt/signifikation/app/.env eintragen:')
console.log('')
console.log(`  LEMMA_API_KEY_SHA256=${hashLemmaApiKey(schluessel)}`)
console.log('')
console.log('Danach neu starten — mit --update-env, sonst ignoriert PM2 die neue Variable')
console.log('(genauer Befehl: planning/Technik & Stack.md, „Manuelle Restarts").')
console.log('Ohne den Eintrag antwortet die API mit 503.')
