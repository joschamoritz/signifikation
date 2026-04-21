import db from '../db.js'

export const countUsersStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM user
`)

export const countUsersByRoleStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN COALESCE(up.role, 'user') = 'teacher' THEN 1 ELSE 0 END) AS teachers,
    SUM(CASE WHEN COALESCE(up.role, 'user') != 'teacher' THEN 1 ELSE 0 END) AS users
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
    COALESCE(up.role, 'user') AS role
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
  ORDER BY u.createdAt DESC
  LIMIT @limit
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
  DELETE FROM classroom_sessions
  WHERE teacher_user_id = ?
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

export const deleteUserTx = db.transaction((userId) => {
  deleteUserProfileStmt.run(userId)
  deleteUserEntitlementsStmt.run(userId)
  deleteUserStatsStmt.run(userId)
  deleteClassroomSessionsByTeacherStmt.run(userId)
  deleteUserStmt.run(userId)
})

export const adminUsersStatsStmt = db.prepare(`
  SELECT
    SUM(CASE WHEN createdAt >= @fromIso THEN 1 ELSE 0 END) AS newLast7Days,
    SUM(CASE WHEN createdAt >= @from30Iso THEN 1 ELSE 0 END) AS newLast30Days
  FROM user
`)

export function toCsvCell(value) {
  const s = String(value ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
