import { z } from 'zod/v3'
import { isBlockedNickname } from '../classroom/nickname-filter.js'
import { SPIELMODI, STAT_SPIELE } from '../spielmodi.js'
import { berlinTag, plusTage } from '../date-utils.js'

/**
 * Middleware-Factory: validiert req[source] gegen ein Zod-Schema.
 * Bei Fehler → 400 mit erstem Fehlermessage; bei Erfolg → req[source] = geparste Daten.
 */
export function validate(schema, source = 'body', { mitFeld = false } = {}) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source])
    if (!result.success) {
      // Guard: bei (theoretisch) leerem ZodError keinen TypeError werfen → 400 mit Fallback
      const message = result.error?.errors?.[0]?.message || 'Ungültige Eingabe'
      // Mit mitFeld nennt die Antwort das Feld des ersten Fehlers (Formulare zeigen die Meldung am Feld an)
      const feld = mitFeld ? result.error?.errors?.[0]?.path?.[0] : undefined
      return res.status(400).json(typeof feld === 'string' ? { error: message, feld } : { error: message })
    }
    if (source === 'body') {
      req.body = result.data
    } else if (source === 'query') {
      // Express 5 definiert req.query als Getter, der die Query bei JEDEM
      // Zugriff neu aus der URL parst (express/lib/request.js, kein Cache).
      // Eine In-place-Mutation landet damit auf einem Wegwerf-Objekt – die
      // Coercion (z.coerce) und die .default()-Werte kämen im Handler nie an.
      // Deshalb den Getter durch eine eigene Data-Property ersetzen.
      // Nebeneffekt (gewollt): nicht deklarierte Query-Parameter sind ab hier
      // weg – der Handler sieht genau das, was das Schema erlaubt.
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        enumerable: true,
        configurable: true,
      })
    } else {
      // req.params ist eine gewöhnliche Property – in-place ERSETZEN
      // (erst leeren, dann zuweisen), damit der Router-Kontext erhalten bleibt.
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
// Die vier Tagesmodi (Quelle: spielmodi.js). Statistik-Schlüssel dürfen zusätzlich `woche_<modus>` sein.
const VALID_GAMES = SPIELMODI

// ── Schemata ─────────────────────────────────────────────────

// Spieltag eines Statistik-Ergebnisses: ein echter Kalendertag, gestern bis morgen (Berliner Zeit). Die App sendet
// den Tag des Tagesinhalts (= heute); gestern/morgen decken Mitternacht, Zeitzonen und eine nachgehende Uhr ab.
// Zusätzlich gilt jeder Tag ab dem Montag der laufenden Woche: App-Versionen vor Schritt 8 melden Spiele zum Wort der
// Woche auf den Montag (spezialwoche.von). Alles andere (2099, 2001, 2026-02-31) würde die Auswertung verfälschen. Ein
// Ergebnis mit alt zwischengespeichertem Tag (Offline-Fallback) wird abgewiesen – postStat ist fire-and-forget.
const STAT_DATUM = DATUM_ISO.superRefine((datum, ctx) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return // das Format meldet DATUM_ISO selbst
  if (plusTage(datum, 0) !== datum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'datum ist kein gültiger Kalendertag' })
    return
  }
  const heute = berlinTag()
  const montag = plusTage(heute, -((new Date(`${heute}T00:00:00Z`).getUTCDay() + 6) % 7))
  const frueheste = montag < plusTage(heute, -1) ? montag : plusTage(heute, -1)
  if (datum < frueheste || datum > plusTage(heute, 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'datum muss zwischen dem Montag dieser Woche bzw. gestern und morgen liegen' })
  }
})

/** POST /api/stats – score darf max nicht übersteigen (sonst hebt ein manipulierter Aufruf den Durchschnitt über 10) */
export const statsSchema = z.object({
  game:  z.enum(STAT_SPIELE),
  datum: STAT_DATUM,
  score: z.number().int().min(0).max(100),
  max:   z.number().int().positive('max muss > 0 sein').max(100),
}).refine((b) => b.score <= b.max, { message: 'score darf max nicht übersteigen', path: ['score'] })

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

