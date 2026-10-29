import express          from 'express'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchKollokatorenAnalyse, MIN_KOLLOKATOREN, fetchBonusQuestion, fetchRelation, fetchZeitenwende, fetchZeitenwendeAnalyze, lemmaExistsInWortprofil, toId } from '../wortprofil.js'
import { buildLueckenfuellerImWorker, leereLueckenfuellerWorkerCache } from '../lueckenfuellerImWorker.js'
import { fetchBelegeGeprueft, planePruefungFuerTage, pruefungStatus } from '../belegPruefung/index.js'
import { fetchWiktionary } from '../wiktionary.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { loadKalender, loadDailyContentMaps, loadWortZwilling, getLemmataIndex, invalidateCache, getCacheMetrics, DATA, stmts, lemmaToRow, replaceAllAdminData, getAuswertungSpiele, getAuswertungZeilen, loadBackupFiles, loadAllSpezialwochen, loadSpezialwocheByWoche, saveSpezialwoche, deleteSpezialwoche, saveTagAtomically, deleteTagsAtomically } from '../store.js'
import { getCacheMetrics as getQueryCacheMetrics, clearCache as clearQueryCache } from '../query-cache.js'
import { adminLimiter, adminBildLimiter, loginLimiter } from '../middleware/rateLimiter.js'
import { requireAuth, adminAuth, adminLogout, adminError, serverError } from '../middleware/auth.js'
import { validate, adminTagSchema, analyzeKollQuerySchema, analyzeWZQuerySchema, analyzeZWendeQuerySchema, analyzeLueckenfuellerQuerySchema, lueckenfuellerGenerateSchema, adminUsersQuerySchema, adminSetUserRoleSchema, adminUserIdParamsSchema, adminUsersBulkUpdateSchema, adminBulkDeleteCalendarSchema, adminPreviewLemmaSchema, adminEntwurfIdParamsSchema, adminBackupRestoreSchema, adminBackupPruefenSchema, adminBackupSqliteSchema, adminAuswertungSpieleQuerySchema, adminStatsExportQuerySchema, adminAuditLogQuerySchema, adminSocialCardsTagesdataSchema, adminSocialCardsBelegeSchema, adminSocialCardsEntwuerfeQuerySchema, adminSocialCardsEntwurfParamsSchema, adminSocialCardsEntwurfPatchSchema, adminSocialCardsEigenSchema, adminSpezialwocheSchema, adminSpezialwocheParamsSchema, adminClassroomStatsQuerySchema, adminPaymentsSummaryQuerySchema, adminCustomLemmaSummaryQuerySchema, adminRetentionQuerySchema } from '../middleware/validate.js'
import { auditCreate, auditUpdate, auditDelete, queryAuditLog } from '../audit.js'
import { ladeOffeneEntwuerfe, ladeEntwurf, entscheideEntwurf } from '../store-entwuerfe.js'
import { ladeEntwuerfe as ladeSocialEntwuerfe, ladeEntwurf as ladeSocialEntwurf, setzeCaption as setzeSocialCaption, setzeStatus as setzeSocialStatus, ladePost as ladeSocialPost, ladePostsFuer as ladeSocialPostsFuer } from '../socialCards/store.js'
import { webUrl as blueskyWebUrl, blueskyKonfiguriert } from '../socialCards/bluesky.js'
import { postenModus, POST_ZEIT as SOCIAL_POST_ZEIT } from '../jobs/socialPosting.js'
import { erzeugeEntwuerfe as erzeugeSocialEntwuerfe, erneuereEntwurf as erneuereSocialEntwurf, legeEigenenEntwurfAb as legeEigenenSocialEntwurfAb, bildPfad as socialBildPfad, berlinHeute, HORIZONT_TAGE as SOCIAL_HORIZONT_TAGE, AUFBEWAHRUNG_TAGE as SOCIAL_AUFBEWAHRUNG_TAGE } from '../jobs/socialCardDrafts.js'
import { verschiebeDatum } from '../socialCards/entwuerfe.js'
import logger from '../logger.js'
import { createAdminAuditRouter } from './admin-audit.js'
import { createAdminUsersRouter } from './admin-users.js'
import { createAdminBackupRouter } from './admin-backup.js'
import { createAdminStatsRouter } from './admin-stats.js'
import { createAdminOpsRouter } from './admin-ops.js'
import { createAdminCalendarRouter, leereLueckenfuellerCache } from './admin-calendar.js'
import { createAdminSocialCardsRouter } from './admin-social-cards.js'
import { createAdminCoreRouter } from './admin-core.js'
import freeDaysRouter from './admin-free-days.js'
import adminPushRouter from './admin-push.js'
import { createAdminSpezialwocheRouter } from './admin-spezialwoche.js'
import { createAdminClassroomRouter } from './admin-classroom.js'
import { createAdminProductMetricsRouter } from './admin-product-metrics.js'
import {
  countUsersStmt,
  countUsersByRoleStmt,
  countUsersFilteredStmt,
  listUsersStmt,
  getUserDetailsStmt,
  getUserStatsByGameStmt,
  getUserRecentStatsStmt,
  getUserKaufStmt,
  getUserZahlungenStmt,
  getUserKontoMetaStmt,
  ensureProfileStmt,
  setUserRoleStmt,
  getUsersByIdsStmt,
  deleteUser,
  adminUsersStatsStmt,
  toCsvCell,
} from './admin-users-data.js'
import { sanitizeBackupBundle } from './admin-backup-utils.js'
import { buildModeGroups } from './admin-calendar-utils.js'
import { getDebugLogs, clearDebugLogs } from './public.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = express.Router()

