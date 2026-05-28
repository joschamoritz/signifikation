-- 0006_drop_classroom_v1.sql
-- Klassenraum-Relaunch Welle 3 (siehe planning/Classroom-Relaunch-Plan.md, D17).
--
-- Entfernt das alte v1-Datenmodell (PLURAL benannt) endgueltig. Der v1-Code
-- (classroom-store.js, routes/classroom.js, realtime/classroomSocket.js,
-- Export-Worker/-Jobs) wurde im selben Schritt geloescht; die CREATE-Statements
-- in db.js wurden entfernt. Datenverlust ist akzeptiert (D17, T-K1-Backup).
--
-- Reihenfolge: Kinder vor Eltern (FKs zeigen auf classroom_sessions). Indizes
-- werden mit der Tabelle automatisch entfernt. Laeuft atomar in einer
-- Transaktion (migrate-sync.js), genau einmal (per _schema_migrations getrackt).

DROP TABLE IF EXISTS classroom_exports;
DROP TABLE IF EXISTS classroom_submissions;
DROP TABLE IF EXISTS classroom_participants;
DROP TABLE IF EXISTS classroom_sessions;