/** GET /api/v1/woerter (Archiv-Tab-Liste, optionale Suche q=) */
export const woerterQuerySchema = z.object({
  q: z.string().max(60).optional(),
})

/** GET /api/bonus (query: id=) */
export const bonusQuerySchema = z.object({
  id: z.string().min(1, 'id erforderlich'),
})

/** GET /api/v1/heute, /api/v1/wortzwilling, /api/v1/zeitenwende (query: datum=YYYY-MM-DD) */
export const datumQuerySchema = z.object({
  datum: DATUM_ISO.optional(),
})

// Links erscheinen in der App (Tag-Editor und Wort der Woche): nur leer oder http(s)://…
const LINK_HTTP = z.string().trim().max(500, 'Der Link darf höchstens 500 Zeichen lang sein.')
  .regex(/^(https?:\/\/\S+)?$/i, 'Der Link muss mit http:// oder https:// beginnen.')

/** POST /admin/tag */
export const adminTagSchema = z.object({
  datum:                DATUM_ISO,
  woerter:              z.array(z.string().min(1).max(100)).length(3, 'genau 3 Wörter erforderlich'),
  notizen:              z.array(z.string().max(500)).optional().default([]),
  links:                z.array(LINK_HTTP).optional().default([]),
  definitionen:         z.array(z.string().max(2000)).optional().default([]),
  positionen:           z.array(POS).optional().default([]),
  thema:                z.string().max(200).optional().default(''),
  thema_kurz:           z.string().max(300).optional().default(''),
  thema_quelle:         z.string().max(500).optional().default(''),
  zwilling_paar:        z.union([z.array(z.string().max(100)).length(2), z.null()]).optional().default(null),
  zwilling_pos:         POS,
  zwilling_notiz:       z.string().max(500).optional().default(''),
  zwilling_link:        LINK_HTTP.optional().default(''),
  zeitenwende_lemma:    z.string().max(100).optional().default(''),
  zeitenwende_notiz:    z.string().max(500).optional().default(''),
  zeitenwende_link:     LINK_HTTP.optional().default(''),
  lueckenfueller_id:    z.string().max(120).optional().default(''),
})


/** GET /admin/analyze-kollokation (query) */
export const analyzeKollQuerySchema = z.object({
  q:   z.string().trim().min(1, 'q= erforderlich').max(100, 'Höchstens 100 Zeichen'),
  pos: POS.optional(),
})

/** GET /admin/analyze-wortzwilling (query) */
export const analyzeWZQuerySchema = z.object({
  a:   z.string().trim().min(1, 'a= erforderlich').max(100, 'Höchstens 100 Zeichen'),
  b:   z.string().trim().min(1, 'b= erforderlich').max(100, 'Höchstens 100 Zeichen'),
  pos: POS,
})

/** GET /admin/analyze-zeitenwende (query) */
export const analyzeZWendeQuerySchema = z.object({
  q: z.string().trim().min(1, 'q= erforderlich').max(100, 'Höchstens 100 Zeichen'),
})

/**
 * GET /admin/analyze-lueckenfueller (query) – Eignungsprüfung für ein
 * beliebiges Wort, unabhängig davon, ob es bereits als Lemma existiert
 * (pos optional: fehlt sie, probiert der Handler alle drei Wortarten).
 */
export const analyzeLueckenfuellerQuerySchema = z.object({
  q:   z.string().trim().min(1, 'q= erforderlich').max(100, 'Höchstens 100 Zeichen'),
  pos: POS.optional(),
})

