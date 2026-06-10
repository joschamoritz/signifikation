# Signifikation

Tägliches linguistisches Quiz auf Basis von Kollokations- und Korpusdaten.
Live: **[signifikation.de](https://signifikation.de)**

## Überblick

Signifikation ist eine React-/Express-App mit Wörterbuch-Ästhetik. Die Tagesinhalte,
Nutzerdaten und Statistiken liegen in einer SQLite-App-Datenbank; zusätzliche sprachliche
Analysen kommen aus separaten SQLite-Datenbanken wie `wortprofil.db` und `belege.db`.

## Aktuelle Spielmodi

| Modus | Beschreibung |
|---|---|
| **Kollokationen** | Die drei stärksten Kollokationen zum Tageswort in die richtige Reihenfolge bringen. |
| **Wort-Zwilling** | Zwei ähnliche Wörter anhand ihrer Kollokationsüberschneidungen auseinanderhalten. |
| **Zeitenwende** | Kollokationswandel über Zeitphasen erkennen. |
| **Lückenfüller** | Echten Korpussatz mit fehlendem Kollokator aus mehreren Kandidaten ergänzen. |

## Weitere Produktbereiche

- **Admin-Portal** unter `/admin` für Tagesplanung, Analysen, Nutzerverwaltung, Backups, Social Cards und Systemdiagnose
- **Account-/Entitlement-System** mit better-auth, Rollen (`user`, `premium`, `admin`) und Gerätegrenzen
- **Premium („Gesamtausgabe", Mollie + Apple IAP):** Alle vier Spielmodi sind dauerhaft gratis – Premium schaltet **Klassenraum, Kurse und „Eigenes Lemma" unbegrenzt** frei (selbst gewähltes Wort in jedem Modus). Basic-Nutzer bekommen 1 Eigenes-Lemma-Spiel pro Tag plus Admin-Bonus-Tage.
- **Classroom-Modus** für Lehrkräfte mit Sessions, Join-Code, Live-Dashboard und Exportjobs

## Stack

- **Frontend**: React 18, Vite 6, Vanilla CSS, PWA
- **Backend**: Express 5, Node.js >= 20, ESM
- **Authentifizierung**: better-auth mit SQLite-Adapter
- **App-Datenbank**: SQLite `server/data/signifikation.db`
- **Sprachdaten**: zusätzliche SQLite-Dateien wie `wortprofil.db` und `belege.db`
- **Deployment**: Hetzner VPS (Nürnberg), PM2, nginx, GitHub Actions

## Lokale Entwicklung

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen
cp .env.example .env

# 3. Frontend starten
npm run dev

# 4. Backend separat starten
npm run server
```

Standardmäßig läuft:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Admin: `http://localhost:3001/admin`

## Wichtige Befehle

```bash
npm run dev           # Vite-Dev-Server
npm run server        # Express-Server
npm run server:watch  # Express-Server mit --watch
npm run build         # Production Build
npm run test          # Vitest
npm run verify        # test + build
npm run test:e2e      # Playwright
```

## Umgebungskonfiguration

Alle Variablen sind in `.env.example` dokumentiert. Die wichtigsten:

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `PORT` | nein | Server-Port, Standard `3001` |
| `NODE_ENV` | nein | `development` oder `production` |
| `LOG_LEVEL` | nein | Pino-Log-Level |
| `ALLOWED_ORIGINS` | ja für abweichende Setups | CORS-Origins, komma-separiert |
| `BETTER_AUTH_URL` | ja | Basis-URL für better-auth |
| `BETTER_AUTH_SECRET` | ja in Prod | Secret für Session-/Auth-Signierung |
| `CLASSROOM_JOIN_SECRET` | ja für Classroom | Secret für Join-Code-/Session-Logik |
| `MOLLIE_API_KEY` | ja für Payments | `test_...` oder `live_...` |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | optional | Bestellbestätigungen |
| `APP_DB` | optional | alternativer Pfad für `signifikation.db` |
| `BELEGE_DB` | optional | alternativer Pfad für `belege.db` |
| `WORTPROFIL_DB` | optional | alternativer Pfad für `wortprofil.db` |
| `GITHUB_GIST_TOKEN` | optional | aktiviert manuelles/automatisches Gist-Backup |

## Admin-Zugang lokal einrichten

Das Admin-Portal nutzt **keinen** `ADMIN_KEY` mehr. Stattdessen gibt es einen echten Admin-Account.

```bash
node server/setup-admin.js <email> <password>
```

Danach Login im Admin-Portal über `/admin` mit E-Mail und Passwort.

## Datenhaltung

### App-Datenbank

Die zentrale App-Datenbank ist `server/data/signifikation.db`.

Wichtige Tabellen:

- `lemmata`
- `kalender`
- `wortzwilling`
- `zeitenwende`
- `stats`
- `free_days` (Bonus-Tage fürs „Eigene Lemma"-Feature: `date`, `label`, `bonus_count`)
- `custom_lemma_usage` (Tagesverbrauch „Eigenes Lemma" pro Account)
- `user`, `session`, `account`, `verification`
- `user_profiles`, `user_entitlements`, `payments`, `device_registrations`
- `audit_log`
- `classroom_session`, `classroom_assignment`, `classroom_participant`, `classroom_participant_state`, `classroom_submission`, `classroom_score_record`, `classroom_capability_grant`, `classroom_telemetry` (alle SINGULAR; die alten v1-Plural-Tabellen wurden in Migration `0006_drop_classroom_v1.sql` entfernt)

### Backup-Format

Admin-Backups exportieren aktuell diese logischen Dateien:

- `lemmata.json`
- `kalender.json`
- `wortzwilling.json`
- `zeitenwende.json`
- `stats.json`
- `stats-rows.json`

Diese Namen sind Teil des Backup-/Restore-Formats. Intern arbeitet die App trotzdem auf SQLite.

### Datumsformat

Für neue Laufzeitpfade und Admin-API gilt durchgehend:

- `YYYY-MM-DD`

Alte `MM-DD`-Annahmen sind historisch und sollten für neue Features nicht mehr verwendet werden.

## Architektur

```text
server/
├── index.js                 # Express-Setup, Security, Router-Mounts, Startup
├── db.js                    # SQLite-Verbindung und Schema
├── store.js                 # zentraler Datenzugriff + Caches
├── wortprofil.js            # Kollokations-/Zeitenwende-Abfragen
├── belege.js                # Korpusbelege
├── lueckenfueller.js        # Generierung für Lückenfüller
├── auth/                    # better-auth-Integration
├── middleware/              # Auth, Validierung, Rate Limits
├── routes/
│   ├── public.js            # öffentliche `/api/v1/*`-Routen
│   ├── admin.js             # aggregiert alle `/admin/*`-Routen
│   ├── account.js           # Account-/Entitlement-API
│   ├── payments.js          # Mollie-Checkout/Webhook
│   └── classroom.js         # Classroom-API
└── workers/
    └── classroomWorker.js   # Export-/Retention-Jobs
```

## Öffentliche API (Auszug)

- `GET /health`
- `GET /api/v1/heute`
- `GET /api/v1/wortzwilling`
- `GET /api/v1/zeitenwende`
- `GET /api/v1/belege`
- `POST /api/v1/stats`
- `GET /api/v1/archiv`
- `GET /api/v1/wiktionary`
- `GET /api/v1/ipa`
- `GET /api/v1/bonus`
- `GET /api/v1/account/*`
- `POST /api/v1/payments/checkout`
- `POST /api/v1/payments/webhook`
- `POST /api/v1/classroom/*`

## Admin-Portal

Das Admin-Portal deckt aktuell ab:

- Tagesplanung und Tageseinträge
- Inline-Analysen für alle vier Modi
- Kalender inklusive Bonus-Tage (Zusatz-Kontingent „Eigenes Lemma" für Basic-Nutzer)
- Bulk-Import und Bulk-Delete für Kalendereinträge
- Nutzerverwaltung inklusive Bulk-Export
- Audit-Log
- Backup/Restore und Gist-Backup
- Social-Cards-Generator
- Health-, Performance- und Cache-Diagnose

Siehe dazu auch `ADMIN_API.md`.

## Deployment

- Zielbranch: `main`
- Verify-Workflow vor Deploy
- Build via `npm run build`
- Start via PM2 (`ecosystem.config.cjs`)
- Reverse Proxy via nginx

Zusätzliche Betriebsdetails stehen in `OPS.md`.
