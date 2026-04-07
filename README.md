# Signifikation

Tägliches linguistisches Quiz – korpusbasiert, wörterbuchästhetisch.
Live: **[signifikation.de](https://signifikation.de)**

## Spielmodi

| Modus | Beschreibung |
|---|---|
| **Kollokationen** | Welche Wörter treten am häufigsten gemeinsam mit dem Tageswort auf? |
| **Wort-Zwilling** | Zwei Wörter – welches hat die stärkeren Kollokationsüberschneidungen? |
| **Zeitreise** | In welcher Epoche war eine Kollokation am gebräuchlichsten? |

## Stack

- **Frontend**: React 18 + Vite 6, Vanilla CSS
- **Backend**: Express 5, Node ≥20, ESM
- **Daten**: JSON-Dateien in `server/data/` + SQLite (`wortprofil.db`) auf Railway Volume
- **Deployment**: Railway (Auto-Deploy auf `main`), Railway Volume auf `/app/server/data`

## Lokale Entwicklung

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen einrichten
cp .env.example .env
# ADMIN_KEY in .env setzen

# 3. Frontend-Dev-Server starten
npm run dev

# 4. Backend-Server starten (separates Terminal)
npm run server
```

Frontend läuft auf `http://localhost:5173`, Backend auf `http://localhost:3001`.

## Befehle

```bash
npm run dev          # Vite Dev-Server (Frontend)
npm run server       # Express-Server (Backend)
npm run build        # Production Build
npm run test         # Vitest (Unit-Tests)
```

## Umgebungsvariablen

Alle Variablen sind in `.env.example` dokumentiert.

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `ADMIN_KEY` | ja (Prod) | Passwort für das Admin-Panel |
| `NODE_ENV` | nein | `production` aktiviert Prod-Modus |
| `PORT` | nein | Server-Port (Standard: 3001) |
| `ALLOWED_ORIGINS` | nein | Kommagetrennte CORS-Origins |
| `GITHUB_GIST_TOKEN` | nein | PAT für automatisches Gist-Backup |
| `BACKUP_KEEP` | nein | Anzahl beizubehaltender Backups (Standard: 5) |
| `LOG_LEVEL` | nein | Pino-Log-Level (Standard: `info`) |

## Datenmodell

Alle Spieldaten liegen als JSON-Dateien in `server/data/`. Auf Railway werden sie auf einem persistenten Volume gespeichert und **nicht** aus Git geladen.

| Datei | Struktur |
|---|---|
| `kalender.json` | `{ "MM-DD": ["lemmaId1", "lemmaId2", "lemmaId3"] }` |
| `lemmata.json` | Array von Lemma-Objekten mit `id`, `lemma`, `pos`, `wortart`, `ipa`, `definitionen`, `runden`, `rundenInfo`, `notiz`, `link` |
| `zeitreise.json` | `{ lemma, paare, perioden, wortart }` pro Eintrag |
| `wortzwilling.json` | `{ wortA, wortB, pos, kollokatoren }` pro Eintrag |
| `stats.json` | `{ "MM-DD": { [game]: { plays, scoreSum, maxSum, dist } } }` |
| `diacollo-config.json` | `{ corpora: [{ id, enabled, label, zeitraum, slice }] }` |

> **Wichtig:** JSON-Daten nur über das Admin-Panel eingeben – das Railway Volume hat Vorrang vor Git.

## Architektur

```
server/
├── index.js          # Express-Setup, Helmet, CORS, Router-Mounts
├── store.js          # File-I/O: load(), save() (atomar), Cache (TTL 6h, LRU 200)
├── wortprofil.js     # Kollokations-Abfragen gegen lokale wortprofil.db (SQLite)
├── wortzwilling.js   # Wort-Zwilling-Logik
├── wiktionary.js     # Wiktionary-Fetch: IPA + Bedeutungen (gespeichert in lemmata.json)
├── belege.js         # Korpusbelege-Abfragen
├── backup.js         # Automatisches GitHub-Gist-Backup (täglich 02:00 Uhr)
├── audit.js          # Audit-Log für Admin-Aktionen
├── logger.js         # Pino-Logger
├── middleware/
│   ├── auth.js       # Session-Token-Authentifizierung für Admin-Routen
│   ├── validate.js   # Zod-Validierungsmiddleware
│   └── rateLimiter.js
├── routes/
│   ├── public.js     # GET /api/v1/* (öffentliche Spielrouten)
│   └── admin.js      # /admin/* (auth-required)
└── data/             # JSON-Datendateien (auf Railway: Volume)
```

## Deployment

Das Projekt deployed automatisch auf Railway bei jedem Push auf `main`.

- **Build**: `npm run build` (Vite)
- **Start**: `node server/index.js`
- **Cron**: täglich 02:00 Uhr → `node server/backup.js`

Admin-Panel: `signifikation.de/admin`