/** POST /admin/lueckenfueller/generate – legt bei Bedarf ein neues Lemma an. */
export const lueckenfuellerGenerateSchema = z.object({
  lemmaName: z.string().min(1, 'lemmaName erforderlich').max(100),
  pos:       POS.optional(),
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
  offset: z.coerce.number().int().min(0).optional().default(0),
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

/** POST /admin/preview/lemma */
export const adminPreviewLemmaSchema = z.object({
  lemma: z.string().trim().min(1, 'lemma erforderlich').max(100, 'lemma zu lang'),
  pos: POS.optional().default('Substantiv'),
})

/** POST /admin/entwuerfe/:id/uebernehmen und /verwerfen */
export const adminEntwurfIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/** POST /api/v1/lemma-entwuerfe (Vorschlags-API): bis zu zwei Wochen je Push, jedes Datum einmal */
export const lemmaEntwurfPushSchema = z.object({
  tage: z.array(adminTagSchema).min(1, 'mindestens ein Tag').max(14, 'höchstens 14 Tage je Push'),
}).refine(
  (body) => new Set(body.tage.map((tag) => tag.datum)).size === body.tage.length,
  { message: 'Jedes Datum darf nur einmal vorkommen', path: ['tage'] },
)

/** POST /admin/backup/restore */
export const adminBackupRestoreSchema = z.object({
  confirm: z.literal(true),
  exportedAt: z.string().max(40).optional(),
  files: z.record(z.any()),
  // Die Datei enthält die Spielstatistik nur ohne Konten (zusammengefasst). Sie zu
  // ersetzen löscht die Statistik je Konto – deshalb nur auf ausdrücklichen Wunsch.
  mitStatistik: z.boolean().optional().default(false),
})

/** POST /admin/backup/restore/pruefen – Probelauf: dieselbe Datei, ohne Bestätigung und ohne etwas zu schreiben */
export const adminBackupPruefenSchema = z.object({
  exportedAt: z.string().max(40).optional(),
  files: z.record(z.any()),
})

/** POST /admin/backup/sqlite – ohne Eingaben; ein leeres Objekt (oder gar kein Body) ist erlaubt */
export const adminBackupSqliteSchema = z.object({}).strict().optional().default({})

// `?frisch=1` („neu laden“ im Admin): der Zwischenspeicher der Auswertung wird übergangen. Nur Admins erreichen diese
// Routen (requireAuth); der Wert ändert nichts am Schlüssel des Zwischenspeichers, es gibt keine zweite Variante.
const FRISCH = z.enum(['1']).optional().transform((v) => v === '1')

/** GET /admin/auswertung/spiele (query) – Kalendertage inklusive heute */
export const adminAuswertungSpieleQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
  frisch: FRISCH,
})

/** GET /admin/stats/export (query) – nur noch CSV; `format` bleibt für alte Links erlaubt und wird ignoriert */
export const adminStatsExportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

/** GET /admin/classroom/stats (query) — W2-T6 */
export const adminClassroomStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

// ── Produkt-Kennzahlen (Daten-Instrumentierung) ─────────────────
// Die Endpunkte teilen denselben einfachen Tagesfenster-Parameter (Kalendertage in Berliner Zeit, inklusive heute).
const productDaysWindowSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
})

/** GET /admin/payments/summary (query) */
export const adminPaymentsSummaryQuerySchema = productDaysWindowSchema
/** GET /admin/custom-lemma/summary (query) */
export const adminCustomLemmaSummaryQuerySchema = productDaysWindowSchema
/** GET /admin/stats/retention (query) – `frisch`: auch die Spiele-Zahlen darunter neu rechnen */
export const adminRetentionQuerySchema = productDaysWindowSchema.extend({ frisch: FRISCH })

// ── Bonus-Tage (free_days) Schemas ──────────────────────────────

