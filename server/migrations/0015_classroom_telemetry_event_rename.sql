-- 0015_classroom_telemetry_event_rename.sql
--
-- W4-S2 (De-Brand): Telemetrie-Event-Namen von 'cr2_*' auf 'classroom_*'
-- umstellen. Die Event-Namen sind ein Daten-Contract — die Aggregat-Queries in
-- server/classroom/telemetry.js matchen exakte Strings ('cr2_session_started'
-- etc.). Statt die Queries dauerhaft beide Prefixe matchen zu lassen, schreiben
-- wir die bestehenden Zeilen einmalig um; danach gilt ueberall nur 'classroom_*'.
--
-- Praezise: nur den 4-Zeichen-Prefix 'cr2_' ersetzen. In LIKE ist '_' ein
-- Wildcard, daher ESCAPE, damit wirklich nur 'cr2_' (und nicht z. B. 'cr2X')
-- getroffen wird. Idempotent: nach dem Lauf matcht keine Zeile mehr.
UPDATE classroom_telemetry
SET event = 'classroom_' || substr(event, 5)
WHERE event LIKE 'cr2\_%' ESCAPE '\';
