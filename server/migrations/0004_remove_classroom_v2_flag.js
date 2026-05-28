/**
 * 0004_remove_classroom_v2_flag.js
 *
 * Entfernt die Spalte user_entitlements.classroom_v2_enabled. Der Klassenraum
 * ist seit der W3-Konsolidierung kein Test-Feature mehr — Sichtbarkeit haengt
 * allein an der Premium-/Admin-Rolle, nicht mehr an einem Account-Flag.
 *
 * Bedingt, weil frische DBs die Spalte gar nicht erst anlegen (der fruehere
 * inline-ALTER in db.js ist entfernt). SQLite kennt kein DROP COLUMN IF EXISTS,
 * darum die PRAGMA-Pruefung. DROP COLUMN braucht SQLite >= 3.35 (in
 * better-sqlite3 enthalten) und ist hier unkritisch: die Spalte hat keinen
 * Index und keine Constraint-Abhaengigkeit.
 */

export default function migrate(db) {
  const cols = db.prepare(`PRAGMA table_info(user_entitlements)`).all()
  const hasFlag = cols.some((c) => c.name === 'classroom_v2_enabled')
  if (!hasFlag) return
  db.exec(`ALTER TABLE user_entitlements DROP COLUMN classroom_v2_enabled`)
}
