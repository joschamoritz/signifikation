# Performance-Baseline

## Ziel

Repo-nahe Kurzreferenz fuer den aktuell bekannten Performance-Stand nach den Audit-Folgearbeiten.

## Aktueller Stand

Letzte verifizierte lokale Messbasis in dieser Arbeitsphase:

- `npm.cmd test`
- `npm.cmd run build`
- Tests erfolgreich
- Build erfolgreich
- Build-Zeit: ca. `1.42s`
- PWA-Precache: `15` Eintraege / `146.88 KiB`; Scripts, Fonts und Bilder laufen ueber Runtime-Caches

## Relevante Build-Artefakte

- Haupt-JS-Chunk: `dist/assets/index-DHqbEcE5.js` -> `277.17 kB` raw, `81.90 kB` gzip
- Zweiter JS-Chunk: `dist/assets/index-DTyze2dP.js` -> `42.53 kB` raw, `13.31 kB` gzip
- Haupt-CSS: `dist/assets/index--XcRNP7_.css` -> `87.14 kB` raw, `15.37 kB` gzip
- Lazy-Chunks weiter klein:
  - `Zeitreise` ca. `13.22 kB`
  - `WortZwilling` ca. `10.11 kB`
  - `Zeitenwende` ca. `9.47 kB`

## Gegenueber dem Audit verbessert

- Precache wurde von einem uebergrossen JS-lastigen Stand auf einen kleinen App-Shell-Precache reduziert.
- Fonts und statische Bilder werden nicht mehr pauschal mit in den Installations-Precache gezogen.
- Haupt-JS laeuft jetzt bewusst ueber Runtime-Caching statt ueber den Installations-Precache.
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
