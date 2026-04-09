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
- **Backend**: Express 5, Node, ESM (`server/`)
- **Daten**: JSON-Dateien in `server/data/` (kein Datenbankserver)
- **Deployment**: Hetzner VPS (Nürnberg), PM2, nginx, GitHub Actions CI/CD, Daten unter `/opt/signifikation/app/server/data`

## Architektur

- `server/index.js` – Express-Setup, Helmet, CORS, Router-Mounts
- `server/routes/public.js` – alle `/api/v1/*` Routen
- `server/routes/admin.js` – alle `/admin/*` Routen (auth-required)
- `server/middleware/validate.js` – Zod-Validierung; **Express 5: `req.query` ist read-only** → `Object.assign(req[source], result.data)` statt `req[source] = result.data`
- `server/store.js` – File-I/O: `load()`, `save()` (atomar), Cache (TTL 6h, LRU 2000)
- `src/components/Home.jsx` – Startseite (Wörterbuch-Design, importiert `test.css`)
- `src/test.css` – alle Wörterbuch-Design-Stile

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

- JSON-Daten **nur** über Admin-Panel eingeben – Hetzner-Volume hat Vorrang vor Git
- Admin-CSP benötigt `style-src 'unsafe-inline'` (dynamische `style=""`-Attribute)
- Belege-Datenbank (belege.db) auf Hetzner-Volume – FTS5-Index für Korpusbelege

## Arbeitsweise

- Commits sammeln, nicht nach jeder Änderung sofort pushen – User entscheidet wann
- Bei Redesigns: nach jeder Seite auf Bestätigung warten
- Bei Texten: erst 2–3 Vorschläge, dann umsetzen
