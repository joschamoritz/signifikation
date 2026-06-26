-- 0018_course_task_result.sql
-- Kurs-Aufgaben-Persistenz (Folge-AP zu 0017_course_engine.sql).
--
-- QA Station 1 (planning/Kurs-AP11-QA-Manuell Station 1.md, Abschluss):
-- „Die Aufgaben sollten eigentlich nicht so einfach 'nochmal' gemacht werden
-- dürfen und die Ergebnisse die man einspeichert, sollten mit dem eingeloggten
-- Konto verknüpft sein."
--
-- course_progress (0017) bleibt der GROBE Stations-Status (idle/in-progress/
-- done). NEU hier: das FEINE Ergebnis je Aufgabe (richtig/falsch + Versuche),
-- damit der Fortschritt erhalten bleibt und „Nochmal" begrenzt werden kann.
--
-- Idempotent (CREATE … IF NOT EXISTS), läuft atomar in einer Transaktion
-- (migrate-runner.js / migrate-sync.js).

-- ── Aufgaben-Ergebnis je (Nutzer, Aufgabe) ───────────────────────────
-- Genau eine Zeile je (user_id, task_id). task_id ist global eindeutig
-- (course_tasks.id) und gehört zu genau einer Niveaustufe → level wird
-- denormalisiert mitgeführt (Filter/Anzeige/Reset je Stufe), station_id
-- ebenso (Reset je Station + FK-Kaskade ohne Join).
--
-- correct: 1 = richtig, 0 = falsch, NULL = reine Selbstkontrolle
--   (F2/F5-Freitext ohne geschlossene Bewertung, Engine-Spec §7) → einmal
--   abgegeben gilt als bearbeitet, keine Auto-„richtig".
-- attempts: Anzahl „Prüfen"-Abgaben (Statistik). Eine kuratierte Aufgabe wird
--   clientseitig nach der Abgabe gesperrt (neu spielbar nur über Profil-Reset);
--   gespeichert wird das „beste" Resultat.
--
-- „Eigenes Lemma" (AP9) wird BEWUSST NICHT gespeichert (frei wiederholbar) —
-- der Client postet dort kein Ergebnis.
CREATE TABLE IF NOT EXISTS course_task_result (
  user_id    TEXT NOT NULL REFERENCES user(id)            ON DELETE CASCADE,
  station_id TEXT NOT NULL REFERENCES course_stations(id) ON DELETE CASCADE,
  task_id    TEXT NOT NULL REFERENCES course_tasks(id)    ON DELETE CASCADE,
  level      TEXT NOT NULL
               CHECK (level IN ('DaZ','SekI','SekII','LK')),
  correct    INTEGER
               CHECK (correct IN (0, 1)),  -- NULL erlaubt (Selbstkontrolle)
  attempts   INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, task_id)
);

-- Ergebnis-Liste je Station (Station-Detail + Reset je Station).
CREATE INDEX IF NOT EXISTS idx_course_task_result_station
  ON course_task_result(user_id, station_id);
