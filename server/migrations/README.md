# Schema-Migrationen

Versionierte Migrationen für die SQLite-DB (`signifikation.db`).

## Format

Datei-Naming: `NNNN_kurzname.sql` oder `NNNN_kurzname.js`

- **NNNN** = vierstellige Sequenz, beginnt bei `0001`
- **.sql** = reines DDL, ausgeführt als ein einziges `db.exec()` in einer
  Transaktion
- **.js** = ESM-Modul mit `default export async function(db)` für komplexere
  Migrationen (z. B. Datentransformationen, Iteration über Zeilen)

## Runner

`server/migrate-runner.js` läuft beim Server-Start (`server/index.js`).
Tracking via `_schema_migrations` (Tabelle wird ggf. selbst erstellt).
Jede Migration wird genau einmal ausgeführt.

## Baseline (vor 2026-05-20)

Alle bisherigen Migrationen in `server/db.js` (Spalten-`ALTER TABLE`-Pfade
hinter `hasColumn(...)`) sind idempotent und werden weiterhin dort
ausgeführt. Sie sind in `_schema_migrations` als "0000_baseline"
markiert.

Ab Migration `0001` läuft alles über diesen Runner — neue Schema-
Änderungen NICHT mehr in `db.js` ergänzen.

## Konvention

- Eine Migration je Concern (nicht 3 Tabellen-ALTERs in einer Datei).
- Migrationen sind **append-only**: niemals editieren nachdem auf Prod
  gelaufen. Stattdessen eine neue Migration anlegen, die korrigiert.
- Reversible Migrationen sind nicht vorgesehen — Rollback erfolgt per
  Snapshot-Restore.
