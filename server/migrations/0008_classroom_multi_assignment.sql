-- 0008_classroom_multi_assignment.sql
-- W2-T2: Eine Session spielt mehrere Modi nacheinander (sequenziell).
--
-- Bisher hatte eine Session genau EIN Assignment (D2). Diese Migration
-- hebt das auf der Datenebene auf — die Tabelle classroom_assignment hat
-- bereits eine `position`-Spalte (aus 0002), die die Reihenfolge innerhalb
-- der Session ausdrueckt. Es fehlt nur ein Session-Zeiger auf das aktuell
-- aktive Assignment.
--
-- current_assignment_index zeigt auf die Position des gerade laufenden
-- Assignments (0-basiert). Bei Session-Start steht er auf 0 (erstes
-- Assignment aktiv); POST /next-assignment erhoeht ihn server-autoritativ,
-- nach dem letzten Block wird die Session beendet.
--
-- Bestand: Alle existierenden Single-Assignment-Sessions bleiben gueltig
-- (Default 0 → ihr einziges Assignment auf Position 0 ist aktiv).
--
-- Laeuft genau einmal (per _schema_migrations getrackt) und atomar in
-- einer Transaktion (migrate-sync.js).

ALTER TABLE classroom_session
  ADD COLUMN current_assignment_index INTEGER NOT NULL DEFAULT 0;
