/**
 * Seed-Skript für die lokale Entwicklung.
 *
 * Befüllt die lokale signifikation.db mit Test-Lemmata für heute (oder ein
 * übergebenes Datum), damit alle Spielmodi ohne Online-Daten getestet werden
 * können.
 *
 * Aufruf:
 *   node server/seed-dev.js              # Heute
 *   node server/seed-dev.js 2026-05-24   # Bestimmtes Datum
 *
 * Idempotent: INSERT OR REPLACE — mehrfaches Ausführen überschreibt nur.
 */

import db from './db.js'
import { stmts, invalidateCache } from './store.js'

const argDate = process.argv[2]
const today = argDate || new Date().toISOString().slice(0, 10)

// ── Datenmodell-Helfer ───────────────────────────────────────────────────────

function lemmaRow(id, lemma, runden, extra = {}) {
  return {
    id,
    lemma,
    pos: extra.pos ?? 'Substantiv',
    wortart: extra.wortart ?? 'Substantiv, feminin',
    runden: JSON.stringify(runden),
    rundenInfo: JSON.stringify([]),
    notiz: extra.notiz ?? '',
    link: extra.link ?? '',
    definition: extra.definition ?? '',
    bonusFrage: null,
    ipa: extra.ipa ?? '',
    definitionen: JSON.stringify(extra.definitionen ?? []),
    lueckenfueller: null,
  }
}

// ── Test-Lemmata ─────────────────────────────────────────────────────────────

const SEED_PREFIX = 'dev-seed-'

const lemma1 = lemmaRow(`${SEED_PREFIX}erinnerung`, 'Erinnerung', {
  kollokatoren: [
    { wort: 'verblassen',     rang: 1,  log_dice: 12.4 },
    { wort: 'schmerzlich',    rang: 2,  log_dice: 11.8 },
    { wort: 'bewahren',       rang: 3,  log_dice: 11.2 },
    { wort: 'kindheit',       rang: 4,  log_dice: 9.6 },
    { wort: 'wachhalten',     rang: 5,  log_dice: 9.1 },
    { wort: 'lebhaft',        rang: 6,  log_dice: 8.5 },
    { wort: 'kollektiv',      rang: 7,  log_dice: 7.9 },
    { wort: 'verdrängen',     rang: 8,  log_dice: 7.4 },
    { wort: 'verschwommen',   rang: 9,  log_dice: 6.8 },
    { wort: 'haften',         rang: 10, log_dice: 6.3 },
  ],
}, {
  ipa: 'ɛɐ̯ˈʔɪnəʁʊŋ',
  definitionen: ['das Vermögen, sich an Vergangenes geistig zu vergegenwärtigen'],
  notiz: 'Test-Lemma (dev seed)',
})

const lemma2 = lemmaRow(`${SEED_PREFIX}freiheit`, 'Freiheit', {
  kollokatoren: [
    { wort: 'persönlich',     rang: 1,  log_dice: 12.1 },
    { wort: 'einschränken',   rang: 2,  log_dice: 11.7 },
    { wort: 'genießen',       rang: 3,  log_dice: 11.3 },
    { wort: 'verteidigen',    rang: 4,  log_dice: 9.4 },
    { wort: 'akademisch',     rang: 5,  log_dice: 8.9 },
    { wort: 'verlieren',      rang: 6,  log_dice: 8.2 },
    { wort: 'künstlerisch',   rang: 7,  log_dice: 7.7 },
    { wort: 'erkämpfen',      rang: 8,  log_dice: 7.1 },
    { wort: 'spüren',         rang: 9,  log_dice: 6.6 },
    { wort: 'absolut',        rang: 10, log_dice: 6.1 },
  ],
}, {
  ipa: 'ˈfʁaɪ̯haɪ̯t',
  definitionen: ['Zustand, frei von Zwang zu sein'],
})

