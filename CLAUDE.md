# Signifikation

Tägliches linguistisches Quiz basierend auf DWDS-Daten. Deployed auf Railway, Domain signifikation.de.

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
- **Deployment**: Railway (Auto-Deploy auf main), Railway Volume auf `/app/server/data`

## Architektur

- `server/index.js` – Express-Setup, Helmet, CORS, Router-Mounts
- `server/routes/public.js` – alle `/api/v1/*` Routen
- `server/routes/admin.js` – alle `/admin/*` Routen (auth-required)
- `server/middleware/validate.js` – Zod-Validierung; **Express 5: `req.query` ist read-only** → `Object.assign(req[source], result.data)` statt `req[source] = result.data`
- `server/store.js` – File-I/O: `load()`, `save()` (atomar), Beleg-Cache (TTL 6h, LRU 200)
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

## Achtung

- JSON-Daten **nur** über Admin-Panel eingeben – Railway Volume hat Vorrang vor Git
- Admin-CSP benötigt `style-src 'unsafe-inline'` (dynamische `style=""`-Attribute in Render-Funktionen)
- Belege-Datenbank (belege.db, ~19 GB) selbst erstellt aus CC-lizenzierten Korpora – keine Drittgenehmigung erforderlich
- DiaCollo-Endpunkt: `fmt=json` (nicht `format=json`)

## Arbeitsweise

- Commits sammeln, nicht nach jeder Änderung sofort pushen – User entscheidet wann
- Bei Redesigns: nach jeder Seite auf Bestätigung warten
- Bei Texten: erst 2–3 Vorschläge, dann umsetzen
