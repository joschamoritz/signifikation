# Betriebs- und Runtime-Notizen

## Ziel

Knappe, repo-nahe Referenz fuer den aktuellen Produktionsbetrieb von Signifikation.

## Produktions-Topologie

- Hosting: Hetzner VPS, Region Nuernberg
- Reverse Proxy: nginx
- Node-Prozess: PM2
- Frontend: Vite-Build aus `dist/`
- Backend: Express aus `server/index.js`
- Persistenz:
  - App-Datenbank: `server/data/signifikation.db`
  - Wortprofil-Datenbank liegt separat als grosse SQLite-Datei

## Startpfad

- Build-Artefakte werden ueber GitHub Actions erzeugt und auf dem Server ausgerollt.
- PM2 startet die App mit `node server/index.js`.
- Der Webprozess bedient HTTP und Socket.IO.
- `server/backup.js` ist aktuell als zeitgesteuerter Job vorgesehen und noch nicht von der Web-Runtime entkoppelt.

## Deploy-Modell

- Zielbranch: `main`
- Vor Deploy muss `verify` erfolgreich sein.
- Im Repo bereits relevant:
  - GitHub Actions Workflow in `.github/workflows/deploy.yml`
  - Build via `npm run build`
  - Tests via `npm run test`

## Laufzeitkritische Punkte

- `server/store.js` ist weiterhin zentrale Kompositionsstelle fuer Datenzugriff.
- Hintergrundaufgaben laufen derzeit nicht in einem getrennten Worker-Prozess.
- PM2-/nginx-Konfigurationen sind noch nicht vollstaendig versioniert.
- Vollstaendige Browser-basierte CWV-Messungen fehlen noch.

## Health und Beobachtbarkeit

- Oeffentlicher Health-Endpoint:
  - `GET /health`
- Admin-/Ops-relevante Diagnosepfade liegen unter `/admin/*`.
- Logging:
  - Pino ueber `server/logger.js`
  - kein `console.log` im Servercode

## Daten- und Restore-Hinweise

- Produktionsdaten werden nicht aus Git bezogen.
- Backups und Restores laufen ueber die Admin-Routen.
- Das Backup-Format enthaelt aktuell:
  - `lemmata.json`
  - `kalender.json`
  - `zeitreise.json`
  - `wortzwilling.json`
  - `zeitenwende.json`
  - `stats.json`
  - `stats-rows.json`

## Noch offene Betriebsarbeiten aus dem Audit

1. PM2-Konfiguration repo-nah dokumentieren oder versionieren
2. nginx-Routing und relevante Header/Caching-Regeln repo-nah dokumentieren
3. Backup-/Export-Jobs vom Webprozess entkoppeln oder explizit als akzeptiertes Interim dokumentieren
4. Browser-basierte CWV-Messung und Baseline festhalten
