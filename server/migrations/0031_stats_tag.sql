-- 0031_stats_tag.sql
-- Tagessummen der Spielstatistik je (datum, spiel) für Admin › Auswertung › Spiele.
-- Die Auswertung über 12 Monate aggregierte bisher alle Zeilen von stats (eine je Konto × Spiel × Tag,
-- ≈ 0,6 Mio.) und brauchte beim ersten Aufruf ≈ 0,7 s. stats_tag hält dieselben Summen vorgerechnet.
--
-- Wie die bisherige Abfrage zählen Admin-Konten nicht mit (user_profiles.role = 'admin', gemessen beim
-- Schreiben der Zeile). Gepflegt wird die Tabelle ausschließlich über die Trigger unten: Jede Änderung an
-- stats (Spiel, Kontolöschung, Verdichtung alter Konto-Zeilen, Wiederherstellung) bucht ihre Differenz
-- (neu − alt) mit. Die Punkteverteilung steht in d0 … d10 (Anteil der Punkte in Zehnteln, wie stats.dist).
-- mit_konto = Spiele mit Konto; nach der Verdichtung (180 Tage) ist er für alte Tage nicht mehr aussagekräftig
-- und wird dort auch nicht gelesen (store-stats.js).
-- Grenze: Wird ein Konto nachträglich Admin (nur über setup-admin.js), bleiben seine früheren Spiele gezählt.

CREATE TABLE stats_tag (
  datum     TEXT NOT NULL,
  spiel     TEXT NOT NULL,
  spiele    INTEGER NOT NULL DEFAULT 0,
  punkte    INTEGER NOT NULL DEFAULT 0,
  max       INTEGER NOT NULL DEFAULT 0,
  mit_konto INTEGER NOT NULL DEFAULT 0,
  d0        INTEGER NOT NULL DEFAULT 0,
  d1        INTEGER NOT NULL DEFAULT 0,
  d2        INTEGER NOT NULL DEFAULT 0,
  d3        INTEGER NOT NULL DEFAULT 0,
  d4        INTEGER NOT NULL DEFAULT 0,
  d5        INTEGER NOT NULL DEFAULT 0,
  d6        INTEGER NOT NULL DEFAULT 0,
  d7        INTEGER NOT NULL DEFAULT 0,
  d8        INTEGER NOT NULL DEFAULT 0,
  d9        INTEGER NOT NULL DEFAULT 0,
  d10       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (datum, spiel)
) WITHOUT ROWID;

