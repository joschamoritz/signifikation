---
date: 2026-04-20
---

# Session 2026-04-20 aufraeumen und refactoring

## Ziel

- Audit-Folgearbeiten aus `planning/Audit-Ergebnisse/2026-04-20-session-9-synthese-und-plan.md` praktisch umsetzen
- grosse Frontend- und Backend-Hotspots verkleinern, ohne das Verhalten zu aendern
- den Stand in einen commit-faehigen Zustand bringen

## Erledigt

### Frontend-Orchestrierung in `src/App.jsx` verkleinert

- Render-Logik fuer Tab-Screens in `src/components/AppTabScreens.jsx` ausgelagert
- Render-Logik fuer Spielscreens in `src/components/AppGameScreens.jsx` ausgelagert
- Nebenmodus-/Tab-Orchestrierung in `src/hooks/useAppTabScreens.js` ausgelagert
- Game-Screen-Transitions und Screen-Aktionen in `src/hooks/useAppGameScreens.js` gebuendelt
- weitere App-Shell-Entlastung ueber dedizierte Model-/Effects-/Daily-State-Hooks:
  - `src/hooks/useAppModel.js`
  - `src/hooks/useAppEffects.js`
  - `src/hooks/useAppDailyState.js`
  - `src/hooks/useAppNavigation.js`
- `src/App.jsx` auf eine kleine Shell-Datei mit Model-Konsum reduziert
- Tagesfortschritt- und Local-Storage-Helfer nach `src/utils/dailyProgress.js` verschoben
- View-Transition-Helfer nach `src/utils/viewTransition.js` ausgelagert
- Lazy-Imports der Spielscreens nach `src/components/AppLazyScreens.js` verschoben
- `src/components/AppShell.jsx` und `src/components/PersistentClassroomTab.jsx` als eigene Shell-Bausteine eingefuehrt
- `src/App.jsx` damit deutlich staerker auf Navigation, State-Orchestrierung und API-Flows reduziert
- `src/App.jsx` von ungenutzten Imports bereinigt und die Reihenfolge der abgeleiteten Tagesdaten gegen eine fragile Nutzung vor Deklaration korrigiert

### Klassenraum-Tab in kleinere Module zerlegt

- `src/components/ClassroomTab.jsx` von einer Multi-Rollen-Grosskomponente zu einer Kompositionsdatei reduziert
- weiterer Orchestrierungs-Schnitt: `src/components/classroom/useClassroomTabState.js` eingefuehrt, damit `ClassroomTab.jsx` nur noch Shell und Zusammensetzung bleibt
- Lehrer-Logik nach `src/components/classroom/useTeacherClassroom.js` extrahiert
- Schueler-/Socket-/Reconnect-Logik nach `src/components/classroom/useStudentClassroom.js` extrahiert
- Account-Laden nach `src/components/classroom/useClassroomAccount.js` extrahiert
- Snap-Navigation nach `src/components/classroom/useClassroomSnapNav.js` und `src/components/classroom/ClassroomSnapNav.jsx` extrahiert
- abgeleitete Anzeigezustande nach `src/components/classroom/classroomViewModel.js` extrahiert
- gemeinsame Hilfen nach `src/components/classroom/classroomUtils.js` verschoben
- Karten-/Praesentationsbausteine weiter in `src/components/classroom/` gebuendelt
- Klassenraum-Status-/Rasterleiste nach `src/components/classroom/ClassroomRaster.jsx` ausgelagert
- `ClassroomEntries.jsx` auf aggregierte `teacherState`-/`studentState`-Props reduziert, um die Prop-Flaeche weiter zu verkleinern
- `useClassroomTabState.js` liefert aggregierte `entriesProps` und `snapNavProps`, damit `ClassroomTab.jsx` nahezu nur noch Layout zusammensteckt

### Tab- und Konto-Struktur bereinigt

- produktive Konto-Logik aus dem Platzhalter-Kontext herausgezogen
- neues `src/components/KontoTab.jsx` als klarer Zielort fuer Konto-/Auth-UI angelegt
- `src/components/TabPlaceholders.jsx` entsprechend entschlackt
- `src/components/TabTransition.jsx` weiter vereinfacht, damit Tab-Wechsel klarer getrennt bleiben
- `src/components/KontoTab.jsx` weiter auf Seitenkomposition reduziert
- komplette Konto-Auth-Logik in `src/hooks/useKontoAuth.js` ausgelagert
- Konto-Auth-UI in `src/components/konto/KontoAuthCard.jsx` extrahiert
- gemeinsame Wörterbuch-Kopfzeile als `src/components/TabHeader.jsx` zentralisiert und in Konto-, Klassenraum- und Placeholder-Screens wiederverwendet

### Frontend-Bootstrap und Runtime vereinfacht

