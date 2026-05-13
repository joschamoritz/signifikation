import express          from 'express'
import { fileURLToPath } from 'url'
import { dirname, join }  from 'path'
import { fetchLemma, fetchBonusQuestion, fetchRelation, fetchZeitenwende, fetchZeitenwendeAnalyze, lemmaExistsInWortprofil, POS_ROUNDS } from '../wortprofil.js'
import { buildLueckenfueller } from '../lueckenfueller.js'
import { fetchBelege } from '../belege.js'
import { fetchWiktionary } from '../wiktionary.js'
import { fetchWortZwilling } from '../wortzwilling.js'
import { load, loadKalender, loadDailyContentMaps, loadMutableDailyContentMaps, save, saveDailyContentMaps, loadWortZwilling, loadZeitenwende, getLemmataIndex, invalidateCache, getCacheMetrics, DATA, stmts, lemmaToRow, replaceAllAdminData, getStatsWindow, getStatsTimeline, loadBackupFiles, loadAllSpezialwochen, loadSpezialwocheByWoche, saveSpezialwoche, deleteSpezialwoche, saveTagAtomically } from '../store.js'
import { getCacheMetrics as getQueryCacheMetrics, clearCache as clearQueryCache } from '../query-cache.js'
import { adminLimiter, loginLimiter, uploadLimiter } from '../middleware/rateLimiter.js'
import { requireAuth, adminAuth, adminLogout, adminError, serverError } from '../middleware/auth.js'
import { validate, qQuerySchema, adminTagSchema, analyzeKollQuerySchema, analyzeWZQuerySchema, analyzeZWendeQuerySchema, adminUsersQuerySchema, adminSetUserRoleSchema, adminUserIdParamsSchema, adminUsersBulkUpdateSchema, adminBulkDeleteCalendarSchema, adminBulkImportCalendarSchema, adminPreviewLemmaSchema, adminPreviewDayParamsSchema, adminLemmaIdParamsSchema, adminAuditLogDetailParamsSchema, adminBackupRestoreSchema, adminStatsQuerySchema, adminStatsSummaryQuerySchema, adminStatsExportQuerySchema, adminAuditLogQuerySchema, adminSocialCardsTagesdataSchema, adminSocialCardsBelegeSchema, adminSpezialwocheSchema, adminSpezialwocheParamsSchema } from '../middleware/validate.js'
import { auditCreate, auditUpdate, auditDelete, getAuditLog } from '../audit.js'
import logger from '../logger.js'
import { createAdminAuditRouter } from './admin-audit.js'
import { createAdminUsersRouter } from './admin-users.js'
import { createAdminBackupRouter } from './admin-backup.js'
import { createAdminStatsRouter } from './admin-stats.js'
import { createAdminOpsRouter } from './admin-ops.js'
import { createAdminCalendarRouter } from './admin-calendar.js'
import { createAdminSocialCardsRouter } from './admin-social-cards.js'
import { createAdminCoreRouter } from './admin-core.js'
import freeDaysRouter from './admin-free-days.js'
import { createAdminSpezialwocheRouter } from './admin-spezialwoche.js'
import {
  countUsersStmt,
  countUsersByRoleStmt,
  listUsersStmt,
  getUserDetailsStmt,
  getUserStatsByGameStmt,
  getUserRecentStatsStmt,
  ensureProfileStmt,
  setUserRoleStmt,
  userExistsStmt,
  getUsersByIdsStmt,
  deleteUserTx,
  adminUsersStatsStmt,
  toCsvCell,
} from './admin-users-data.js'
import { sanitizeBackupBundle } from './admin-backup-utils.js'
import { parseCalendarBulkImport, buildModeGroups } from './admin-calendar-utils.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const router = express.Router()

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
  listUsersStmt,
  getUserDetailsStmt,
  getUserStatsByGameStmt,
  getUserRecentStatsStmt,
  ensureProfileStmt,
  setUserRoleStmt,
  userExistsStmt,
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

router.use(createAdminOpsRouter({
  adminLimiter,
  requireAuth,
  loadKalender,
  getCacheMetrics,
  getQueryCacheMetrics,
  clearQueryCache,
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
  adminBulkDeleteCalendarSchema,
  adminBulkImportCalendarSchema,
  adminPreviewLemmaSchema,
  adminPreviewDayParamsSchema,
  adminLemmaIdParamsSchema,
  load,
  loadKalender,
  loadDailyContentMaps,
  loadMutableDailyContentMaps,
  save,
  saveDailyContentMaps,
  loadWortZwilling,
  loadZeitenwende,
  getLemmataIndex,
  invalidateCache,
  stmts,
  lemmaToRow,
  fetchLemma,
  fetchBonusQuestion,
  fetchRelation,
  fetchZeitenwende,
  fetchZeitenwendeAnalyze,
  fetchWiktionary,
  fetchWortZwilling,
  POS_ROUNDS,
  parseCalendarBulkImport,
  buildModeGroups,
  buildLueckenfueller,
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
  getAuditLog,
  adminError,
}))

router.use(createAdminBackupRouter({
  adminLimiter,
  requireAuth,
  validate,
  adminBackupRestoreSchema,
  loadBackupFiles,
  replaceAllAdminData,
  sanitizeBackupBundle,
  auditUpdate,
  adminError,
  serverError,
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
  auditCreate,
  auditDelete,
  adminError,
  serverError,
  logger,
}))

export default router