const lemma3 = lemmaRow(`${SEED_PREFIX}zukunft`, 'Zukunft', {
  kollokatoren: [
    { wort: 'gestalten',      rang: 1,  log_dice: 12.5 },
    { wort: 'rosig',          rang: 2,  log_dice: 11.9 },
    { wort: 'planen',         rang: 3,  log_dice: 11.4 },
    { wort: 'düster',         rang: 4,  log_dice: 9.7 },
    { wort: 'ungewiss',       rang: 5,  log_dice: 9.0 },
    { wort: 'sichern',        rang: 6,  log_dice: 8.4 },
    { wort: 'vorhersagen',    rang: 7,  log_dice: 7.8 },
    { wort: 'investieren',    rang: 8,  log_dice: 7.2 },
    { wort: 'entscheiden',    rang: 9,  log_dice: 6.7 },
    { wort: 'erträumen',      rang: 10, log_dice: 6.0 },
  ],
}, {
  ipa: 'ˈt͡suːkʊnft',
  definitionen: ['die Zeit, die noch nicht eingetreten ist'],
})

const wzEntry = {
  datum: today,
  wortA: 'Glaube',
  wortB: 'Wissen',
  pos: 'Substantiv',
  kollokatoren: JSON.stringify([
    { wort: 'unerschütterlich', zuordnung: 'A' },
    { wort: 'fromm',            zuordnung: 'A' },
    { wort: 'religiös',         zuordnung: 'A' },
    { wort: 'naiv',             zuordnung: 'A' },
    { wort: 'tief',             zuordnung: 'A' },
    { wort: 'wissenschaftlich', zuordnung: 'B' },
    { wort: 'fundiert',         zuordnung: 'B' },
    { wort: 'erlangen',         zuordnung: 'B' },
    { wort: 'aneignen',         zuordnung: 'B' },
    { wort: 'umfassend',        zuordnung: 'B' },
  ]),
  notiz: 'Test-Wort-Zwilling (dev seed)',
  link: '',
}

const zwEntry = {
  datum: today,
  data: JSON.stringify({
    lemma: 'Religion',
    ipa: 'ʁeliˈɡi̯oːn',
    definitionen: ['durch Lehre überliefertes System des Glaubens an höhere Mächte'],
    words: [
      { wort: 'Konfession',     periode: 'pre'  },
      { wort: 'Mythe',          periode: 'pre'  },
      { wort: 'Klasse',         periode: 'pre'  },
      { wort: 'sogenannt',      periode: 'pre'  },
      { wort: 'Philosophie',    periode: 'pre'  },
      { wort: 'Herkunft',       periode: 'post' },
      { wort: 'Weltanschauung', periode: 'post' },
      { wort: 'monotheistisch', periode: 'post' },
      { wort: 'Ethnie',         periode: 'post' },
      { wort: 'Rasse',          periode: 'post' },
    ],
  }),
}

// ── Schreiben ────────────────────────────────────────────────────────────────

const tx = db.transaction(() => {
  for (const row of [lemma1, lemma2, lemma3]) {
    stmts.upsertLemma.run(row)
  }
  stmts.upsertKalender.run({
    datum: today,
    ids: JSON.stringify([lemma1.id, lemma2.id, lemma3.id]),
    thema: 'Dev-Seed',
    thema_kurz: 'Dev',
    thema_quelle: '',
    lueckenfueller_id: '',
  })
  stmts.upsertWortzwilling.run(wzEntry)
  stmts.upsertZeitenwende.run(zwEntry)
})

tx()
invalidateCache('lemmata.json')
invalidateCache('kalender.json')
invalidateCache('wortzwilling.json')
invalidateCache('zeitenwende.json')

console.log(`✔ Test-Daten für ${today} eingespielt:`)
console.log(`  • Kollokationen: ${lemma1.lemma}, ${lemma2.lemma}, ${lemma3.lemma}`)
console.log(`  • Wort-Zwilling: ${wzEntry.wortA} · ${wzEntry.wortB}`)
console.log(`  • Zeitenwende:   Religion (10 Wörter)`)
console.log('')
console.log('Server neu starten (oder ist neu hochzufahren), dann auf http://localhost:5173 testen.')

db.close()
// db.js installiert einen WAL-Checkpoint-Timer, der ohne expliziten Exit
// den Prozess hängen ließe.
process.exit(0)
