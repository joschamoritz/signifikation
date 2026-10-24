import express          from 'express'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchKollokatorenAnalyse, MIN_KOLLOKATOREN, fetchBonusQuestion, fetchRelation, fetchZeitenwende, fetchZeitenwendeAnalyze, lemmaExistsInWortprofil, toId } from '../wortprofil.js'
import { buildLueckenfueller } from '../lueckenfueller.js'
import { fetchBelege } from '../belege.js'
import { fetchWiktionary } from '../wiktionary.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { loadKalender, loadDailyContentMaps, loadWortZwilling, getLemmataIndex, invalidateCache, getCacheMetrics, DATA, stmts, lemmaToRow, replaceAllAdminData, getStatsWindow, getStatsTimeline, loadBackupFiles, loadAllSpezialwochen, loadSpezialwocheByWoche, saveSpezialwoche, deleteSpezialwoche, saveTagAtomically, deleteTagsAtomically } from '../store.js'
import { getCacheMetrics as getQueryCacheMetrics, clearCache as clearQueryCache } from '../query-cache.js'
import { adminLimiter, loginLimiter, uploadLimiter } from '../middleware/rateLimiter.js'
import { requireAuth, adminAuth, adminLogout, adminError, serverError } from '../middleware/auth.js'
import { validate, qQuerySchema, adminTagSchema, analyzeKollQuerySchema, analyzeWZQuerySchema, analyzeZWendeQuerySchema, analyzeLueckenfuellerQuerySchema, lueckenfuellerGenerateSchema, adminUsersQuerySchema, adminSetUserRoleSchema, adminUserIdParamsSchema, adminUsersBulkUpdateSchema, adminBulkDeleteCalendarSchema, adminPreviewLemmaSchema, adminPreviewDayParamsSchema, adminLemmaIdParamsSchema, adminEntwurfIdParamsSchema, adminAuditLogDetailParamsSchema, adminBackupRestoreSchema, adminBackupPruefenSchema, adminBackupSqliteSchema, adminStatsQuerySchema, adminStatsSummaryQuerySchema, adminStatsExportQuerySchema, adminAuditLogQuerySchema, adminSocialCardsTagesdataSchema, adminSocialCardsBelegeSchema, adminSpezialwocheSchema, adminSpezialwocheParamsSchema, adminClassroomStatsQuerySchema, adminClassroomTeachersQuerySchema, adminPaymentsSummaryQuerySchema, adminCustomLemmaSummaryQuerySchema, adminRetentionQuerySchema } from '../middleware/validate.js'
import { auditCreate, auditUpdate, auditDelete, getAuditLogForResource, queryAuditLog } from '../audit.js'
import { ladeOffeneEntwuerfe, ladeEntwurf, entscheideEntwurf } from '../store-entwuerfe.js'
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
  deleteUserTx,
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
  uploadLimiter,
  requireAuth,
  adminAuth,
  adminLogout,
  adminError,
  logger,
  adminHtmlPath: join(__dirname, '../admin.html'),
  dataDir: join(__dirname, '../data'),
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
  deleteUserTx,
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
  adminStatsQuerySchema,
  adminStatsSummaryQuerySchema,
  adminStatsExportQuerySchema,
  getStatsWindow,
  getStatsTimeline,
  adminError,
  serverError,
}))

router.use(createAdminClassroomRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminClassroomStatsQuerySchema,
  adminClassroomTeachersQuerySchema,
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
  leereLueckenfuellerCache,
  fetchRelation,
  DATA,
  adminError,
  logger,
}))

router.use(createAdminCalendarRouter({
  adminLimiter,
  requireAuth,
  validate,
  qQuerySchema,
  adminTagSchema,
  analyzeKollQuerySchema,
  analyzeWZQuerySchema,
  analyzeZWendeQuerySchema,
  analyzeLueckenfuellerQuerySchema,
  lueckenfuellerGenerateSchema,
  adminBulkDeleteCalendarSchema,
  adminPreviewLemmaSchema,
  adminPreviewDayParamsSchema,
  adminLemmaIdParamsSchema,
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
  buildLueckenfueller,
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
  adminAuditLogDetailParamsSchema,
  getAuditLogForResource,
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
  validate,
  adminSocialCardsTagesdataSchema,
  adminSocialCardsBelegeSchema,
  loadKalender,
  loadWortZwilling,
  getLemmataIndex,
  fetchBelege,
  adminError,
  socialCardsPath: join(__dirname, '../social-cards.html'),
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
