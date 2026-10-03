-- 0021_unterricht_abgabe.sql
-- Abgaben aus Unterrichts-Tools unter /unterricht/ (z. B. Fallakte Ötzi).
--
-- Die Tools sind statische Seiten ohne Login; Schülerteams schicken am Ende
-- ihren Bericht. Gespeichert wird nur, was das Team eingibt (Teamname aus
-- Vornamen + Antworten), keine IP, kein Account-Bezug. Gelesen und gelöscht
-- wird ausschließlich über das Admin-Panel (/admin/unterricht/*).
--
-- payload: JSON (Bericht 1992, Abschlussbericht, Antworten je Beweisstück).
CREATE TABLE IF NOT EXISTS unterricht_abgabe (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  aufgabe     TEXT    NOT NULL,
  team        TEXT    NOT NULL,
  payload     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unterricht_abgabe_aufgabe
  ON unterricht_abgabe(aufgabe, created_at);