/** POST /admin/free-days (body) */
// Mindestens 1 zusätzliches Spiel: Ein Bonus-Tag mit 0 wäre wirkungslos, stünde aber in Woche und Monat.
// Das Datum nicht in der Vergangenheit prüft die Route (Berliner Zeit).
export const BONUS_SPIELE_FEHLER = 'Bitte eine ganze Zahl von 1 bis 50 eintragen.'
export const adminFreeDayBodySchema = z.object({
  date: DATUM_ISO.refine(istKalendertag, 'Das Datum gibt es nicht.'),
  label: z.string().trim().max(100).optional().default(''),
  bonus_count: z.coerce.number({ invalid_type_error: BONUS_SPIELE_FEHLER, required_error: BONUS_SPIELE_FEHLER })
    .int(BONUS_SPIELE_FEHLER).min(1, BONUS_SPIELE_FEHLER).max(50, BONUS_SPIELE_FEHLER),
})

/** DELETE /admin/free-days/:date (params) */
export const adminFreeDayParamsSchema = z.object({
  date: DATUM_ISO,
})

// ── Push-Benachrichtigungen Schemas ─────────────────────────────

const PUSH_TITLE = z.string().trim().min(1, 'Titel erforderlich').max(120, 'Titel max. 120 Zeichen')
const PUSH_BODY  = z.string().trim().min(1, 'Text erforderlich').max(300, 'Text max. 300 Zeichen')

/** POST /admin/push/templates, PUT /admin/push/templates/:id (body) */
export const adminPushTemplateBodySchema = z.object({
  title: PUSH_TITLE,
  body: PUSH_BODY,
  // Nur beim Anlegen (POST) ausgewertet; PUT ändert die Kategorie nie.
  category: z.enum(['daily', 'streak']).optional(),
  // Legacy-Aufrufer senden enabled als 0/1 statt boolean - beides akzeptieren.
  enabled: z.union([z.boolean(), z.literal(0), z.literal(1)]).optional().default(1),
})

/** PUT/DELETE /admin/push/templates/:id (params) */
export const adminPushTemplateIdParamsSchema = z.object({
  id: z.coerce.number().int().positive('Ungültige ID'),
})

/**
 * POST /admin/push/send (body) — mode-abhaengige Pflichtfelder:
 *   mode=template → templateId erforderlich
 *   mode=free → title + body erforderlich
 *   mode=self → templateId (Test einer Vorlage) ODER title + body
 */
export const adminPushSendSchema = z.object({
  mode: z.enum(['free', 'template', 'self'], { errorMap: () => ({ message: 'mode muss "free", "template" oder "self" sein' }) }),
  templateId: z.coerce.number().int().positive('Ungültige Template-ID').optional(),
  title: z.string().trim().max(120, `Titel max. 120 Zeichen`).optional(),
  body: z.string().trim().max(300, `Text max. 300 Zeichen`).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === 'template' && !value.templateId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ungültige Template-ID', path: ['templateId'] })
  }
  if (value.mode === 'free' || (value.mode === 'self' && !value.templateId)) {
    if (!value.title) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Titel erforderlich', path: ['title'] })
    if (!value.body) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Text erforderlich', path: ['body'] })
  }
})

// 2026-13-01 und 2026-02-30 passen auf das Muster, sind aber keine Tage
function istKalendertag(text) {
  const [y, m, d] = text.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Alle Vorgänge im Änderungsprotokoll (audit.js: create/update/delete + auditSecurity-Ereignisse) */
export const AUDIT_ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE',
  'LOGIN_SUCCESS', 'LOGIN_FAIL', 'LOGOUT', 'SESSIONS_INVALIDATED',
  'CHECKOUT_REJECT_COUNTRY', 'PAYMENT_REJECT', 'WEBHOOK_REJECT', 'PAYMENT_REFUNDED', 'PAYMENT_REFUND_REVERSED',
]

