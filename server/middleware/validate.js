import { z } from 'zod/v3'

/**
 * Middleware-Factory: validiert req[source] gegen ein Zod-Schema.
 * Bei Fehler → 400 mit erstem Fehlermessage; bei Erfolg → req[source] = geparste Daten.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      return res.status(400).json({ error: result.error.errors[0].message })
    }
    // req.body kann direkt ersetzt werden; req.query/params sind in Express 5
    // getter-only → bestehende Objekte per Object.assign mutieren.
    if (source === 'body') {
      req.body = result.data
    } else {
      Object.assign(req[source], result.data)
    }
    next()
  }
}

// ── Gemeinsame Basistypen ─────────────────────────────────────
const DATUM_MMDD  = z.string().regex(/^\d{2}-\d{2}$/, 'Ungültiges datum-Format (MM-DD)')
const POS         = z.enum(['Substantiv', 'Verb', 'Adjektiv']).default('Substantiv')
const VALID_GAMES = ['kollokationen', 'zeitreise', 'wortzwilling', 'zeitenwende']

// ── Schemata ─────────────────────────────────────────────────

/** POST /api/stats */
export const statsSchema = z.object({
  game:  z.enum(VALID_GAMES),
  datum: DATUM_MMDD,
  score: z.number().int().min(0).max(100),
  max:   z.number().int().positive('max muss > 0 sein').max(100),
})

/** POST /api/feedback */
export const feedbackSchema = z.object({
  game:  z.string().min(1, 'game erforderlich'),
  emoji: z.string().min(1, 'emoji erforderlich'),
  text:  z.string().max(500).optional().default(''),
})

const WORT_REGEX = /^[a-zA-ZäöüÄÖÜß\-]+$/

/** GET /api/belege (query) */
export const belegeQuerySchema = z.object({
  lemma:     z.string().min(1).max(100).regex(WORT_REGEX, 'lemma enthält ungültige Zeichen'),
  collocate: z.string().min(1).max(100).regex(WORT_REGEX, 'collocate enthält ungültige Zeichen'),
  rel:       z.string().optional(),
  corpus:    z.string().optional(),
  year:      z.string().regex(/^\d{4}$/, 'year muss 4-stellig sein').optional(),
})

/** GET /api/archiv (query) */
export const archivQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date als YYYY-MM-DD erforderlich'),
})

/** GET /api/ipa, /admin/debug-diacollo (query: q=) */
export const qQuerySchema = z.object({
  q: z.string().min(1, 'q erforderlich'),
})

/** GET /api/bonus (query: id=) */
export const bonusQuerySchema = z.object({
  id: z.string().min(1, 'id erforderlich'),
})

/** POST /admin/tag */
export const adminTagSchema = z.object({
  datum:           DATUM_MMDD,
  woerter:         z.array(z.string().min(1).max(100)).length(3, 'genau 3 Wörter erforderlich'),
  notizen:         z.array(z.string().max(500)).optional().default([]),
  links:           z.array(z.string().max(500)).optional().default([]),
  definitionen:    z.array(z.string().max(2000)).optional().default([]),
  positionen:      z.array(POS).optional().default([]),
  zeitreise_lemma:    z.string().optional().default(''),
  zeitreise_wortart:  POS.optional().default('Substantiv'),
  zwilling_paar:      z.union([z.array(z.string()).length(2), z.null()]).optional().default(null),
  zwilling_pos:       POS,
  zeitenwende_lemma:  z.string().optional().default(''),
})


/** GET /admin/analyze-kollokation (query) */
export const analyzeKollQuerySchema = z.object({
  q:   z.string().min(1, 'q= erforderlich'),
  pos: POS,
})

/** GET /admin/analyze-wortzwilling (query) */
export const analyzeWZQuerySchema = z.object({
  a:   z.string().min(1, 'a= erforderlich'),
  b:   z.string().min(1, 'b= erforderlich'),
  pos: POS,
})

/** GET /admin/analyze-zeitreise (query) */
export const analyzeZeitQuerySchema = z.object({
  q: z.string().min(1, 'q= erforderlich'),
})

/** GET /admin/analyze-zeitenwende (query) */
export const analyzeZWendeQuerySchema = z.object({
  q: z.string().min(1, 'q= erforderlich'),
})
