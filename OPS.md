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
- Der Classroom-Worker kann eingebettet im Webprozess oder getrennt ueber PM2 laufen.
- `server/backup.js` ist aktuell als zeitgesteuerter Job vorgesehen und noch nicht von der Web-Runtime entkoppelt.

## Deploy-Modell

- Zielbranch: `main`
- Vor Deploy muss der separate GitHub-Workflow `Verify` erfolgreich sein.
- Im Repo bereits relevant:
  - GitHub Actions Workflow in `.github/workflows/verify.yml`
  - GitHub Actions Workflow in `.github/workflows/deploy.yml`
  - Build via `npm run build`
  - Tests via `npm run test`
  - PM2-Beispielkonfiguration in `ecosystem.config.cjs`
  - nginx-Beispielkonfiguration in `ops/nginx-signifikation.conf.example`
  - Deploy nutzt `pm2 startOrRestart ecosystem.config.cjs`, damit Web- und Worker-Prozess reproduzierbar gestartet werden

## Laufzeitkritische Punkte

- `server/store.js` ist weiterhin zentrale Kompositionsstelle fuer Datenzugriff.
- Hintergrundaufgaben koennen jetzt ueber `server/workers/classroomWorker.js` getrennt vom Webprozess laufen.
- Die PM2-Beispielkonfiguration startet `signifikation` und optional `signifikation-worker` getrennt.
- PM2-/nginx-Konfigurationen sind repo-nah als Beispiel dokumentiert, bleiben aber umgebungsspezifisch.
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

1. Browser-basierte CWV-Messung und Baseline festhalten
2. Entscheiden, ob der Classroom-Worker in Produktion dauerhaft getrennt laufen soll oder nur optional
3. nginx-Routing um produktive TLS-/Redirect-Regeln ergänzen
