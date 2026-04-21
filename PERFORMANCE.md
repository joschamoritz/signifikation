# Performance-Baseline

## Ziel

Repo-nahe Kurzreferenz fuer den aktuell bekannten Performance-Stand nach den Audit-Folgearbeiten.

## Aktueller Stand

Letzte verifizierte lokale Messbasis in dieser Arbeitsphase:

- `npm.cmd run build`
- Build erfolgreich
- Build-Zeit: ca. `1.19s`
- PWA-Precache: `36 entries (1000.08 KiB)`

## Relevante Build-Artefakte

- Haupt-JS-Chunk: `dist/assets/index-CcQSN3iD.js` -> `272.86 kB` raw, `80.07 kB` gzip
- Zweiter JS-Chunk: `dist/assets/index-DTyze2dP.js` -> `42.53 kB` raw, `13.31 kB` gzip
- Haupt-CSS: `dist/assets/index-B-1qRPsG.css` -> `86.76 kB` raw, `15.33 kB` gzip
- Lazy-Chunks weiter klein:
  - `Zeitreise` ca. `13.22 kB`
  - `WortZwilling` ca. `10.11 kB`
  - `Zeitenwende` ca. `9.47 kB`

## Gegenueber dem Audit verbessert

- Precache wurde bereits von ca. `2.83 MiB` auf ca. `1.00 MiB` reduziert.
- Der App-Kern ist strukturell weiter zerlegt worden:
  - `App.jsx` kleiner
  - `admin.js` kleiner
  - `store.js` modularisiert
- Die groessten verbleibenden Runtime-Hotspots liegen eher im App-Bootstrap und in zentraler Orchestrierung als in den lazy Spielmodus-Chunks.

## Weiter offen

1. Vollstaendige Browser-CWV-Messung fehlt weiterhin:
   - LCP
   - INP
   - CLS
2. Hauptchunk ist trotz Strukturabbau weiter der dominante JS-Block.
3. CSS bleibt fuer eine Vanilla-CSS-App ein relevanter Renderpfad-Anteil.

## Empfohlene naechste Performance-Arbeit

1. Browser-basierte Messung gegen laufende Instanz dokumentieren
2. Bootstrap-Request-Muster weiter reduzieren
3. Kritischen App-Shell-Pfad weiter von seltenen Flows trennen
