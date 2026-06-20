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

const wordList = (min, max) => z.array(z.string().trim().min(1).max(60)).min(min).max(max)
const lemmaFields = z.object({
  lemma: z.string().trim().min(1).max(80),
  ipa: z.string().trim().max(80).optional().default(''),
})

export const demoContentSchema = z.object({
  kollokationen: z.object({
    lemma: lemmaFields.extend({ definition: z.string().trim().max(300).optional().default('') }),
    words: wordList(3, 12),
  }),
  wortzwilling: z.object({
    wortA: z.string().trim().min(1).max(40),
    wortB: z.string().trim().min(1).max(40),
    words: wordList(4, 12),
  }),
  zeitenwende: z.object({
    lemma: lemmaFields,
    words: wordList(2, 12),
  }),
  lueckenfueller: z.object({
    lemma: lemmaFields,
    sentence: z.string().trim().min(3).max(300)
      .refine((s) => s.includes('_____'), { message: 'Der Satz braucht eine Lücke „_____" (fünf Unterstriche).' }),
    options: wordList(2, 6),
  }),
})

const getStmt = db.prepare('SELECT value FROM app_state WHERE key = ?')
const setStmt = db.prepare(`
  INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`)

// Gespeicherte Inhalte (validiert) oder Default. Bricht nie.
export function loadDemoContent() {
  try {
    const row = getStmt.get(APP_STATE_KEY)
    if (!row?.value) return DEMO_CONTENT_DEFAULT
    const parsed = demoContentSchema.safeParse(JSON.parse(row.value))
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'Demo-Inhalte ungültig gespeichert – Fallback auf Default')
      return DEMO_CONTENT_DEFAULT
    }
    return parsed.data
  } catch (err) {
    logger.warn({ err }, 'Demo-Inhalte laden fehlgeschlagen – Fallback auf Default')
    return DEMO_CONTENT_DEFAULT
  }
}

// Validiert + speichert. Bei ungültiger Eingabe bleibt der alte Stand erhalten.
export function saveDemoContent(content) {
  const parsed = demoContentSchema.safeParse(content)
  if (!parsed.success) return { error: 'INVALID', issues: parsed.error.issues }
  setStmt.run(APP_STATE_KEY, JSON.stringify(parsed.data), Date.now())
  return { ok: true, content: parsed.data }
}
