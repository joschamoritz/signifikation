import { z } from 'zod/v3'
import { isBlockedNickname } from '../classroom/nickname-filter.js'

/**
 * Middleware-Factory: validiert req[source] gegen ein Zod-Schema.
 * Bei Fehler → 400 mit erstem Fehlermessage; bei Erfolg → req[source] = geparste Daten.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      // Guard: bei (theoretisch) leerem ZodError keinen TypeError werfen → 400 mit Fallback
      const message = result.error?.errors?.[0]?.message || 'Ungültige Eingabe'
      return res.status(400).json({ error: message })
    }
    // req.body kann direkt ersetzt werden; req.query/params sind in Express 5
    // getter-only → bestehendes Objekt in-place ERSETZEN (nicht mergen):
    // erst alle vorhandenen Keys löschen, dann die validierten Daten zuweisen.
    // Sonst blieben nicht-deklarierte Query-Params auf req[source] liegen.
    if (source === 'body') {
      req.body = result.data
    } else {
      const target = req[source]
      for (const key of Object.keys(target)) delete target[key]
      Object.assign(target, result.data)
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


const WORT_REGEX = /^[a-zA-ZäöüÄÖÜß-]+$/

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

/**
 * GET /api/v1/custom-lemma/validate (query) – Eignungsprüfung für Eigenes-Lemma.
 * Wort-Zwilling braucht ein Paar (a & b), die anderen Modi ein Einzelwort (q).
 */
export const customLemmaValidateSchema = z.object({
  mode: z.enum(VALID_GAMES),
  q:   z.string().min(1).max(100).regex(WORT_REGEX, 'q enthält ungültige Zeichen').optional(),
  a:   z.string().min(1).max(100).regex(WORT_REGEX, 'a enthält ungültige Zeichen').optional(),
  b:   z.string().min(1).max(100).regex(WORT_REGEX, 'b enthält ungültige Zeichen').optional(),
  pos: z.enum(['Substantiv', 'Verb', 'Adjektiv']).optional(),
}).refine(
  (data) => (data.mode === 'wortzwilling' ? Boolean(data.a && data.b) : Boolean(data.q)),
  { message: 'Wort-Zwilling benötigt a und b, andere Modi benötigen q' },
)

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

/** GET /admin/classroom/stats (query) — W2-T6 */
export const adminClassroomStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

// ── Produkt-Kennzahlen (Daten-Instrumentierung) ─────────────────
// Alle vier Endpunkte teilen denselben einfachen Tagesfenster-Parameter.
const productDaysWindowSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

/** GET /admin/payments/summary (query) */
export const adminPaymentsSummaryQuerySchema = productDaysWindowSchema
/** GET /admin/custom-lemma/summary (query) */
export const adminCustomLemmaSummaryQuerySchema = productDaysWindowSchema
/** GET /admin/stats/retention (query) */
export const adminRetentionQuerySchema = productDaysWindowSchema
/** GET /admin/classroom/teachers (query) */
export const adminClassroomTeachersQuerySchema = productDaysWindowSchema

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

// ── IAP Schemas ────────────────────────────────────────────────

const VALID_IAP_PRODUCT_IDS = [
  'de.signifikation.gesamtausgabe.petit',
  'de.signifikation.gesamtausgabe.korpus',
  'de.signifikation.gesamtausgabe.cicero',
]

// JWS-Tokens sind Base64URL-codiert (drei Teile, Punkt-getrennt).
// Wir begrenzen die Länge defensiv – Apple JWS sind typischerweise < 8 KB.
const IAP_JWS = z.string().min(50).max(16_000)
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'jwsRepresentation muss Base64URL-JWS sein')

/** POST /api/v1/iap/verify */
export const iapVerifySchema = z.object({
  jwsRepresentation: IAP_JWS,
  productId: z.enum(VALID_IAP_PRODUCT_IDS),
})

