/**
 * server/classroom/demoContent.js
 *
 * Inhalte der login-freien Lehrer-Demo (Klassenraum-Vorschau).
 * Im Admin editierbar, persistiert als JSON im app_state-KV-Store.
 *
 * Storage-Shape ist bewusst FLACH/editor-freundlich (Felder statt
 * verschachtelter Spiel-Prompts) — das Frontend (ClassroomTeacherDemo.jsx)
 * mappt es auf die jeweilige Spielkomponenten-Form. Wenn nichts gespeichert
 * oder etwas ungültig ist, fällt loadDemoContent() auf DEMO_CONTENT_DEFAULT
 * zurück, damit die Demo NIE bricht.
 *
 * WICHTIG: DEMO_CONTENT_DEFAULT muss mit dem Frontend-Fallback in
 * ClassroomTeacherDemo.jsx übereinstimmen (zwei Kopien = Offline-Sicherheit).
 */

import { z } from 'zod'
import db from '../db.js'
import logger from '../logger.js'

const APP_STATE_KEY = 'classroom_demo_content'

// Default-Inhalte (Single Source of Truth fürs Seeding/Fallback).
export const DEMO_CONTENT_DEFAULT = {
  kollokationen: {
    lemma: { lemma: 'Debatte', ipa: '[deˈbatə]', definition: 'kontroverse, öffentliche Erörterung einer Frage' },
    words: ['hitzig', 'kontrovers', 'öffentlich', 'sachlich', 'parlamentarisch', 'endlos'],
  },
  wortzwilling: {
    wortA: 'See',
    wortB: 'Meer',
    words: ['tief', 'offen', 'baden', 'rauschen', 'Ufer', 'Welle', 'still', 'Sturm'],
  },
  zeitenwende: {
    lemma: { lemma: 'Netzwerk', ipa: '[ˈnɛtsvɛʁk]' },
    words: ['sozial', 'neuronal', 'kriminell', 'dezentral'],
  },
  lueckenfueller: {
    lemma: { lemma: 'Kritik', ipa: '[kʁiˈtiːk]' },
    sentence: 'Die Opposition übte _____ Kritik an dem Gesetzentwurf.',
    options: ['scharfe', 'milde', 'blaue', 'schnelle'],
  },
}

// Fehlertexte auf Deutsch, je Regel (die Admin-Seite zeigt sie am Feld; Pfad = issue.path).
// Die Grenzen müssen mit der Seite übereinstimmen (Werkzeuge › Klassenraum-Demo, pruefeDemo in admin.js).
const wordList = (min, max, eins, viele) => z.array(
  z.string().trim().min(1, 'Ein Eintrag ist leer.').max(60, 'Ein Eintrag ist länger als 60 Zeichen.'),
).superRefine((liste, ctx) => {
  if (liste.length < min) {
    ctx.addIssue({ code: 'custom', message: `Mindestens ${min} ${min === 1 ? eins : viele} (jetzt ${liste.length}).` })
  } else if (liste.length > max) {
    ctx.addIssue({ code: 'custom', message: `Höchstens ${max} ${max === 1 ? eins : viele} (jetzt ${liste.length}).` })
  }
})
const pflichtWort = (max, fehlt) => z.string({ error: fehlt }).trim().min(1, fehlt).max(max, `Höchstens ${max} Zeichen.`)
const lemmaFields = (fehlt) => z.object({
  lemma: pflichtWort(80, fehlt),
  ipa: z.string().trim().max(80, 'Höchstens 80 Zeichen.').optional().default(''),
})

const demoContentSchema = z.object({
  kollokationen: z.object({
    lemma: lemmaFields('Bitte eine Basis eintragen.').extend({ definition: z.string().trim().max(300, 'Höchstens 300 Zeichen.').optional().default('') }),
    words: wordList(3, 12, 'Kollokator', 'Kollokatoren'),
  }),
  wortzwilling: z.object({
    wortA: pflichtWort(40, 'Bitte Wort A eintragen.'),
    wortB: pflichtWort(40, 'Bitte Wort B eintragen.'),
    words: wordList(4, 12, 'Wort', 'Wörter'),
  }),
  zeitenwende: z.object({
    lemma: lemmaFields('Bitte ein Wort eintragen.'),
    words: wordList(2, 12, 'Kollokator', 'Kollokatoren'),
  }),
  lueckenfueller: z.object({
    lemma: lemmaFields('Bitte ein Wort eintragen.'),
    sentence: z.string().trim()
      .min(3, 'Der Satz braucht eine Lücke aus fünf Unterstrichen (_____).')
      .max(300, 'Höchstens 300 Zeichen.')
      .refine((s) => s.includes('_____'), { message: 'Der Satz braucht eine Lücke aus fünf Unterstrichen (_____).' }),
    options: wordList(2, 6, 'Antwort', 'Antworten'),
  }),
})

const getStmt = db.prepare('SELECT value, updated_at FROM app_state WHERE key = ?')
const setStmt = db.prepare(`
  INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`)

// Gespeicherte Inhalte (validiert) oder Default, dazu ob die Standardinhalte gelten und wann gespeichert
// wurde (für den Admin-Editor: „Eigene Inhalte, gespeichert …“ / „Standardinhalte“). Bricht nie.
export function loadDemoContentMitStand() {
  const standard = { content: DEMO_CONTENT_DEFAULT, istStandard: true, gespeichertAm: null }
  try {
    const row = getStmt.get(APP_STATE_KEY)
    if (!row?.value) return standard
    const parsed = demoContentSchema.safeParse(JSON.parse(row.value))
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'Demo-Inhalte ungültig gespeichert – Fallback auf Default')
      return standard
    }
    return { content: parsed.data, istStandard: false, gespeichertAm: row.updated_at ? new Date(row.updated_at).toISOString() : null }
  } catch (err) {
    logger.warn({ err }, 'Demo-Inhalte laden fehlgeschlagen – Fallback auf Default')
    return standard
  }
}

// Gespeicherte Inhalte (validiert) oder Default. Bricht nie.
export function loadDemoContent() {
  return loadDemoContentMitStand().content
}

// Validiert + speichert. Bei ungültiger Eingabe bleibt der alte Stand erhalten.
export function saveDemoContent(content) {
  const parsed = demoContentSchema.safeParse(content)
  if (!parsed.success) return { error: 'INVALID', issues: parsed.error.issues }
  setStmt.run(APP_STATE_KEY, JSON.stringify(parsed.data), Date.now())
  return { ok: true, content: parsed.data }
}
