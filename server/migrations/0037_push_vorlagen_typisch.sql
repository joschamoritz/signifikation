-- 0037_push_vorlagen_typisch.sql
--
-- Seit 2026-11-20 sortiert das Spiel „Kollokationen“ nach Häufigkeit × logDice
-- (OPS.md › „Kollokationen-Rangfolge“). „am stärksten“ meint fachlich logDice
-- allein und passt nicht mehr; die Aufgabe heißt jetzt „die 3 typischsten
-- Kollokatoren“. Zwei Standard-Vorlagen der täglichen Benachrichtigung folgen.
--
-- Wie 0027: geändert wird nur, wenn Titel UND Text noch exakt dem Standardtext
-- entsprechen; von Hand angepasste Vorlagen bleiben unberührt. Der Seed in db.js
-- nutzt für frische Datenbanken schon die neuen Texte.
UPDATE push_templates
   SET body = 'Welche Wörter gehören fest dazu?',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE title = 'Heute: »{lemma}«'
   AND body  = 'Welche Wörter verbinden sich am stärksten damit?';

UPDATE push_templates
   SET body = 'Kennst du die typischsten Kollokatoren?',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE title = '{lemma} wartet auf dich'
   AND body  = 'Kennst du die stärksten Kollokatoren?';
