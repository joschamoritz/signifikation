-- Letzte Aktivität je Konto als Grundlage der Löschfrist für inaktive Konten
-- (24 Monate ohne Anmeldung, Warnmail 30 Tage vorher; server/jobs/inactiveAccounts.js).
-- Sitzungen verschwinden nach Ablauf, deshalb eine eigene Tabelle.
--
-- Bestandskonten bekommen den Zeitpunkt der Migration: Ihre echte letzte Aktivität
-- ist nicht bekannt, und so wird niemand früher als 24 Monate nach Einführung der
-- Frist gelöscht.
CREATE TABLE user_activity (
  user_id              TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  last_active_at       TEXT NOT NULL,
  inactivity_warned_at TEXT
);

INSERT INTO user_activity (user_id, last_active_at)
SELECT id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM user;
