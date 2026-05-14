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
import { normalizeKalenderShape } from './store-daily-content.js'

function printInfo(message = '') {
  process.stdout.write(`${message}\n`)
}

function printError(message) {
  process.stderr.write(`${message}\n`)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, 'data')

function readJson(file, fallback) {
  const path = join(DATA, file)
  if (!existsSync(path)) {
    printInfo(`  WARN ${file} nicht gefunden - uebersprungen`)
    return fallback
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    printError(`  ERROR ${file} konnte nicht gelesen werden: ${err.message}`)
    return fallback
  }
}

printInfo('Migration JSON -> SQLite gestartet ...')
printInfo('')

// ── Lemmata ───────────────────────────────────────────────────────
{
  const lemmata = readJson('lemmata.json', [])
  const upsert  = db.prepare(`
    INSERT INTO lemmata (id,lemma,pos,wortart,runden,rundenInfo,notiz,link,definition,bonusFrage,ipa,definitionen,lueckenfueller)
    VALUES (@id,@lemma,@pos,@wortart,@runden,@rundenInfo,@notiz,@link,@definition,@bonusFrage,@ipa,@definitionen,@lueckenfueller)
    ON CONFLICT(id) DO UPDATE SET
      lemma=excluded.lemma, pos=excluded.pos, wortart=excluded.wortart,
      runden=excluded.runden, rundenInfo=excluded.rundenInfo,
      notiz=excluded.notiz, link=excluded.link, definition=excluded.definition,
      bonusFrage=excluded.bonusFrage, ipa=excluded.ipa, definitionen=excluded.definitionen,
      lueckenfueller=excluded.lueckenfueller
  `)
  const run = db.transaction(list => {
    for (const l of list) {
      upsert.run({
        id:            l.id,
        lemma:         l.lemma,
        pos:           l.pos           ?? '',
        wortart:       l.wortart       ?? '',
        runden:        JSON.stringify(l.runden       ?? {}),
        rundenInfo:    JSON.stringify(l.rundenInfo   ?? []),
        notiz:         l.notiz         ?? '',
        link:          l.link          ?? '',
        definition:    l.definition    ?? '',
        bonusFrage:    l.bonusFrage ? JSON.stringify(l.bonusFrage) : null,
        ipa:           l.ipa           ?? '',
        definitionen:  JSON.stringify(l.definitionen ?? []),
        lueckenfueller: l.lueckenfueller ? JSON.stringify(l.lueckenfueller) : null,
      })
    }
  })
  run(lemmata)
  printInfo(`OK lemmata: ${lemmata.length} Eintraege`)
}

// ── Kalender ──────────────────────────────────────────────────────
{
  // normalizeKalenderShape konvertiert altes Format (datum → id[]) auf neue Shape
  const kalender = normalizeKalenderShape(readJson('kalender.json', {}))
  const upsert   = db.prepare(`
    INSERT OR REPLACE INTO kalender (datum, ids, thema, thema_kurz, thema_quelle, lueckenfueller_id)
    VALUES (@datum, @ids, @thema, @thema_kurz, @thema_quelle, @lueckenfueller_id)
  `)
  const run      = db.transaction(obj => {
    for (const [datum, entry] of Object.entries(obj)) {
      upsert.run({
        datum,
        ids:               JSON.stringify(entry.ids ?? []),
        thema:             entry.thema             ?? '',
        thema_kurz:        entry.thema_kurz        ?? '',
        thema_quelle:      entry.thema_quelle      ?? '',
        lueckenfueller_id: entry.lueckenfueller_id ?? '',
      })
    }
  })
  run(kalender)
  printInfo(`OK kalender: ${Object.keys(kalender).length} Eintraege`)
}

// ── Zeitreise (veraltet – Tabelle existiert nicht mehr, wird übersprungen) ──
{
  const hasZeitreise = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='zeitreise'`).get()
  if (hasZeitreise) {
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
    printInfo(`OK zeitreise: ${Object.keys(zeitreise).length} Eintraege`)
  } else {
    printInfo('  SKIP zeitreise: Tabelle nicht mehr vorhanden')
  }
}

// ── Wortzwilling ──────────────────────────────────────────────────
{
  const wz     = readJson('wortzwilling.json', {})
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO wortzwilling (datum,wortA,wortB,pos,kollokatoren,notiz,link) VALUES (@datum,@wortA,@wortB,@pos,@kollokatoren,@notiz,@link)'
  )
  const run = db.transaction(obj => {
    for (const [datum, v] of Object.entries(obj)) {
      upsert.run({
        datum,
        wortA:        v.wortA        ?? '',
        wortB:        v.wortB        ?? '',
        pos:          v.pos          ?? 'Substantiv',
        kollokatoren: JSON.stringify(v.kollokatoren ?? []),
        notiz:        v.notiz        ?? '',
        link:         v.link         ?? '',
      })
    }
  })
  run(wz)
  printInfo(`OK wortzwilling: ${Object.keys(wz).length} Eintraege`)
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
  printInfo(`OK zeitenwende: ${Object.keys(zw).length} Eintraege`)
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
  printInfo(`OK stats: ${Object.keys(stats).length} Tage, ${totalEntries} Spieleintraege`)
}

printInfo('')
printInfo('Migration abgeschlossen.')
db.close()