- neue Hooks `src/hooks/useDailyContent.js` und `src/hooks/useEntitlements.js` eingefuehrt
- Frontend-Bootstrap damit von `App.jsx` in fokussiertere Hooks verschoben
- `src/utils/storage.js` bereinigt
- `vite.config.js` ueberarbeitet, um die bisherige Runtime-/PWA-Konfiguration sauberer abzubilden
- `src/components/TabTransition.jsx` technisch korrigiert: beim Tab-Wechsel werden alter und neuer Screen jetzt wirklich getrennt gerendert, statt nur denselben Tree umzuschichten
- zugehoerige Transition-CSS in `src/styles/tabbar.css` auf explizite Enter-/Exit-Zustaende umgestellt, inklusive reduziertem Bewegungsmodus

### Weitere Entflechtung von Store, Admin und Classroom

- `server/store.js` weiter in kleinere interne Module zerlegt:
  - `server/store-stats.js`
  - `server/store-daily-content.js`
  - `server/store-lemmata.js`
  - `server/store-readers.js`
  - `server/store-readonly-cache.js`
  - `server/store-belege-cache.js`
- Lemmata-Index-Cache nach `server/store-lemmata.js` verschoben (`createLemmataIndexStore`)
- Reader-/Saver-Dispatcher aus `server/store.js` nach `server/store-readers.js` ausgelagert
- Admin-Router weiter entlang fachlicher Rollen entkoppelt:
  - `server/routes/admin-core.js`
  - `server/routes/admin-users-data.js`
  - `server/routes/admin-backup-utils.js`
  - `server/routes/admin-calendar.js`
  - `server/routes/admin-calendar-utils.js`
  - `server/routes/admin-stats.js`
  - `server/routes/admin-ops.js`
  - `server/routes/admin-social-cards.js`
- `server/routes/admin.js` damit nochmals auf Komposition/Wiring reduziert

### Klassenraum-Praesentation weiter geschnitten

- neue Praesentationsbausteine fuer den Klassenraum ergaenzt:
  - `src/components/classroom/ClassroomEntries.jsx`
  - `src/components/classroom/ClassroomHeader.jsx`
  - `src/components/classroom/TeacherClassroomEntries.jsx`
  - `src/components/classroom/StudentClassroomEntries.jsx`

### Betrieb und Performance dokumentiert

- `OPS.md` fuer Laufzeit-, Deploy- und Betriebswissen angelegt
- `PERFORMANCE.md` fuer Build-/Bundle-/Precache-Stand und weitere Performance-Arbeit angelegt

### Admin- und Server-Struktur weiter entkoppelt

- grossen Admin-Router weiter aufgeteilt:
  - `server/routes/admin-audit.js`
  - `server/routes/admin-backup.js`
  - `server/routes/admin-users.js`
- Lehrer-Socket-Authentifizierung in `server/classroom/teacher-socket-auth.js` separiert
- betroffene Server-Stellen fuer Classroom, Admin und Store auf die neue Aufteilung angepasst:
  - `server/routes/admin.js`
  - `server/routes/classroom.js`
  - `server/realtime/classroomSocket.js`
  - `server/store.js`

### Tests, Tooling und Deploy-Kontext aktualisiert

- Classroom-Tests fuer die neuen Serverpfade erweitert:
  - `server/__tests__/classroom.routes.test.js`
  - `server/classroom.acceptance.test.js`
