-- 0023_unterricht_entfernen.sql
-- Die Unterrichts-Tools sind am 17.10.2026 nach unterricht.signifikation.de
-- umgezogen (eigenes Repo „unterricht.signifikation“, eigene Datenbank).
-- Abgaben wurden übernommen; die Tabelle war zum Umzug leer. unterricht_stand
-- (0022) war in Kollokade nie committet und existiert in Produktion nicht –
-- IF EXISTS deckt beide Fälle ab.
DROP INDEX IF EXISTS idx_unterricht_abgabe_aufgabe;
DROP TABLE IF EXISTS unterricht_abgabe;
DROP TABLE IF EXISTS unterricht_stand;