/** GET /admin/audit-log (query) */
export const adminAuditLogQuerySchema = z.object({
  // Seit die Query-Validierung ihr Ergebnis wirklich durchreicht, muss limit
  // hier deklariert sein – sonst fiele der Parameter des Clients weg.
  // Untergrenze bewusst 1 (nicht die frühere Handler-Klammer von 10): das
  // Dashboard holt sich mit limit=5 die letzten fünf Vorgänge.
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  // Genau die Vorgänge, die server/audit.js und seine Aufrufer protokollieren.
  action: z.enum(AUDIT_ACTIONS).optional(),
  resource: z.string().trim().max(80).optional(),
  // Protokolliert wird 'FAIL' (middleware/auth.js, routes/payments.js); 'FAILED' bleibt für Altlasten und zählt gleich.
  status: z.enum(['SUCCESS', 'FAIL', 'FAILED']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from als YYYY-MM-DD').refine(istKalendertag, 'from ist kein gültiges Datum').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to als YYYY-MM-DD').refine(istKalendertag, 'to ist kein gültiges Datum').optional(),
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

/** GET /admin/social-cards/entwuerfe (query) – Fenster, Standard: heute bis +14 Tage */
export const adminSocialCardsEntwuerfeQuerySchema = z.object({
  von: DATUM_ISO.optional(),
  bis: DATUM_ISO.optional(),
})

/** /admin/social-cards/entwuerfe/:id (params) */
export const adminSocialCardsEntwurfParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * POST /admin/social-cards/entwuerfe/eigen – „Als Entwurf ablegen“ aus dem Editor. Die spec ist die Eingabe für
 * drawCard (shared/socialCards.js); geprüft werden Format und Darstellung, die Daten zeichnet der Server wie im Editor.
 */
export const adminSocialCardsEigenSchema = z.object({
  datum: DATUM_ISO,
  spec: z.object({
    format: z.enum(['A', 'B', 'C', 'X', 'T']),
    theme: z.enum(['hell', 'dunkel', 'rot']).optional().default('hell'),
    ratio: z.enum(['4:5', '9:16']).optional().default('4:5'),
    header: z.boolean().optional().default(true),
    data: z.record(z.unknown()),
  }),
  caption: z.string().trim().min(1, 'Der Beitragstext fehlt.').max(2200),
  hashtags: z.string().trim().max(300).optional().default(''),
  mitAufloesung: z.boolean().optional().default(false),
  ersetzen: z.boolean().optional().default(false),
})

/** POST /admin/social-cards/entwuerfe/:id – Caption und/oder Status */
export const adminSocialCardsEntwurfPatchSchema = z.object({
  caption: z.string().trim().min(1).max(2200).optional(),
  status: z.enum(['offen', 'freigegeben', 'verworfen']).optional(),
}).refine((b) => b.caption !== undefined || b.status !== undefined, { message: 'caption oder status erforderlich' })

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

/**
 * POST /api/v1/iap/notifications (App Store Server Notifications V2). Die äußere Signatur trägt die Zertifikatskette
 * und dazu die signierte Transaktion samt eigener Kette – deutlich größer als ein einzelnes Transaktions-JWS.
 */
export const iapNotificationSchema = z.object({
  signedPayload: z.string().min(50).max(60_000)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'signedPayload muss Base64URL-JWS sein'),
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

const SPEZIAL_LINK = LINK_HTTP.optional().default('')

/** POST /admin/spezialwoche */
export const adminSpezialwocheSchema = z.object({
  woche:              ISO_WOCHE,
  // Von/Bis rechnet der Server aus der Woche (Montag–Sonntag); abweichende Angaben werden ignoriert.
  von:                DATUM_ISO.optional(),
  bis:                DATUM_ISO.optional(),
  lemma_id:           z.string().trim().min(1, 'lemma_id erforderlich').max(120),
  zwilling_partner:   z.string().max(100).optional().default(''),
  zwilling_pos:       POS,
  zeitenwende_notiz:  z.string().max(500).optional().default(''),
  zeitenwende_link:   SPEZIAL_LINK,
  lueckenfueller_id:  z.string().max(120).optional().default(''),
  notiz:              z.string().max(500).optional().default(''),
  link:               SPEZIAL_LINK,
})

/** GET /admin/spezialwoche/:woche (params) */
export const adminSpezialwocheParamsSchema = z.object({
  woche: ISO_WOCHE,
})

/** GET /api/v1/spezialwoche (query: datum=) */
export const spezialwocheDatumQuerySchema = z.object({
  datum: DATUM_ISO.optional(),
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
// Der Grund steht in der Auswertung (Wie Sitzungen enden): nur 'manual' und 'completed' sind erlaubt, alles andere gilt als 'manual'.
// 'auto' schreibt allein der Server (Auto-Ende nach Inaktivität).
export const CLASSROOM_FINISH_GRUENDE = ['manual', 'completed']
export const classroomFinishSessionSchema = z.object({
  reason: z.string().trim().max(120)
    .transform((r) => (CLASSROOM_FINISH_GRUENDE.includes(r) ? r : 'manual'))
    .optional(),
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

/** DELETE /api/v1/classroom/sessions/:id/assignments/:aid — Params */
export const classroomAssignmentIdParamsSchema = z.object({
  id: z.string().trim().min(1, 'Session-ID erforderlich').max(128, 'Session-ID zu lang'),
  aid: z.string().trim().min(1, 'Assignment-ID erforderlich').max(128, 'Assignment-ID zu lang'),
})

/** POST /api/v1/classroom/sessions/:id/participants/:pid/kick — Params */
export const classroomParticipantKickParamsSchema = z.object({
  id: z.string().trim().min(1, 'Session-ID erforderlich').max(128, 'Session-ID zu lang'),
  pid: z.string().trim().min(1, 'Participant-ID erforderlich').max(128, 'Participant-ID zu lang'),
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
  level:   COURSE_LEVEL.optional(),
  format:  COURSE_FORMAT.optional(),
  // resolve=interactive → Items werden serverseitig mit Korpus aufgelöst (AP8).
  resolve: z.enum(['interactive']).optional(),
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

// Aufgaben-IDs (course_tasks.id, z.B. 's1-f1-zuordnen-daz-01') — wie
// COURSE_MATERIAL_ID Buchstaben/Ziffern/Bindestrich erlaubt.
const COURSE_TASK_ID = z.string().trim()
  .min(1, 'taskId erforderlich')
  .max(96, 'taskId zu lang')
  .regex(/^[A-Za-z0-9-]+$/, 'taskId enthält ungültige Zeichen')

/** GET /api/v1/course/stations/:id/results (query) */
export const courseResultsQuerySchema = z.object({ level: COURSE_LEVEL.optional() })

/** POST /api/v1/course/stations/:id/tasks/:taskId/result (params) */
export const courseTaskResultParamsSchema = z.object({ id: COURSE_ID, taskId: COURSE_TASK_ID })

/** POST /api/v1/course/stations/:id/tasks/:taskId/result (body) */
export const courseTaskResultBodySchema = z.object({
  level:   COURSE_LEVEL,
  // true|false geschlossen bewertet, null = reine Selbstkontrolle.
  correct: z.boolean().nullable(),
})

/** DELETE /api/v1/course/progress (query) – optional auf eine Station eingrenzen */
export const courseResetQuerySchema = z.object({ stationId: COURSE_ID.optional() })

/**
 * POST /api/v1/account/apple-token – authorizationCode aus dem nativen Apple-Login,
 * damit der Server die Anmeldung bei einer Kontolöschung widerrufen kann.
 */
export const appleTokenSchema = z.object({
  authorizationCode: z.string().min(10).max(2000).regex(/^[A-Za-z0-9._-]+$/, 'authorizationCode enthält ungültige Zeichen'),
})

/**
 * GET /api/v1/account/auth-options (query) – nativeGoogle=1 schicken nur
 * App-Versionen, die den nativen Google-Login eingebaut haben. Ältere Apps
 * bekämen sonst den Web-Redirect im WebView, den Google blockt.
 */
export const authOptionsQuerySchema = z.object({
  nativeGoogle: z.literal('1').optional(),
})
