-- 0013_app_state.sql
--
-- Kleiner Key-Value-Store fuer prozessuebergreifend persistenten App-Zustand.
-- Erster Nutzer: push_last_sent (Catch-up des taeglichen Push-Jobs nach
-- Neustart/Deploy um 08:00, Review 2026-06-11 B-M7). Die setInterval-Sweeps
-- rechnen gegen persistierte Timestamps — der cron-basierte Push-Job war der
-- einzige Job ohne Nachhol-Mechanismus.
CREATE TABLE IF NOT EXISTS app_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