// ── Debug-Log-Reader (Diagnose-Helper) ───────────────────────────────────────
// Liefert die letzten 200 client-debug Posts aus dem In-Memory-Ring-Buffer.
// Genutzt, wenn TestFlight-App nicht startet und Safari Web Inspector keine
// Option ist – der eingeloggte Admin kann die Bootstrap-Logs hier auslesen.
router.get('/admin/debug-logs', requireAuth, (_req, res) => {
  res.json({ logs: getDebugLogs() })
})
router.delete('/admin/debug-logs', requireAuth, (_req, res) => {
  clearDebugLogs()
  res.json({ ok: true })
})

router.use(createAdminCoreRouter({
  adminLimiter,
  loginLimiter,
  requireAuth,
  adminAuth,
  adminLogout,
  adminHtmlPath: join(__dirname, '../admin.html'),
  adminAssetsDir: join(__dirname, '../public'),
}))

router.use(createAdminUsersRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminUsersQuerySchema,
  adminSetUserRoleSchema,
  adminUserIdParamsSchema,
  adminUsersBulkUpdateSchema,
  countUsersStmt,
  countUsersByRoleStmt,
  countUsersFilteredStmt,
  listUsersStmt,
  getUserDetailsStmt,
  getUserStatsByGameStmt,
  getUserRecentStatsStmt,
  getUserKaufStmt,
  getUserZahlungenStmt,
  getUserKontoMetaStmt,
  ensureProfileStmt,
  setUserRoleStmt,
  getUsersByIdsStmt,
  deleteUser,
  adminUsersStatsStmt,
  toCsvCell,
  auditUpdate,
  auditDelete,
  adminError,
  logger,
}))

router.use(createAdminStatsRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminAuswertungSpieleQuerySchema,
  adminStatsExportQuerySchema,
  getAuswertungSpiele,
  getAuswertungZeilen,
  adminError,
}))

router.use(createAdminClassroomRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminClassroomStatsQuerySchema,
  auditUpdate,
  adminError,
}))

router.use(createAdminProductMetricsRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminPaymentsSummaryQuerySchema,
  adminCustomLemmaSummaryQuerySchema,
  adminRetentionQuerySchema,
  adminError,
}))

router.use(createAdminOpsRouter({
  adminLimiter,
  requireAuth,
  loadKalender,
  getCacheMetrics,
  getQueryCacheMetrics,
  clearQueryCache,
  leereLueckenfuellerCache: () => {
    leereLueckenfuellerCache()
    leereLueckenfuellerWorkerCache()
  },
  pruefungStatus,
  planePruefungFuerTage,
  fetchRelation,
  DATA,
  adminError,
  logger,
}))

