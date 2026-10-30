// CLI: Spieldaten nach Links ohne http(s):// durchsuchen. Seit 27.10.2026 lehnen Tag-Editor
// und Wort der Woche solche Links ab (validate.js); ältere Einträge fallen sonst erst beim
// nächsten Speichern des Tages auf.
//
//   node scripts/links-pruefen.mjs
//
// Öffnet die Spieldaten-DB nur lesend (nicht über db.js, das beim Import migriert) und
// ändert nichts. Auf dem Server als Dienstkonto aufrufen, siehe OPS.md.
import Database from 'better-sqlite3'
import { DB_PATH } from '../server/dbPfad.js'

const LINK_OK = /^(https?:\/\/\S+)?$/i

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true })

const lemmaTage = new Map()
for (const { datum, ids } of db.prepare('SELECT datum, ids FROM kalender').all()) {
  for (const id of JSON.parse(ids || '[]')) {
    if (!lemmaTage.has(id)) lemmaTage.set(id, [])
    lemmaTage.get(id).push(datum)
  }
}

const funde = []
const pruefe = (ort, wo, link) => {
  if (!LINK_OK.test(link ?? '')) funde.push({ ort, wo, link })
}

for (const { id, lemma, link } of db.prepare('SELECT id, lemma, link FROM lemmata').all()) {
  const tage = lemmaTage.get(id)
  pruefe('Kollokationen', `${lemma} (${id}${tage ? `, ${tage.sort().join(', ')}` : ', kein Spieltag'})`, link)
}
for (const { datum, link } of db.prepare('SELECT datum, link FROM wortzwilling').all()) {
  pruefe('Wortzwilling', datum, link)
}
for (const { datum, data } of db.prepare('SELECT datum, data FROM zeitenwende').all()) {
  let eintrag
  try { eintrag = JSON.parse(data || '{}') } catch { eintrag = {} }
  pruefe('Zeitenwende', datum, eintrag.link)
}
for (const { woche, link, zeitenwende_link } of db.prepare('SELECT woche, link, zeitenwende_link FROM spezialwochen').all()) {
  pruefe('Wort der Woche', woche, link)
  pruefe('Wort der Woche (Zeitenwende)', woche, zeitenwende_link)
}

db.close()

if (!funde.length) {
  process.stdout.write(`Keine Links ohne http(s):// in ${DB_PATH}.\n`)
} else {
  process.stdout.write(`${funde.length} Link(s) ohne http(s):// in ${DB_PATH}:\n`)
  for (const { ort, wo, link } of funde) process.stdout.write(`  ${ort} · ${wo}: ${JSON.stringify(link)}\n`)
  process.exitCode = 1
}