/** POST /api/v1/iap/restore */
export const iapRestoreSchema = z.object({
  transactions: z.array(z.object({
    jwsRepresentation: IAP_JWS,
    productId: z.enum(VALID_IAP_PRODUCT_IDS),
  })).min(1, 'transactions darf nicht leer sein').max(20, 'Maximal 20 Transaktionen pro Restore'),
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

/** DELETE /api/v1/account/sessions/:id (params)
 *  Opake String-ID, weil better-auth-Session-IDs nicht zwingend UUIDs sind
 *  (random hex/base64). */
export const accountIdParamsSchema = z.object({
  id: z.string().trim().min(8, 'ID zu kurz').max(128, 'ID zu lang').regex(/^[A-Za-z0-9_-]+$/, 'ID enthält ungültige Zeichen'),
})

// ── Classroom Schemas ───────────────────────────────────────────
// (Die fruehere v1-Schema-Gruppe — classroomCreateSessionSchema etc. — war
//  toter Code; die v1-Routen/-Tabellen wurden mit Migration 0006 entfernt.
//  W4-S2: die ehemals `cr2*` benannten Schemas heissen jetzt schlicht
//  `classroom*` und sind die einzige aktive Variante.)

const CLASSROOM_VALID_MODES = z.enum(['kollokationen', 'wortzwilling', 'zeitenwende', 'lueckenfueller'])
const CLASSROOM_LEMMA_ID    = z.string().trim().min(1, 'lemmaId darf nicht leer sein').max(128, 'lemmaId zu lang')

/** POST /api/v1/classroom/sessions (T-2.1) */
export const classroomCreateSessionSchema = z.object({
  title:    z.string().trim().max(120, 'Titel zu lang').optional(),
  settings: z.record(z.unknown()).optional().default({}),
})

/** POST /api/v1/classroom/sessions/:id/assignments (T-2.2) — Einzel-Block */
export const classroomCreateAssignmentSchema = z.object({
  mode:     CLASSROOM_VALID_MODES,
  lemmaIds: z.array(CLASSROOM_LEMMA_ID)
    .min(1, 'Mindestens 1 Lemma erforderlich')
    .max(3, 'Maximal 3 Lemmata pro Assignment (D3)'),
})

/**
 * POST /api/v1/classroom/sessions/:id/assignments/bulk (W2-T2)
 * Mehrere (Modus + Lemmata)-Bloecke in Reihenfolge. Min 1, max 5 Bloecke;
 * pro Block weiterhin max. 3 Lemmata (D3). Der Server friert content_snapshot
 * pro Block beim Anlegen ein.
 */
export const classroomCreateAssignmentsSchema = z.object({
  blocks: z.array(classroomCreateAssignmentSchema)
    .min(1, 'Mindestens 1 Modus-Block erforderlich')
    .max(5, 'Maximal 5 Modus-Bloecke pro Session (W2-T2)'),
})

/** POST /api/v1/classroom/sessions/:id/next-assignment (W2-T2) */
export const classroomNextAssignmentSchema = z.object({})

/** GET /api/v1/classroom/lemmata (T-2.3) */
export const classroomLemmataQuerySchema = z.object({
  q:     z.string().trim().max(100).optional(),
  pos:   POS.optional(),
  mode:  CLASSROOM_VALID_MODES.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

/** GET /api/v1/classroom/today-lemmata — Tagesauswahl als Schnellzugriff */
export const classroomTodayLemmataQuerySchema = z.object({
  mode: CLASSROOM_VALID_MODES.optional(),
})

/** POST /api/v1/classroom/join (T-2.5) */
export const classroomJoinSchema = z.object({
  code:        z.string().trim().toLowerCase()
                 .min(4, 'Join-Code zu kurz')
                 .max(30, 'Join-Code zu lang')
                 .regex(/^[a-z-]+$/, 'Join-Code enthaelt ungueltige Zeichen'),
  // displayName wird im Lehrer-Dashboard angezeigt → Winkelklammern verbieten
  // (Stored-XSS-Defense-in-Depth; React escaped ohnehin). Zusätzlich
  // Moderations-Blockliste (H2): unmissverständliche Beleidigungen/Slurs vom
  // Beamer fernhalten, bevor die Lehrkraft kicken muss.
  displayName: z.string().trim().max(20)
    .regex(/^[^<>]*$/, 'Name enthaelt ungueltige Zeichen')
    .refine((v) => !isBlockedNickname(v), 'Bitte wähle einen anderen Namen.')
    .optional(),
})

/**
 * POST /api/v1/classroom/me/submit (T-2.7)
 * WICHTIG (D13/R6): kein score-Feld! rawAnswer ist ein opakes JSON-Objekt;
 * der Server berechnet den Score ausschliesslich server-seitig.
 */
export const classroomSubmitSchema = z.object({
  assignmentId: z.string().trim().min(1, 'assignmentId erforderlich').max(128),
  lemmaId:      CLASSROOM_LEMMA_ID,
  roundIndex:   z.coerce.number().int().min(0).max(99).optional().default(0),
  rawAnswer:    z.record(z.unknown())
                  // Größenlimit bereits in der Validierung (vor dem Scoring):
                  // verhindert riesige/tief verschachtelte Payloads (Security M1).
                  .refine((v) => { try { return JSON.stringify(v).length <= 8000 } catch { return false } },
                          'rawAnswer zu groß')
                  .optional().default({}),
  clientMs:     z.number().int().min(0).max(600_000).optional(),
})

/** POST /api/v1/classroom/sessions/:id/start (T-2.4) */
export const classroomStartSessionSchema = z.object({
  allowLateJoin: z.boolean().optional().default(true),
})

/** POST /api/v1/classroom/sessions/:id/finish (T-2.4) */
export const classroomFinishSessionSchema = z.object({
  reason: z.string().trim().max(120).optional(),
})

/** POST /api/v1/classroom/sessions/:id/duplicate (W4) — optional neuer Titel */
export const classroomDuplicateSessionSchema = z.object({
  title: z.string().trim().max(120, 'Titel zu lang').optional(),
})

/** POST /api/v1/classroom/sessions/:id/pause (W2-T3) */
export const classroomPauseSessionSchema = z.object({})

/** POST /api/v1/classroom/sessions/:id/resume (W2-T3) */
export const classroomResumeSessionSchema = z.object({})

/** GET /api/v1/classroom/sessions (T-2.10) */
export const classroomListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
})

/** GET /api/v1/classroom/sessions/:id/results (W2-T4) — Params */
export const classroomSessionIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'Session-ID erforderlich').max(128, 'Session-ID zu lang'),
})