- `package.json` angepasst
- `.github/workflows/deploy.yml` angepasst, um den Deploy-Pfad mit dem aufgeraeumten Stand konsistent zu halten
- neuer `.github/workflows/verify.yml` als separates Verify-Gate ergaenzt
- PWA-Precache in `vite.config.js` auf kleine Shell-Artefakte reduziert; Scripts laufen ueber Runtime-Cache
- Socket- und HTTP-Origin-Pruefung auf gemeinsame Config in `server/config/origins.js` ausgerichtet
- `server/routes/admin-stats.js` auf explizite Store-Timeline statt direkten `stats.json`-Zugriff umgestellt
- Tagescontent-CRUD in `server/store-daily-content.js` als eigenes Store-Modul gekapselt; `server/store.js` delegiert Kalender-/Zeitreise-/Wortzwilling-/Zeitenwende-Operationen jetzt dorthin
- Admin-Aufrufer (`admin-calendar`, `admin-ops`, `admin-social-cards`) auf explizite Store-Helfer wie `loadKalender()`, `loadDailyContentMaps()` und `loadMutableDailyContentMaps()` umgestellt statt verstreuter direkter Dateinamen-Zugriffe
- `server/routes/public.js` und `server/backup.js` ebenfalls auf explizitere Store-Helfer umgestellt (`loadKalender()`, `loadZeitreise()`, `loadWortZwilling()`, `loadStatsRows()`)
- wiederholte Multi-Saves fuer Daily-Content in `server/store.js` als `saveDailyContentMaps()` gebuendelt, damit Admin-Routen nicht mehr vier Dateinamen parallel koordinieren muessen
- `/admin/tag` in `server/routes/admin-calendar.js` ebenfalls auf den gebuendelten Daily-Content-Speicherpfad umgestellt statt Kalender/Zeitreise/Wortzwilling/Zeitenwende nacheinander einzeln zu persistieren
- Klassenraum-Hintergrundarbeit in `server/workers/classroomWorker.js` gekapselt und als separater PM2-Prozess startbar gemacht
- PM2-Beispielkonfiguration in `ecosystem.config.cjs` und nginx-Beispiel in `ops/nginx-signifikation.conf.example` angelegt
- Deploy-Workflow auf `pm2 startOrRestart ecosystem.config.cjs` umgestellt, damit der neue Worker nicht von manuell vorab angelegten PM2-Prozessen abhaengt
- nginx-Beispiel auf produktionsnaehere TLS-/Redirect-Konfiguration mit ACME-Challenge, HTTPS-Canonical-Redirect und sauberen Proxy-/Socket-Headern erweitert
- `OPS.md` um den jetzt repo-nah dokumentierten HTTPS-/TLS-/Proxy-Stand ergaenzt und den offenen Ops-Restpunkt auf echte Browser-CWV-Messung fokussiert
- verbleibende Backup-/Export-Aufraeumung als naechster kleiner Audit-Rest identifiziert, damit auch dort keine verstreuten Dateilisten und generischen `loadReadOnly()`-Schleifen mehr im Job-/Routencode bleiben
- Backup-/Export-Pfad ueber `loadBackupFiles()` in `server/store.js` gebuendelt, damit `server/backup.js` und `server/routes/admin-backup.js` denselben expliziten Export-Snapshot nutzen
- letzter direkter Kalender-Save im Bulk-Import auf den konsistenten Daily-Content-Helfer umgestellt; `admin-calendar` nutzt damit fuer die Daily-Maps keinen isolierten `save('kalender.json', ...)`-Pfad mehr
- Browser-CWV-Messung repo-nah in `PERFORMANCE.md` dokumentiert: Messumgebung, Schrittfolge, Protokollvorlage und repo-spezifische Interpretation fuer `LCP`/`INP`/`CLS`
- `OPS.md` um einen wiederkehrenden Performance-/CWV-Ops-Check ergaenzt, damit die noch offene Audit-Messung kuenftig als klarer Betriebsablauf nach groesseren Frontend-Aenderungen nachgezogen werden kann

## Verifikation

- `npm.cmd run build` erfolgreich
- `npm.cmd test` erfolgreich

## Relevante Dateien

- `src/App.jsx`
- `src/components/AppGameScreens.jsx`
- `src/components/AppLazyScreens.js`
- `src/components/AppShell.jsx`
- `src/components/AppTabScreens.jsx`
- `src/components/ClassroomTab.jsx`
- `src/components/PersistentClassroomTab.jsx`
- `src/components/KontoTab.jsx`
- `src/components/TabHeader.jsx`
- `src/components/konto/KontoAuthCard.jsx`
- `src/components/classroom/`
- `src/hooks/useDailyContent.js`
- `src/hooks/useEntitlements.js`
- `src/hooks/useAppModel.js`
- `src/hooks/useAppEffects.js`
- `src/hooks/useAppDailyState.js`
- `src/hooks/useAppNavigation.js`
- `src/hooks/useAppTabScreens.js`
- `src/hooks/useAppGameScreens.js`
- `src/hooks/useKontoAuth.js`
- `src/components/TabTransition.jsx`
- `src/utils/dailyProgress.js`
- `src/utils/viewTransition.js`
- `src/utils/storage.js`
- `src/styles/tabbar.css`
- `server/routes/admin.js`
- `server/routes/admin-audit.js`
- `server/routes/admin-backup.js`
- `server/routes/admin-users.js`
- `server/routes/admin-core.js`
- `server/routes/admin-users-data.js`
- `server/routes/admin-backup-utils.js`
- `server/routes/admin-calendar.js`
- `server/routes/admin-calendar-utils.js`
- `server/routes/admin-stats.js`
- `server/routes/admin-ops.js`
- `server/routes/admin-social-cards.js`
- `server/classroom/teacher-socket-auth.js`
- `server/realtime/classroomSocket.js`
- `server/config/origins.js`
- `server/jobs/classroomRetention.js`
- `server/workers/classroomWorker.js`
- `server/store.js`
- `ops/nginx-signifikation.conf.example`
- `server/store-stats.js`
- `server/store-daily-content.js`
- `server/store-lemmata.js`
- `server/store-readers.js`
- `server/store-readonly-cache.js`
- `server/store-belege-cache.js`
- `OPS.md`
- `PERFORMANCE.md`
- `ecosystem.config.cjs`
- `.github/workflows/deploy.yml`
- `.github/workflows/verify.yml`

## Naechster sinnvoller Schritt

- den Aufraeumstand gemeinsam als Baseline fuer die naechste kleinere Fachfunktion oder den naechsten gezielten Audit-Fix nutzen
