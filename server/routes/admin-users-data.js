import db from '../db.js'

export const countUsersStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM user
`)

export const countUsersByRoleStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN COALESCE(up.role, 'user') = 'premium' THEN 1 ELSE 0 END) AS premium,
    SUM(CASE WHEN COALESCE(up.role, 'user') = 'user' THEN 1 ELSE 0 END) AS users
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
`)

export const listUsersStmt = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.emailVerified,
    u.createdAt,
    COALESCE(up.role, 'user') AS role,
    COALESCE(ue.gesamtausgabe_unlocked, 0) AS gekauft
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  LEFT JOIN user_entitlements ue ON ue.user_id = u.id
  WHERE (
    @q = ''
    OR u.email LIKE @qLike
    OR u.name LIKE @qLike
  )
  AND (
    @role = ''
    OR COALESCE(up.role, 'user') = @role
  )
  ORDER BY u.createdAt DESC
  LIMIT @limit OFFSET @offset
`)

/** Trefferzahl derselben Filterung wie listUsersStmt – Basis für „Weitere laden". */
export const countUsersFilteredStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE (
    @q = ''
    OR u.email LIKE @qLike
    OR u.name LIKE @qLike
  )
  AND (
    @role = ''
    OR COALESCE(up.role, 'user') = @role
  )
`)

export const getUserDetailsStmt = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.emailVerified,
    u.createdAt,
    COALESCE(up.role, 'user') AS role
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE u.id = ?
`)

export const getUserStatsByGameStmt = db.prepare(`
  SELECT
    spiel,
    SUM(plays) AS plays,
    SUM(scoreSum) AS scoreSum,
    SUM(maxSum) AS maxSum
  FROM stats
  WHERE user_id = ?
  GROUP BY spiel
  ORDER BY spiel ASC
`)

export const getUserRecentStatsStmt = db.prepare(`
  SELECT
    datum,
    spiel,
    SUM(plays) AS plays,
    SUM(scoreSum) AS scoreSum,
    SUM(maxSum) AS maxSum
  FROM stats
  WHERE user_id = ?
  GROUP BY datum, spiel
  ORDER BY datum DESC, spiel ASC
  LIMIT 20
`)

const deleteUserProfileStmt = db.prepare(`
  DELETE FROM user_profiles
  WHERE user_id = ?
`)

const deleteUserEntitlementsStmt = db.prepare(`
  DELETE FROM user_entitlements
  WHERE user_id = ?
`)

const deleteUserStatsStmt = db.prepare(`
  DELETE FROM stats
  WHERE user_id = ?
`)

const deleteClassroomSessionsByTeacherStmt = db.prepare(`
  DELETE FROM classroom_session
  WHERE teacher_user_id = ?
`)

// Die folgenden drei Tabellen haengen ohne Foreign Key am Nutzer und wurden
// deshalb beim Loeschen nicht mit abgeraeumt — sie ueberlebten die Loeschung
// bis zum Ablauf ihrer jeweiligen Retention-Frist (Guideline 5.1.1(v)).
const deleteCustomLemmaUsageStmt = db.prepare(`
  DELETE FROM custom_lemma_usage
  WHERE user_id = ?
`)

const anonymizeTelemetryTeacherStmt = db.prepare(`
  UPDATE classroom_telemetry
  SET teacher_id = NULL
  WHERE teacher_id = ?
`)

// verification ist ueber die E-Mail-Adresse verknuepft (better-auth-Schema),
// nicht ueber die user.id — offene Passwort-Reset-Token blieben sonst liegen.
const deleteVerificationByIdentifierStmt = db.prepare(`
  DELETE FROM verification
  WHERE identifier = ?
`)

const getUserEmailForDeleteStmt = db.prepare(`
  SELECT email
  FROM user
  WHERE id = ?
`)

const deleteUserStmt = db.prepare(`
  DELETE FROM user
  WHERE id = ?
`)

export const ensureProfileStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, 'user', ?, ?)
  ON CONFLICT(user_id) DO NOTHING
`)

export const setUserRoleStmt = db.prepare(`
  INSERT INTO user_profiles (user_id, role, created_at, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id)
  DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at
`)