router.use(createAdminCalendarRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminTagSchema,
  analyzeKollQuerySchema,
  analyzeWZQuerySchema,
  analyzeZWendeQuerySchema,
  analyzeLueckenfuellerQuerySchema,
  lueckenfuellerGenerateSchema,
  adminBulkDeleteCalendarSchema,
  adminPreviewLemmaSchema,
  adminEntwurfIdParamsSchema,
  ladeOffeneEntwuerfe,
  ladeEntwurf,
  entscheideEntwurf,
  loadDailyContentMaps,
  deleteTagsAtomically,
  getLemmataIndex,
  invalidateCache,
  stmts,
  lemmaToRow,
  fetchLemma,
  fetchKollokatorenAnalyse,
  MIN_KOLLOKATOREN,
  fetchBonusQuestion,
  fetchZeitenwende,
  fetchZeitenwendeAnalyze,
  fetchWiktionary,
  fetchWortZwilling,
  buildModeGroups,
  // Im Worker-Thread: Die Berechnung braucht beim ersten Aufruf 8–15 s und hielt sonst den Server an
  buildLueckenfueller: buildLueckenfuellerImWorker,
  planeBelegPruefung: planePruefungFuerTage,
  toId,
  saveTagAtomically,
  auditCreate,
  auditDelete,
  adminError,
  serverError,
  logger,
}))

/** GET /admin/audit-log – Audit-Protokoll der letzten Admin-Änderungen */
router.use(createAdminAuditRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminAuditLogQuerySchema,
  queryAuditLog,
  adminError,
}))

router.use(createAdminBackupRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminBackupRestoreSchema,
  adminBackupPruefenSchema,
  adminBackupSqliteSchema,
  loadBackupFiles,
  replaceAllAdminData,
  sanitizeBackupBundle,
  auditCreate,
  auditUpdate,
  adminError,
  serverError,
  logger,
}))


router.use(createAdminSocialCardsRouter({
  requireAuth,
  adminLimiter,
  adminBildLimiter,
  validate,
  adminSocialCardsTagesdataSchema,
  adminSocialCardsBelegeSchema,
  adminSocialCardsEntwuerfeQuerySchema,
  adminSocialCardsEntwurfParamsSchema,
  adminSocialCardsEntwurfPatchSchema,
  adminSocialCardsEigenSchema,
  loadKalender,
  loadWortZwilling,
  getLemmataIndex,
  fetchBelege: fetchBelegeGeprueft,
  ladeEntwuerfe: ladeSocialEntwuerfe,
  ladeEntwurf: ladeSocialEntwurf,
  setzeCaption: setzeSocialCaption,
  setzeStatus: setzeSocialStatus,
  ladePost: ladeSocialPost,
  ladePostsFuer: ladeSocialPostsFuer,
  webUrl: blueskyWebUrl,
  erzeugeEntwuerfe: () => erzeugeSocialEntwuerfe(),
  erneuereEntwurf: (entwurf) => erneuereSocialEntwurf(entwurf),
  legeEigenenEntwurfAb: (eingabe, optionen) => legeEigenenSocialEntwurfAb(eingabe, optionen),
  bildPfad: (entwurf, optionen) => socialBildPfad(entwurf, optionen),
  berlinHeute,
  verschiebeDatum,
  auditCreate,
  auditUpdate,
  adminError,
  entwurfEinstellungen: () => ({
    automatisch: process.env.SOCIAL_CARDS_ENTWUERFE !== 'off',
    horizont: SOCIAL_HORIZONT_TAGE,
    aufbewahrung: SOCIAL_AUFBEWAHRUNG_TAGE,
    // Veröffentlichen auf Bluesky: aus / test (nur Log) / on – und ob der Zugang in der .env steht
    posten: postenModus(),
    postZeit: `${SOCIAL_POST_ZEIT.stunde}:${String(SOCIAL_POST_ZEIT.minute).padStart(2, '0')}`,
    blueskyEingerichtet: blueskyKonfiguriert(),
  }),
  kartenModulPath: join(__dirname, '../../shared/socialCards.js'),
}))

router.use(freeDaysRouter)
router.use(adminPushRouter)

router.use(createAdminSpezialwocheRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminSpezialwocheSchema,
  adminSpezialwocheParamsSchema,
  analyzeWZQuerySchema,
  loadAllSpezialwochen,
  loadSpezialwocheByWoche,
  saveSpezialwoche,
  deleteSpezialwoche,
  getLemmataIndex,
  lemmaExistsInWortprofil,
  fetchWortZwilling,
  toId,
  auditCreate,
  auditUpdate,
  auditDelete,
  adminError,
  serverError,
  logger,
}))

export default router