INSERT INTO stats_tag (datum, spiel, spiele, punkte, max, mit_konto, d0, d1, d2, d3, d4, d5, d6, d7, d8, d9, d10)
SELECT s.datum, s.spiel,
  SUM(s.plays),
  SUM(s.scoreSum),
  SUM(s.maxSum),
  SUM(CASE WHEN s.user_id != '' THEN s.plays ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[0]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[1]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[2]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[3]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[4]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[5]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[6]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[7]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[8]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[9]'), 0) ELSE 0 END),
  SUM(CASE WHEN json_valid(s.dist) THEN COALESCE(json_extract(s.dist, '$[10]'), 0) ELSE 0 END)
FROM stats s
WHERE s.user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')
GROUP BY s.datum, s.spiel;

CREATE TRIGGER stats_tag_einfuegen AFTER INSERT ON stats
WHEN NEW.user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')
BEGIN
  INSERT INTO stats_tag (datum, spiel, spiele, punkte, max, mit_konto, d0, d1, d2, d3, d4, d5, d6, d7, d8, d9, d10)
  VALUES (NEW.datum, NEW.spiel,
    +(NEW.plays),
    +(NEW.scoreSum),
    +(NEW.maxSum),
    +(CASE WHEN NEW.user_id != '' THEN NEW.plays ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[0]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[1]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[2]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[3]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[4]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[5]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[6]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[7]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[8]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[9]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[10]'), 0) ELSE 0 END))
  ON CONFLICT(datum, spiel) DO UPDATE SET
    spiele = spiele + excluded.spiele,
    punkte = punkte + excluded.punkte,
    max = max + excluded.max,
    mit_konto = mit_konto + excluded.mit_konto,
    d0 = d0 + excluded.d0,
    d1 = d1 + excluded.d1,
    d2 = d2 + excluded.d2,
    d3 = d3 + excluded.d3,
    d4 = d4 + excluded.d4,
    d5 = d5 + excluded.d5,
    d6 = d6 + excluded.d6,
    d7 = d7 + excluded.d7,
    d8 = d8 + excluded.d8,
    d9 = d9 + excluded.d9,
    d10 = d10 + excluded.d10;
END;

CREATE TRIGGER stats_tag_aendern AFTER UPDATE ON stats
BEGIN
  -- alter Beitrag raus, neuer rein (auch wenn sich datum, spiel oder user_id ändern)
  INSERT INTO stats_tag (datum, spiel, spiele, punkte, max, mit_konto, d0, d1, d2, d3, d4, d5, d6, d7, d8, d9, d10)
  SELECT OLD.datum, OLD.spiel,
    -(OLD.plays),
    -(OLD.scoreSum),
    -(OLD.maxSum),
    -(CASE WHEN OLD.user_id != '' THEN OLD.plays ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[0]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[1]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[2]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[3]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[4]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[5]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[6]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[7]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[8]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[9]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[10]'), 0) ELSE 0 END)
  WHERE OLD.user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')
  ON CONFLICT(datum, spiel) DO UPDATE SET
    spiele = spiele + excluded.spiele,
    punkte = punkte + excluded.punkte,
    max = max + excluded.max,
    mit_konto = mit_konto + excluded.mit_konto,
    d0 = d0 + excluded.d0,
    d1 = d1 + excluded.d1,
    d2 = d2 + excluded.d2,
    d3 = d3 + excluded.d3,
    d4 = d4 + excluded.d4,
    d5 = d5 + excluded.d5,
    d6 = d6 + excluded.d6,
    d7 = d7 + excluded.d7,
    d8 = d8 + excluded.d8,
    d9 = d9 + excluded.d9,
    d10 = d10 + excluded.d10;
  INSERT INTO stats_tag (datum, spiel, spiele, punkte, max, mit_konto, d0, d1, d2, d3, d4, d5, d6, d7, d8, d9, d10)
  SELECT NEW.datum, NEW.spiel,
    +(NEW.plays),
    +(NEW.scoreSum),
    +(NEW.maxSum),
    +(CASE WHEN NEW.user_id != '' THEN NEW.plays ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[0]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[1]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[2]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[3]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[4]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[5]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[6]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[7]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[8]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[9]'), 0) ELSE 0 END),
    +(CASE WHEN json_valid(NEW.dist) THEN COALESCE(json_extract(NEW.dist, '$[10]'), 0) ELSE 0 END)
  WHERE NEW.user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')
  ON CONFLICT(datum, spiel) DO UPDATE SET
    spiele = spiele + excluded.spiele,
    punkte = punkte + excluded.punkte,
    max = max + excluded.max,
    mit_konto = mit_konto + excluded.mit_konto,
    d0 = d0 + excluded.d0,
    d1 = d1 + excluded.d1,
    d2 = d2 + excluded.d2,
    d3 = d3 + excluded.d3,
    d4 = d4 + excluded.d4,
    d5 = d5 + excluded.d5,
    d6 = d6 + excluded.d6,
    d7 = d7 + excluded.d7,
    d8 = d8 + excluded.d8,
    d9 = d9 + excluded.d9,
    d10 = d10 + excluded.d10;
END;

CREATE TRIGGER stats_tag_loeschen AFTER DELETE ON stats
WHEN OLD.user_id NOT IN (SELECT user_id FROM user_profiles WHERE role = 'admin')
BEGIN
  INSERT INTO stats_tag (datum, spiel, spiele, punkte, max, mit_konto, d0, d1, d2, d3, d4, d5, d6, d7, d8, d9, d10)
  VALUES (OLD.datum, OLD.spiel,
    -(OLD.plays),
    -(OLD.scoreSum),
    -(OLD.maxSum),
    -(CASE WHEN OLD.user_id != '' THEN OLD.plays ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[0]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[1]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[2]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[3]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[4]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[5]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[6]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[7]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[8]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[9]'), 0) ELSE 0 END),
    -(CASE WHEN json_valid(OLD.dist) THEN COALESCE(json_extract(OLD.dist, '$[10]'), 0) ELSE 0 END))
  ON CONFLICT(datum, spiel) DO UPDATE SET
    spiele = spiele + excluded.spiele,
    punkte = punkte + excluded.punkte,
    max = max + excluded.max,
    mit_konto = mit_konto + excluded.mit_konto,
    d0 = d0 + excluded.d0,
    d1 = d1 + excluded.d1,
    d2 = d2 + excluded.d2,
    d3 = d3 + excluded.d3,
    d4 = d4 + excluded.d4,
    d5 = d5 + excluded.d5,
    d6 = d6 + excluded.d6,
    d7 = d7 + excluded.d7,
    d8 = d8 + excluded.d8,
    d9 = d9 + excluded.d9,
    d10 = d10 + excluded.d10;
END;
