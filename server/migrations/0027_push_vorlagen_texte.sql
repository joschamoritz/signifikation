-- 0027_push_vorlagen_texte.sql
--
-- Zwei Standard-Vorlagen der täglichen Benachrichtigung sagen es fachlich
-- ungenau: Das Ranking ist logDice (Assoziationsmaß), nicht Häufigkeit, und die
-- Wörter heißen Kollokatoren (nicht Kollokationen). Terminologie.md.
--
-- Geändert wird nur, wenn Titel UND Text noch exakt dem Standardtext entsprechen;
-- von Hand angepasste Vorlagen bleiben unberührt. Der Seed in db.js nutzt für
-- frische Datenbanken schon die neuen Texte.
UPDATE push_templates
   SET body = 'Welche Wörter verbinden sich am stärksten damit?',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE title = 'Heute: »{lemma}«'
   AND body  = 'Welche Wörter treten am häufigsten gemeinsam auf?';

UPDATE push_templates
   SET body = 'Kennst du die stärksten Kollokatoren?',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE title = '{lemma} wartet auf dich'
   AND body  = 'Kennst du seine stärksten Kollokationen?';
