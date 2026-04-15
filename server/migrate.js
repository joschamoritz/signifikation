/**
 * migrate.js – einmaliges Migrations-Skript: JSON-Dateien → signifikation.db
 *
 * Aufruf:  node server/migrate.js
 *
 * Liest vorhandene JSON-Dateien aus server/data/ und schreibt die Daten
 * in die SQLite-Datenbank. Bereits vorhandene Einträge werden überschrieben
 * (INSERT OR REPLACE / ON CONFLICT DO UPDATE).
 *
 * Idempotent: kann mehrfach ausgeführt werden ohne Datenverlust.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import db from './db.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, 'data')

function readJson(file, fallback) {
  const path = join(DATA, file)
  if (!existsSync(path)) {
    console.log(`  ⚠ ${file} nicht gefunden – übersprungen`)
    return fallback
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.error(`  ✗ ${file} konnte nicht gelesen werden:`, err.message)
    return fallback
  }
}

console.log('Migration JSON → SQLite gestartet …\n')

// ── Lemmata ───────────────────────────────────────────────────────
{
  const lemmata = readJson('lemmata.json', [])
  const upsert  = db.prepare(`
    INSERT INTO lemmata (id,lemma,pos,wortart,runden,rundenInfo,notiz,link,definition,bonusFrage,ipa,definitionen)
    VALUES (@id,@lemma,@pos,@wortart,@runden,@rundenInfo,@notiz,@link,@definition,@bonusFrage,@ipa,@definitionen)
    ON CONFLICT(id) DO UPDATE SET
      lemma=excluded.lemma, pos=excluded.pos, wortart=excluded.wortart,
      runden=excluded.runden, rundenInfo=excluded.rundenInfo,
      notiz=excluded.notiz, link=excluded.link, definition=excluded.definition,
      bonusFrage=excluded.bonusFrage, ipa=excluded.ipa, definitionen=excluded.definitionen
  `)
  const run = db.transaction(list => {
    for (const l of list) {
      upsert.run({
        id:           l.id,
        lemma:        l.lemma,
        pos:          l.pos          ?? '',
        wortart:      l.wortart      ?? '',
        runden:       JSON.stringify(l.runden      ?? {}),
        rundenInfo:   JSON.stringify(l.rundenInfo  ?? []),
        notiz:        l.notiz        ?? '',
        link:         l.link         ?? '',
        definition:   l.definition   ?? '',
        bonusFrage:   l.bonusFrage ? JSON.stringify(l.bonusFrage) : null,
        ipa:          l.ipa          ?? '',
        definitionen: JSON.stringify(l.definitionen ?? []),
      })
    }
  })
  run(lemmata)
  console.log(`✓ lemmata: ${lemmata.length} Einträge`)
}

// ── Kalender ──────────────────────────────────────────────────────
{
  const kalender = readJson('kalender.json', {})
  const upsert   = db.prepare('INSERT OR REPLACE INTO kalender (datum, ids) VALUES (@datum, @ids)')
  const run      = db.transaction(obj => {
    for (const [datum, ids] of Object.entries(obj)) {
      upsert.run({ datum, ids: JSON.stringify(ids) })
    }
  })
  run(kalender)
  console.log(`✓ kalender: ${Object.keys(kalender).length} Einträge`)
}

// ── Zeitreise ─────────────────────────────────────────────────────
{
  const zeitreise = readJson('zeitreise.json', {})
  const upsert    = db.prepare(
    'INSERT OR REPLACE INTO zeitreise (datum,lemma,paare,perioden,wortart) VALUES (@datum,@lemma,@paare,@perioden,@wortart)'
  )
  const run = db.transaction(obj => {
    for (const [datum, v] of Object.entries(obj)) {
      upsert.run({
        datum,
        lemma:    v.lemma    ?? '',
        paare:    JSON.stringify(v.paare    ?? []),
        perioden: JSON.stringify(v.perioden ?? []),
        wortart:  v.wortart  ?? 'Substantiv',
      })
    }
  })
  run(zeitreise)
  console.log(`✓ zeitreise: ${Object.keys(zeitreise).length} Einträge`)
}

// ── Wortzwilling ──────────────────────────────────────────────────
{
  const wz     = readJson('wortzwilling.json', {})
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO wortzwilling (datum,wortA,wortB,pos,kollokatoren) VALUES (@datum,@wortA,@wortB,@pos,@kollokatoren)'
  )
  const run = db.transaction(obj => {
    for (const [datum, v] of Object.entries(obj)) {
      upsert.run({
        datum,
        wortA:        v.wortA        ?? '',
        wortB:        v.wortB        ?? '',
        pos:          v.pos          ?? 'Substantiv',
        kollokatoren: JSON.stringify(v.kollokatoren ?? []),
      })
    }
  })
  run(wz)
  console.log(`✓ wortzwilling: ${Object.keys(wz).length} Einträge`)
}

// ── Zeitenwende ───────────────────────────────────────────────────
{
  const zw     = readJson('zeitenwende.json', {})
  const upsert = db.prepare('INSERT OR REPLACE INTO zeitenwende (datum, data) VALUES (@datum, @data)')
  const run    = db.transaction(obj => {
    for (const [datum, v] of Object.entries(obj)) {
      upsert.run({ datum, data: JSON.stringify(v) })
    }
  })
  run(zw)
  console.log(`✓ zeitenwende: ${Object.keys(zw).length} Einträge`)
}

// ── Stats ─────────────────────────────────────────────────────────
{
  const stats  = readJson('stats.json', {})
  const upsert = db.prepare(`
    INSERT INTO stats (datum,spiel,user_id,plays,scoreSum,maxSum,dist)
    VALUES (@datum,@spiel,@user_id,@plays,@scoreSum,@maxSum,@dist)
    ON CONFLICT(datum,spiel,user_id) DO UPDATE SET
      plays=excluded.plays, scoreSum=excluded.scoreSum,
      maxSum=excluded.maxSum, dist=excluded.dist
  `)
  const run = db.transaction(obj => {
    for (const [datum, games] of Object.entries(obj)) {
      for (const [spiel, v] of Object.entries(games)) {
        upsert.run({
          datum, spiel,
          user_id: v.user_id ?? '',
          plays:    v.plays    ?? 0,
          scoreSum: v.scoreSum ?? 0,
          maxSum:   v.maxSum   ?? 0,
          dist:     JSON.stringify(v.dist ?? []),
        })
      }
    }
  })
  const totalEntries = Object.values(stats).reduce((n, g) => n + Object.keys(g).length, 0)
  run(stats)
  console.log(`✓ stats: ${Object.keys(stats).length} Tage, ${totalEntries} Spieleinträge`)
}

console.log('\nMigration abgeschlossen.')
db.close()