export const userExistsStmt = db.prepare(`
  SELECT id
  FROM user
  WHERE id = ?
`)

export const getUsersByIdsStmt = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.emailVerified,
    u.createdAt,
    COALESCE(up.role, 'user') AS role
  FROM user u
  LEFT JOIN user_profiles up ON up.user_id = u.id
  WHERE u.id IN (SELECT value FROM json_each(?))
`)

// Admin-Konten werden hier nie geloescht (Aussperren verhindern). Der Schutz sitzt zentral in
// deleteUserTx, damit kein Aufrufer ihn vergessen kann (App-Loeschung, Admin-Oberflaeche, Inaktivitaets-Job).
export const ADMIN_DELETE_BLOCKED = 'ADMIN_ACCOUNT_PROTECTED'

export class AdminDeleteBlockedError extends Error {
  constructor() {
    super('Admin-Konten lassen sich nicht löschen.')
    this.name = 'AdminDeleteBlockedError'
    this.code = ADMIN_DELETE_BLOCKED
  }
}

const getUserRoleForDeleteStmt = db.prepare(`
  SELECT role
  FROM user_profiles
  WHERE user_id = ?
`)

export const deleteUserTx = db.transaction((userId) => {
  // Rolle aus der Datenbank lesen (nicht aus dem Request): Ein Admin-Konto wird nie geloescht,
  // egal, welche Rolle der Aufrufer behauptet. Es wurde noch nichts geloescht, die Transaktion rollt sauber zurueck.
  if (getUserRoleForDeleteStmt.get(userId)?.role === 'admin') throw new AdminDeleteBlockedError()

  // E-Mail vor dem Loeschen lesen: verification haengt am identifier, nicht an
  // der user.id, und waere danach nicht mehr zuzuordnen.
  const email = getUserEmailForDeleteStmt.get(userId)?.email ?? null

  deleteUserProfileStmt.run(userId)
  deleteUserEntitlementsStmt.run(userId)
  deleteUserStatsStmt.run(userId)
  deleteCustomLemmaUsageStmt.run(userId)
  anonymizeTelemetryTeacherStmt.run(userId)
  if (email) deleteVerificationByIdentifierStmt.run(email)
  deleteClassroomSessionsByTeacherStmt.run(userId)
  deleteUserStmt.run(userId)
})

export const adminUsersStatsStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN createdAt >= @fromIso THEN 1 ELSE 0 END) AS newLast7Days,
    SUM(CASE WHEN createdAt >= @from30Iso THEN 1 ELSE 0 END) AS newLast30Days
  FROM user
`)

// Kauf und Premium eines Kontos (Admin › Nutzer › Konto). NUR LESEND: Anders als
// account.js (ensureEntitlementStmt) legt dieser Abruf keine Zeile an.
export const getUserKaufStmt = db.prepare(`
  SELECT gesamtausgabe_unlocked AS freigeschaltet, unlocked_at AS seit, source AS quelle
  FROM user_entitlements
  WHERE user_id = ?
`)

// Nur eigene Belege (user_id gesetzt). Nach der Kontolöschung sind sie anonym
// (Migration 0020, user_id = NULL) und erscheinen hier nirgends.
export const getUserZahlungenStmt = db.prepare(`
  SELECT id, amount, currency, status, product, processed_at
  FROM payments
  WHERE user_id = ?
  ORDER BY processed_at DESC
  LIMIT 20
`)

// Konto-Angaben: Rollenänderung, letzte Aktivität, Löschwarnung, Anmeldearten.
// Bewusst NICHT gelesen: session.ipAddress/userAgent, account.accountId,
// Tokens und Passwort-Hashes.
export const getUserKontoMetaStmt = db.prepare(`
  SELECT
    (SELECT updated_at FROM user_profiles WHERE user_id = @id)           AS rolleGeaendertMs,
    (SELECT last_active_at FROM user_activity WHERE user_id = @id)       AS zuletztAktiv,
    (SELECT inactivity_warned_at FROM user_activity WHERE user_id = @id) AS loeschWarnung,
    (SELECT group_concat(DISTINCT providerId) FROM account WHERE userId = @id) AS anmeldung
`)

export { toCsvCell } from './csv-utils.js'