// ── Kurs (Course) Schemas ───────────────────────────────────────
// Niveaus = verbindliche Stufen aus planning/Kurs-Differenzierung.md.
const COURSE_LEVEL  = z.enum(['DaZ', 'SekI', 'SekII', 'LK'])
const COURSE_FORMAT = z.enum(['F1', 'F2', 'F3', 'F4', 'F5'])
const COURSE_KIND   = z.enum(['beamer', 'arbeitsblatt', 'loesung', 'unterrichtsentwurf'])
const COURSE_STATUS = z.enum(['idle', 'in-progress', 'done'])
// Stations-IDs sind kurze Slugs (z.B. 's1'); kein freier Text.
const COURSE_ID     = z.string().trim()
  .min(1, 'id erforderlich')
  .max(64, 'id zu lang')
  .regex(/^[a-z0-9-]+$/, 'id enthält ungültige Zeichen')
// Material-IDs tragen das Niveau-Suffix (z.B. 's1-arbeitsblatt-SekI') und
// dürfen daher Großbuchstaben enthalten — sonst wie COURSE_ID.
const COURSE_MATERIAL_ID = z.string().trim()
  .min(1, 'materialId erforderlich')
  .max(96, 'materialId zu lang')
  .regex(/^[A-Za-z0-9-]+$/, 'materialId enthält ungültige Zeichen')

/** GET /api/v1/course/stations/:id, …/tasks, …/materials (params) */
export const courseStationIdParamsSchema = z.object({ id: COURSE_ID })

/** GET /api/v1/course/stations/:id/tasks (query) */
export const courseTasksQuerySchema = z.object({
  level:  COURSE_LEVEL.optional(),
  format: COURSE_FORMAT.optional(),
})

/** GET /api/v1/course/stations/:id/materials (query) */
export const courseMaterialsQuerySchema = z.object({
  level: COURSE_LEVEL.optional(),
  kind:  COURSE_KIND.optional(),
})

/** GET /api/v1/course/stations/:id/materials/:materialId/download (params) */
export const courseMaterialDownloadParamsSchema = z.object({
  id:         COURSE_ID,
  materialId: COURSE_MATERIAL_ID,
})

/** PUT /api/v1/course/progress/:stationId (params) */
export const courseProgressStationParamsSchema = z.object({ stationId: COURSE_ID })

/** PUT /api/v1/course/progress/:stationId (body) */
export const courseProgressUpdateSchema = z.object({ status: COURSE_STATUS })
