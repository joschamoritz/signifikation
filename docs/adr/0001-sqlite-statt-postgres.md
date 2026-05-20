# ADR-0001: SQLite statt Postgres

**Status:** Accepted
**Datum:** 2026-01-15

## Kontext

Signifikation ist ein 1-Personen-Hobby/Indie-Projekt mit erwartet niedriger
gleichzeitiger Last (< 50 aktive Spieler/min Peak). Hosting: ein einzelner
Hetzner-VPS in Nürnberg. Datenmenge: ein paar Tausend Lemma-Einträge,
Stats-Tabelle mit Wachstum ~5k Zeilen/Monat. Es gibt keine Multi-Region-
oder Multi-Process-Anforderung.

## Entscheidung

Wir nutzen SQLite via `better-sqlite3` (synchroner Node-Driver mit Prepared
Statements) als alleinige primäre Datenbank. WAL-Mode aktiv für bessere
Lese-Concurrency. Backup-Strategie: Datei-Snapshots + GitHub-Gist-Backup.

## Konsequenzen

**Positiv:**
- Kein separater DB-Prozess, kein Connection-Pool, keine Netzwerk-RTT
- Backup = einzelne Datei kopieren
- Tests laufen gegen echte DB ohne Container
- Migrations sind transaktional und sofort fertig
- `better-sqlite3` ist 5–10× schneller als Postgres-roundtrip bei Solo-Last

**Negativ:**
- Single-Writer-Lock (WAL mildert das, aber unter Last spürbar)
- Kein Replikations-Setup für Disaster Recovery (nur File-Backup)
- Keine Multi-Process-Skalierung: Wenn wir je auf PM2-cluster gehen, müsste
  jeder Worker eigene Connection halten, Schreibkonflikte werden eng
- Skalierungsdecke: bei > 20 simultanen Classrooms mit Live-Sockets
  könnte es eng werden (siehe Code-Audit M2)

## Trigger-Metriken für Umstieg auf Postgres

Wechsel ernsthaft erwägen, sobald **eines** zutrifft:

1. DB-Datei > 2 GB
2. p95 Schreib-Latenz auf einer Standard-Mutation > 50 ms
3. > 20 gleichzeitige Live-Classroom-Sessions im Peak
4. Multi-Server-Setup wird nötig (z. B. wegen Geo-Latenz)

## Verworfene Alternativen

- **Postgres + RDS / Hetzner-Managed-Postgres:** zu teuer + zu komplex für
  Solo-Operation. Backup/Restore-Story für Hobby-Operator unnötig groß.
- **Postgres self-hosted im selben VPS:** verdoppelt Operations-Aufwand
  (zwei Prozesse, Tuning, Backups) ohne klaren Mehrwert bei aktueller Last.
- **MongoDB:** semi-strukturierte Daten haben wir nicht. JSON-Felder in
  SQLite reichen.
