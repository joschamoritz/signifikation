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
- Tagesfortschritt- und Local-Storage-Helfer nach `src/utils/dailyProgress.js` verschoben
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

### Tab- und Konto-Struktur bereinigt

- produktive Konto-Logik aus dem Platzhalter-Kontext herausgezogen
- neues `src/components/KontoTab.jsx` als klarer Zielort fuer Konto-/Auth-UI angelegt
- `src/components/TabPlaceholders.jsx` entsprechend entschlackt
- `src/components/TabTransition.jsx` weiter vereinfacht, damit Tab-Wechsel klarer getrennt bleiben

### Frontend-Bootstrap und Runtime vereinfacht

- neue Hooks `src/hooks/useDailyContent.js` und `src/hooks/useEntitlements.js` eingefuehrt
- Frontend-Bootstrap damit von `App.jsx` in fokussiertere Hooks verschoben
- `src/utils/storage.js` bereinigt
- `vite.config.js` ueberarbeitet, um die bisherige Runtime-/PWA-Konfiguration sauberer abzubilden

### Weitere Entflechtung von Store, Admin und Classroom

- `server/store.js` weiter in kleinere interne Module zerlegt:
  - `server/store-stats.js`
  - `server/store-daily-content.js`
  - `server/store-lemmata.js`
  - `server/store-readonly-cache.js`
  - `server/store-belege-cache.js`
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

## Verifikation

- `npm.cmd run build` erfolgreich
- `npm.cmd test` erfolgreich

## Relevante Dateien

- `src/App.jsx`
- `src/components/AppGameScreens.jsx`
- `src/components/AppTabScreens.jsx`
- `src/components/ClassroomTab.jsx`
- `src/components/KontoTab.jsx`
- `src/components/classroom/`
- `src/hooks/useDailyContent.js`
- `src/hooks/useEntitlements.js`
- `src/hooks/useAppTabScreens.js`
- `src/hooks/useAppGameScreens.js`
- `src/utils/dailyProgress.js`
- `src/utils/storage.js`
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
- `server/store.js`
- `server/store-stats.js`
- `server/store-daily-content.js`
- `server/store-lemmata.js`
- `server/store-readonly-cache.js`
- `server/store-belege-cache.js`
- `OPS.md`
- `PERFORMANCE.md`
- `.github/workflows/deploy.yml`

## Naechster sinnvoller Schritt

- den Aufraeumstand gemeinsam als Baseline fuer die naechste kleinere Fachfunktion oder den naechsten gezielten Audit-Fix nutzen
