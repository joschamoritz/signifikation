# Runbook Klassenraum Release

Stand: 2026-04-18

## Ziel

Sicherer Rollout des Klassenraum-Backends (Auth, REST, Realtime, Export, Retention) mit klaren Go/No-Go-Kriterien, Monitoring und Rollback.

## Voraussetzungen

- Deployment-Pipeline auf `main` ist gruen.
- Produktions-DB-Backup liegt vor.
- Relevante Env-Variablen sind gesetzt:
  - `ADMIN_KEY`
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `ALLOWED_ORIGINS`
  - optional: `CLASSROOM_EXPORT_WORKER_ENABLED`, `CLASSROOM_EXPORT_WORKER_INTERVAL_MS`

## Staging-Testfaelle (vor Go-Live)

### 1) Auth und Rollen

- `POST /api/v1/auth/sign-up/email` funktioniert.
- `POST /api/v1/auth/sign-in/email` setzt Session-Cookie.
- `GET /api/v1/account/me`:
  - 200 mit Session
  - 401 ohne Session
- Teacher-Route mit normalem User liefert 403.

### 2) Klassenraum REST

- Teacher erstellt Session: `POST /api/v1/classroom/sessions` -> 201.
- Teacher startet Session: `POST /api/v1/classroom/sessions/:id/start` -> 200.
- Anonymer Join: `POST /api/v1/classroom/join` -> 201.
- Heartbeat: `POST /api/v1/classroom/heartbeat` -> 200.
- Finish: `POST /api/v1/classroom/sessions/:id/finish` -> 200.
- Fehlerpfade:
  - ungültiger Join-Code -> 404
  - Export vor Finish -> 409

### 3) Realtime

- Socket-Verbindung steht (`/socket.io`).
- `classroom:join` liefert `classroom:ready`.
- `classroom:submit` liefert `classroom:results`.
- Dashboard-Client erhält `classroom:metrics` ohne Reload.

### 4) Export

- `POST /api/v1/classroom/sessions/:id/exports` erstellt `queued` Job.
- Worker setzt Jobs auf `running` -> `done`.
- Download-Endpoint liefert Datei (`csv` und `pdf`).

### 5) Retention

- Retention-Job läuft beim Start an.
- Sessions älter als Retention-Fenster werden archiviert/gelöscht.
- Exportdateien verwaister Sessions werden entfernt.

## Monitoring-Checks nach Deploy

Zeitfenster: erste 60 Minuten eng, danach 24h normal.

- Error-Rate HTTP 5xx bleibt stabil.
- Keine auffälligen Spitzen bei 401/403 außerhalb erwarteter Bereiche.
- Logs enthalten keine gehäuften Fehler für:
  - `Klassenraum-Join fehlgeschlagen`
  - `Socket classroom:* fehlgeschlagen`
  - `Export-Worker Zyklus fehlgeschlagen`
  - `Classroom-Retention Job fehlgeschlagen`
- Export-Queue baut sich ab (keine dauerhafte `queued`-Stauung).

## Rollback

### Trigger

- Dauerhafte 5xx-Spitzen nach Deploy.
- Realtime-Ausfall für Mehrheit der Sessions.
- Exporte schlagen systematisch fehl.
- Auth-Regression (sign-in/account nicht nutzbar).

### Schritte

1. Letztes stabiles Release ausrollen (GitHub Actions Re-Deploy des vorherigen Commits).
2. Node/PM2-Prozess neu starten.
3. Health prüfen:
   - `GET /api/v1/health` (falls vorhanden)
   - `GET /api/v1/account/me` ohne Session -> 401
4. Incident-Notiz mit Ursache und Zeitachse dokumentieren.

## Release-Checkliste (Go/No-Go)

- [ ] Tests in CI gruen.
- [ ] Staging-Testfaelle komplett bestanden.
- [ ] Monitoring-Schwellen und Alerts aktiv.
- [ ] Rollback-Verantwortliche benannt.
- [ ] Go-Live-Fenster abgestimmt.
- [ ] Post-Deploy-Check nach 15/30/60 Minuten erfolgt.
