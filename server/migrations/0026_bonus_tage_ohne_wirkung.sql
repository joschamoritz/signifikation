-- 0026_bonus_tage_ohne_wirkung.sql
--
-- Werkzeuge › Bonus-Tage (Schritt 7b): Ein Bonus-Tag braucht mindestens ein
-- zusätzliches Spiel (Route und Formular lehnen 0 jetzt ab). Bisher ließ sich
-- ein Eintrag mit bonus_count = 0 anlegen: ohne Wirkung auf das Kontingent, aber
-- in Woche und Monat als "Bonus +0" sichtbar. Diese Einträge werden entfernt.
DELETE FROM free_days WHERE bonus_count <= 0;
