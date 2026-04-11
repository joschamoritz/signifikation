# Signifikation

Tägliches linguistisches Quiz – korpusbasiert, wörterbuchästhetisch. Deployed auf Hetzner (Nürnberg), Domain signifikation.de.

## Befehle

```
npm run dev          # Dev-Server starten
npm run build        # Production Build
npm run test         # Vitest (Unit-Tests)
npm run lint         # ESLint
```

Server neu starten (Windows): `powershell.exe -Command "Get-Process node | Stop-Process -Force"`

## Stack

- **Frontend**: React 18 + Vite 6, Vanilla CSS (`src/`)
- **Backend**: Express 5, Node.js (ESM), better-sqlite3
- **Datenbank**: SQLite (`signifikation.db`) – alle Spieldaten in einer Datei
- **Deployment**: Hetzner VPS (Nürnberg), PM2, nginx, GitHub Actions CI/CD

## Architektur

- `server/index.js` – Express-Setup, Helmet, CORS, Router-Mounts
- `server/routes/public.js` – alle `/api/v1/*` Routen
- `server/routes/admin.js` – alle `/admin/*` Routen (auth-required)
- `server/middleware/validate.js` – Zod-Validierung; **Express 5: `req.query` ist read-only** → `Object.assign(req[source], result.data)` statt `req[source] = result.data`
- `server/db.js` – SQLite-Verbindung, Schema-Definition (WAL-Mode, Prepared Statements)
- `server/store.js` – Datenzugriff-Layer: `load()`, `save()` (Legacy-API, intern SQLite), In-Memory-Caches
- `server/migrate.js` – Einmaliges Migrations-Skript (JSON → SQLite, idempotent)
- `src/components/Home.jsx` – Startseite (Wörterbuch-Design, importiert `test.css`)
- `src/test.css` – alle Wörterbuch-Design-Stile

## Datenbank (SQLite)

**Pfad lokal**: `server/data/signifikation.db`  
**Pfad Hetzner**: `/opt/signifikation/app/server/data/signifikation.db`

**Tabellen**:
- `lemmata` – Lemma-Objekte (id, lemma, pos, wortart, runden, rundenInfo, notiz, link, definition, bonusFrage, ipa, definitionen)
- `kalender` – Tagesplanung (datum → ids als JSON-Array)
- `zeitreise` – Zeitreise-Einträge (datum, lemma, paare, perioden, wortart)
- `wortzwilling` – Wort-Zwilling-Einträge (datum, wortA, wortB, pos, kollokatoren)
- `zeitenwende` – Zeitenwende-Einträge (datum, data als JSON)
- `stats` – Spielstatistiken (datum, spiel, plays, scoreSum, maxSum, dist)

**JSON-Felder**: Komplexe Datenstrukturen (Arrays, Objekte) werden als TEXT gespeichert und per `JSON.parse/stringify` konvertiert.

**WAL-Mode**: Write-Ahead Logging für bessere Concurrency (`.db-shm`, `.db-wal` Dateien sind normal).

**Alte JSON-Dateien**: `lemmata.json`, `kalender.json`, etc. sind veraltet und werden nicht mehr gelesen – können gelöscht werden.

## Konventionen

- Kein `console.log` – immer `logger` aus `server/logger.js` (pino)
- Zod-Schemas für alle Endpoints (validate-Middleware)
- Fehler-Response immer `{ error: "..." }` – nie Stack Traces an Client
- Kein Emoji in der App außer Streak 🔥 und Feedback 😕😐🙂😄🤩
- Keine externen Icon-Libraries, keine CSS-Frameworks

## Corporate Design

- **Schrift**: Gentium Plus (Headwords), DM Sans (UI-Elemente)
- **Rot**: `#9b1c1c` (Primärakzent: CTAs, Drop Cap, Überschriften)
- **Gold**: `#c9a84c` (Badges, Akzente)
- **Hintergrund**: `#faf9f7` (Pergament)
- Wörterbuch-Ästhetik (Duden-Stil) – keine typische Quiz-App-Optik
- max-width: 680px (Home/TestPage), 480px (Spielscreens)

## Hinweise

- Daten **nur** über Admin-Panel eingeben – Hetzner-Volume hat Vorrang vor Git
- Admin-CSP benötigt `style-src 'unsafe-inline'` (dynamische `style=""`-Attribute)
- Belege-Datenbank (belege.db) auf Hetzner-Volume – FTS5-Index für Korpusbelege

## Arbeitsweise

- Commits sammeln, nicht nach jeder Änderung sofort pushen – User entscheidet wann
- Bei Redesigns: nach jeder Seite auf Bestätigung warten
- Bei Texten: erst 2–3 Vorschläge, dann umsetzen
