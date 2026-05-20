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
const DATUM_ISO   = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges datum-Format (YYYY-MM-DD)')
const POS         = z.enum(['Substantiv', 'Verb', 'Adjektiv']).default('Substantiv')
const VALID_GAMES = ['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller']

// ── Schemata ─────────────────────────────────────────────────

/** POST /api/stats */
export const statsSchema = z.object({
  game:  z.enum(VALID_GAMES),
  datum: DATUM_ISO,
  score: z.number().int().min(0).max(100),
  max:   z.number().int().positive('max muss > 0 sein').max(100),
})

/** GET /api/v1/percentile (query) */
export const percentileQuerySchema = z.object({
  datum: DATUM_ISO,
  game:  z.enum(VALID_GAMES),
  score: z.coerce.number().int().min(0).max(100),
  max:   z.coerce.number().int().positive().max(100),
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

/** GET /api/v1/heute, /api/v1/wortzwilling, /api/v1/zeitenwende (query: datum=YYYY-MM-DD) */
export const datumQuerySchema = z.object({
  datum: DATUM_ISO.optional(),
})

/** POST /admin/tag */
export const adminTagSchema = z.object({
  datum:                DATUM_ISO,
  woerter:              z.array(z.string().min(1).max(100)).length(3, 'genau 3 Wörter erforderlich'),
  notizen:              z.array(z.string().max(500)).optional().default([]),
  links:                z.array(z.string().max(500)).optional().default([]),
  definitionen:         z.array(z.string().max(2000)).optional().default([]),
  positionen:           z.array(POS).optional().default([]),
  thema:                z.string().max(200).optional().default(''),
  thema_kurz:           z.string().max(300).optional().default(''),
  thema_quelle:         z.string().max(500).optional().default(''),
  zwilling_paar:        z.union([z.array(z.string()).length(2), z.null()]).optional().default(null),
  zwilling_pos:         POS,
  zwilling_notiz:       z.string().max(500).optional().default(''),
  zwilling_link:        z.string().max(500).optional().default(''),
  zeitenwende_lemma:    z.string().optional().default(''),
  zeitenwende_notiz:    z.string().max(500).optional().default(''),
  zeitenwende_link:     z.string().max(500).optional().default(''),
  lueckenfueller_id:    z.string().max(120).optional().default(''),
})


/** GET /admin/analyze-kollokation (query) */
export const analyzeKollQuerySchema = z.object({
  q:   z.string().min(1, 'q= erforderlich'),
  pos: POS.optional(),
})

/** GET /admin/analyze-wortzwilling (query) */
export const analyzeWZQuerySchema = z.object({
  a:   z.string().min(1, 'a= erforderlich'),
  b:   z.string().min(1, 'b= erforderlich'),
  pos: POS,
})

/** GET /admin/analyze-zeitenwende (query) */
export const analyzeZWendeQuerySchema = z.object({
  q: z.string().min(1, 'q= erforderlich'),
})

/** GET /admin/users (query) */
export const adminUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  role: z.enum(['user', 'premium']).optional(),
  q: z.string().trim().max(120).optional(),
})

/** POST /admin/users/:id/role */
export const adminSetUserRoleSchema = z.object({
  role: z.enum(['user', 'premium']),
})

/** GET /admin/users/:id (params) */
export const adminUserIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'id erforderlich'),
})

/** POST /admin/users/bulk-update */
export const adminUsersBulkUpdateSchema = z.object({
  action: z.enum(['setRole', 'delete', 'export']),
  userIds: z.array(z.string().trim().min(1, 'userIds enthaelt leere IDs')).min(1, 'Mindestens ein Nutzer erforderlich').max(200, 'Maximal 200 Nutzer pro Aktion'),
  role: z.enum(['user', 'premium']).optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
}).superRefine((value, ctx) => {
  if (value.action === 'setRole' && !value.role) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'role ist fuer setRole erforderlich',
      path: ['role'],
    })
  }
})

/** POST /admin/kalender/bulk-delete */
export const adminBulkDeleteCalendarSchema = z.object({
  dates: z.array(DATUM_ISO).min(1, 'Mindestens ein Datum erforderlich').max(180, 'Zu viele Datumswerte auf einmal'),
})

/** POST /admin/kalender/bulk-import */
export const adminBulkImportCalendarSchema = z.object({
  csv: z.string().min(1, 'CSV-Inhalt erforderlich').max(1_000_000, 'CSV-Inhalt zu gross'),
})

/** POST /admin/preview/lemma */
export const adminPreviewLemmaSchema = z.object({
  lemma: z.string().trim().min(1, 'lemma erforderlich').max(100, 'lemma zu lang'),
  pos: POS.optional().default('Substantiv'),
})

/** GET /admin/preview/day/:datum */
export const adminPreviewDayParamsSchema = z.object({
  datum: DATUM_ISO,
})

