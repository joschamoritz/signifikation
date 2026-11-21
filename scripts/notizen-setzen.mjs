// CLI: Notizen von Lemmata gesammelt ersetzen (z. B. nach dem Neubau der
// Kollokationen-Rangfolge, wenn Notizen noch die alten Top 3 nennen).
//
//   node scripts/notizen-setzen.mjs /tmp/notizen-neu.json              # Probelauf, schreibt nichts
//   node scripts/notizen-setzen.mjs /tmp/notizen-neu.json --schreiben  # übernehmen (mit Sicherung)
//   node scripts/notizen-setzen.mjs --zurueck server/data/backups/notizen-….json
//
// Eingabe: JSON-Array aus { id, notiz_alt, notiz }. notiz_alt ist die Notiz, auf der
// der neue Text beruht. Steht in der Datenbank inzwischen etwas anderes (im Admin
// geändert), bleibt das Lemma unverändert und erscheint im Bericht.
//
// Schreibt nur die Spalte notiz, kein volles Upsert: Runden, Lückenfüller und
// Definitionen bleiben, wie sie sind. Der Server übernimmt die neuen Notizen nach
// spätestens 5 Minuten (Höchstalter des Lemmata-Index).
import '../server/env.js'

import { parseArgs } from 'node:util'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import logger from '../server/logger.js'
import db from '../server/db.js'
import { DATA, invalidateCache } from '../server/store.js'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    schreiben: { type: 'boolean', default: false },
    zurueck: { type: 'string' },
  },
})

const ende = (code) => { db.close(); process.exit(code) }
const lies = db.prepare('SELECT id, lemma, notiz FROM lemmata WHERE id = ?')
const setze = db.prepare('UPDATE lemmata SET notiz = ? WHERE id = ?')
const MAX_LAENGE = 500

// ── Rückspielen einer Sicherung ──────────────────────────────────────────────
if (values.zurueck) {
  const sicherung = JSON.parse(readFileSync(values.zurueck, 'utf8'))
  const n = db.transaction((liste) => {
    let k = 0
    for (const { id, notiz } of liste) k += setze.run(notiz, id).changes
    return k
  })(sicherung.lemmata ?? [])
  invalidateCache('lemmata.json')
  logger.info(`Rückgespielt: ${n} Notizen aus ${values.zurueck}`)
  ende(0)
}

const datei = positionals[0]
if (!datei) {
  logger.error('Eingabedatei fehlt: node scripts/notizen-setzen.mjs <datei.json> [--schreiben]')
  ende(1)
}

const eingabe = JSON.parse(readFileSync(datei, 'utf8'))
if (!Array.isArray(eingabe)) {
  logger.error('Eingabe muss ein JSON-Array aus { id, notiz_alt, notiz } sein')
  ende(1)
}

const bereit = []
const probleme = []
const gesehen = new Set()
for (const e of eingabe) {
  const id = String(e?.id ?? '')
  const neu = typeof e?.notiz === 'string' ? e.notiz.trim() : ''
  if (!id || !neu) { probleme.push(`${id || '(ohne id)'}: id oder neue Notiz fehlt`); continue }
  if (gesehen.has(id)) { probleme.push(`${id}: doppelt in der Eingabe`); continue }
  gesehen.add(id)
  if (neu.length > MAX_LAENGE) { probleme.push(`${id}: neue Notiz hat ${neu.length} Zeichen (max. ${MAX_LAENGE})`); continue }
  const zeile = lies.get(id)
  if (!zeile) { probleme.push(`${id}: Lemma nicht in der Datenbank`); continue }
  if (typeof e.notiz_alt === 'string' && (zeile.notiz ?? '') !== e.notiz_alt) {
    probleme.push(`${id} (${zeile.lemma}): Notiz wurde inzwischen geändert`)
    continue
  }
  if ((zeile.notiz ?? '') === neu) continue
  bereit.push({ id, lemma: zeile.lemma, alt: zeile.notiz ?? '', neu })
}

logger.info(`${eingabe.length} Einträge gelesen: ${bereit.length} zu ändern, ${probleme.length} übersprungen`)
for (const b of bereit) logger.info(`${b.lemma}: ${b.alt}  →  ${b.neu}`)
for (const p of probleme) logger.warn(`übersprungen ${p}`)

if (!values.schreiben) {
  logger.info('Probelauf – nichts geschrieben. Mit --schreiben übernehmen.')
  ende(0)
}
if (bereit.length === 0) {
  logger.info('Nichts zu schreiben.')
  ende(0)
}

const ordner = join(DATA, 'backups')
mkdirSync(ordner, { recursive: true })
const sicherung = join(ordner, `notizen-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(sicherung, JSON.stringify({
  erstellt: new Date().toISOString(),
  lemmata: bereit.map((b) => ({ id: b.id, lemma: b.lemma, notiz: b.alt })),
}, null, 1))
logger.info(`Sicherung der alten Notizen: ${sicherung}`)

db.transaction((liste) => { for (const b of liste) setze.run(b.neu, b.id) })(bereit)
invalidateCache('lemmata.json')
logger.info(`Geschrieben: ${bereit.length} Notizen. Der Server übernimmt sie nach spätestens 5 Minuten.`)
ende(0)