/** POST /admin/lemma/:id/lueckenfueller */
export const adminLemmaIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'id erforderlich').max(120, 'id zu lang'),
})

/** GET /admin/audit-log/:resource/:id */
export const adminAuditLogDetailParamsSchema = z.object({
  resource: z.string().trim().min(1, 'resource erforderlich').max(80, 'resource zu lang'),
  id: z.string().trim().min(1, 'id erforderlich').max(120, 'id zu lang'),
})

/** POST /admin/backup/restore */
export const adminBackupRestoreSchema = z.object({
  confirm: z.literal(true),
  exportedAt: z.string().optional(),
  files: z.record(z.any()),
})

/** GET /admin/stats (query) */
export const adminStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

/** GET /admin/stats/summary (query) */
export const adminStatsSummaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  topUsers: z.coerce.number().int().min(1).max(50).optional().default(10),
})

/** GET /admin/stats/export (query) */
export const adminStatsExportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).optional().default('json'),
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

/** GET /admin/audit-log (query) */
export const adminAuditLogQuerySchema = z.object({
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']).optional(),
  resource: z.string().trim().max(80).optional(),
  status: z.enum(['SUCCESS', 'FAILED']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from als YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to als YYYY-MM-DD').optional(),
  q: z.string().trim().max(120).optional(),
})

/** GET /admin/social-cards/tagesdata (query) */
export const adminSocialCardsTagesdataSchema = z.object({
  datum: DATUM_ISO,
})

/** GET /admin/social-cards/belege (query) */
export const adminSocialCardsBelegeSchema = z.object({
  lemma: z.string().min(1).max(100),
  collocate: z.string().min(1).max(100),
})

// ── Spezialwoche Schemas ────────────────────────────────────────

const ISO_WOCHE = z.string().regex(/^\d{4}-W\d{2}$/, 'woche muss ISO-Format haben: YYYY-Www')

/** POST /admin/spezialwoche */
export const adminSpezialwocheSchema = z.object({
  woche:              ISO_WOCHE,
  von:                DATUM_ISO,
  bis:                DATUM_ISO,
  lemma_id:           z.string().trim().min(1, 'lemma_id erforderlich').max(120),
  zwilling_partner:   z.string().max(100).optional().default(''),
  zwilling_pos:       POS,
  zeitenwende_notiz:  z.string().max(500).optional().default(''),
  zeitenwende_link:   z.string().max(500).optional().default(''),
  lueckenfueller_id:  z.string().max(120).optional().default(''),
  notiz:              z.string().max(500).optional().default(''),
  link:               z.string().max(500).optional().default(''),
})

/** GET /admin/spezialwoche/:woche (params) */
export const adminSpezialwocheParamsSchema = z.object({
  woche: ISO_WOCHE,
})

/** GET /api/v1/spezialwoche (query: datum=) */
export const spezialwocheDatumQuerySchema = z.object({
  datum: DATUM_ISO.optional(),
})

// ── Account Schemas ────────────────────────────────────────────

/** DELETE /api/v1/account/sessions/:id (params) */
export const accountIdParamsSchema = z.object({
  id: z.string().uuid('Ungültige ID'),
})

// ── Classroom Schemas ───────────────────────────────────────────

const CLASSROOM_STATE = z.enum(['created', 'lobby', 'running', 'finished', 'archived'])

/** POST /api/v1/classroom/sessions */
export const classroomCreateSessionSchema = z.object({
  datum: DATUM_ISO.optional(),
  settings: z.record(z.any()).optional().default({}),
})

/** POST /api/v1/classroom/sessions/:id/start */
export const classroomStartSessionSchema = z.object({
  allowLateJoin: z.boolean().optional().default(true),
})

/** POST /api/v1/classroom/sessions/:id/finish */
export const classroomFinishSessionSchema = z.object({
  reason: z.string().max(120).optional(),
})

/** POST /api/v1/classroom/join */
export const classroomJoinSchema = z.object({
  code: z.string().trim().toLowerCase().min(4, 'Join-Code zu kurz').max(20, 'Join-Code zu lang').regex(/^[a-z-]+$/, 'Join-Code enthaelt ungueltige Zeichen'),
})

/** POST /api/v1/classroom/heartbeat */
export const classroomHeartbeatSchema = z.object({
  sessionId:        z.string().trim().min(1, 'sessionId erforderlich').max(128),
  participantId:    z.string().trim().min(1, 'participantId erforderlich').max(128),
  participantToken: z.string().trim().min(1, 'participantToken erforderlich').max(256),
})

/** POST /api/v1/classroom/sessions/:id/exports */
export const classroomCreateExportSchema = z.object({
  type: z.enum(['csv', 'pdf']),
})

/** GET /api/v1/classroom/sessions/:id/query */
export const classroomListQuerySchema = z.object({
  state: CLASSROOM_STATE.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})
