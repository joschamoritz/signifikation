# Tiefenanalyse der App „Signifikation" — 2026-06-11

Durchgeführt mit fünf parallelen, spezialisierten Analyse-Agents auf Stand von Branch
`claude/kind-thompson-1od5ll` (HEAD `940b829`). Jeder Agent hat die relevanten Dateien
vollständig gelesen; der Test-Agent hat zusätzlich die komplette Testsuite ausgeführt.

| Bereich | Umfang |
|---|---|
| 1. Backend-Architektur | `server/` (Routes, Auth, Classroom, Jobs, Middleware, Realtime, Notifications, Config), `shared/`, `ecosystem.config.cjs` |
| 2. Frontend | `src/` (Komponenten, Hooks, API-Layer, SW, CSS), `index.html`, `vite.config.js`, Capacitor |
| 3. Security | Auth/Authz, Injection, Payments (Mollie + Apple IAP), Classroom, Header, Secrets |
| 4. Datenbank & Performance | Schema/Migrationen, Query-Qualität, SQLite-Betrieb, Caching, Backup, Skalierung |
| 5. Tests, CI/CD & Betrieb | Vitest/Playwright, GitHub Actions, PM2, Ops, Developer Experience |

---

## Executive Summary

**Gesamtbild:** Die Codebasis ist für ein Ein-Personen-Projekt ungewöhnlich diszipliniert
gebaut. Alle fünf Analysen kommen unabhängig zum gleichen Urteil: dokumentierte Invarianten
(Kommentare erklären *warum*, inkl. Bug-Historie), serverautoritatives Classroom-Design,
neustart-feste Jobs, incident-gehärtete Deploy-Pipeline mit automatischem Rollback,
durchgängige Prepared Statements und Zod-Validierung, vorbildliches Code-Splitting im
Frontend. **676 Tests, alle grün, in 34 s.** Keine kritischen Sicherheitslücken gefunden.

**Die wichtigsten Befunde (alle mit kleinem bis mittlerem Aufwand behebbar):**

| # | Befund | Bereich | Schwere | Aufwand |
|---|---|---|---|---|
| 1 | PM2 startet nicht existierenden Worker `server/workers/classroomWorker.js` → Crash-Loop im Deployment | Backend | Hoch | S |
| 2 | IAP-Sandbox-Default ist **an** (`IAP_ALLOW_SANDBOX !== '0'`) → nach App-Store-Launch kostenlose Premium-Freischaltung per Sandbox-Account möglich | Security | Hoch | S |
| 3 | IAP-Legacy-Pfad ohne `appAccountToken` erlaubt JWS-Replay über fremde Accounts | Security | Hoch | S–M |
| 4 | Origin-Konfiguration doppelt implementiert und gedriftet (`auth/index.js` vs. `config/origins.js`): `http://localhost` in Prod-trustedOrigins, `https://localhost` (Android) fehlt | Backend/Security | Hoch | S |
| 5 | Rules-of-Hooks-Verstoß in `Quiz.jsx` (Early-Return vor Joker-Hooks) → latenter React-Crash | Frontend | Hoch | S |
| 6 | Service Worker: `skipWaiting`/`clientsClaim` fehlen trotz `autoUpdate` → alte App-Version bleibt aktiv, Mischversions-Risiko | Frontend | Hoch | S |
| 7 | Sheet-Dialog für Screenreader unsichtbar (`aria-hidden` auf Backdrop umschließt `role="dialog"`) | Frontend/A11y | Hoch | S |
| 8 | Heuristische Fehlerkategorisierung per Message-Substring verfälscht Statuscodes (alles mit „invalid" → 400) | Backend | Hoch | S–M |
| 9 | `stats`-Tabelle wächst unbegrenzt; synchrone Voll-Scans (Gist-Backup, Admin-Aggregation) blockieren den Event-Loop — erste Bruchstelle bei 10x Last | DB/Perf | Hoch | M |
| 10 | Keine Test-DB-Isolation: Vitest läuft gegen die echte lokale Dev-DB | Tests | Hoch | S |
| 11 | `query-cache.js` ohne Größenlimit bei nutzergesteuerten Keys (Eigenes Lemma) → Memory-Risiko | DB/Perf | Hoch | S |
| 12 | Kein Lint/Typecheck-Gate (kein ESLint/Prettier/tsc im Repo oder CI) | DevOps | Hoch | M |

**Skalierungsfazit:** Nicht SQLite bricht zuerst, sondern der Event-Loop — synchrone
Voll-Aggregationen (stats, Telemetrie, Gist-Backup) und FTS5-Cache-Misses blockieren bei
Lastspitzen alle Requests inkl. Classroom-Echtzeit. Zweite Grenze ist die bewusste
Single-Prozess-Architektur des Socket-Layers (nur vertikales Wachstum möglich).

---

## 1. Backend-Architektur (`server/`)

### 1a. Architekturüberblick

**Prozessmodell:** Ein einzelner Node-Prozess (PM2 fork, `instances: 1`), bewusst ohne
Cluster — der gesamte Classroom-Realtime-State (Socket-Rooms, Reconnect-Timer, Join-Guard,
Rate-Limiter-Stores) ist modul-lokal. Diese Single-Node-Annahme ist explizit dokumentiert
und wird zur Laufzeit verteidigt (`assertSingleNode()`, `server/realtime/classroomSocket.js:107-133`).

**Schichtung** (sauber dreistufig):

- **HTTP-Layer:** `server/index.js` (278 Zeilen, reines Wiring: Helmet/CORS/CSRF/Body-Limits
  → 8 Router → SPA-Fallback → zentraler `errorHandler`). Router validieren mit Zod
  (`middleware/validate.js`, 452 Zeilen zentrale Schemata) und delegieren.
- **Store-Layer:** `server/store.js` (347 Zeilen, Fassade) delegiert an
  `store-lemmata/-stats/-daily-content/-spezialwochen/-readonly-cache/-belege-cache`.
  Classroom hat einen eigenen Store (`server/classroom/store.js`, 1246 Zeilen) mit
  Prepared-Statement-Block, Normalizern und Geschäftslogik (Session-Lifecycle,
  serverautoritatives Scoring, Retention).
- **DB-Layer:** `server/db.js` — eine better-sqlite3-Verbindung (WAL, busy_timeout 5 s,
  periodischer Passive-Checkpoint), Baseline-Schema + Inline-Migrationen als
  Import-Seiteneffekt, danach `runSqlMigrationsSync()`; JS-Migrationen laufen asynchron im
  Boot-IIFE (`migrate-runner.js`).

**Querschnitt:** Auth dual — better-auth (Cookie/Bearer) für Nutzer, eigene
Admin-Session-Erzeugung in `middleware/auth.js`; Classroom zusätzlich Capability-Grants in
der DB (`requireCapability.js`) plus Participant-HMAC-Tokens. Realtime: Socket.io-Namespace
`/cr2`, HTTP-Routen broadcasten ausschließlich über `notify*`-Helper (saubere Kapselung).
Jobs: 5× `setInterval`-Sweeps (Session-Cleanup, AutoEnd, Classroom-Retention,
Daten-Retention, SQLite-Backup), alle neustart-fest gegen persistierte Timestamps; einziger
node-cron-Job ist der tägliche Push (`notifications/scheduler.js`). `shared/scoring.js` ist
Single Source für Frontend- und Server-Scoring.

**Zirkuläre Abhängigkeiten:** Keine echten Zyklen. Auffällig nur die invertierte Richtung
`config/origins.js → middleware/auth.js` (zieht db+audit in jeden Origins-Import).

### 1b. Stärken

1. **Serverautoritatives Classroom-Design:** Kein `score`-Feld im Submit-Schema
   (`validate.js:415-426`), Whitelist-Serialisierung der Schülersicht
   (`routes/classroom.js:271-354`), Snapshot-Freeze, Idempotenz via UNIQUE+ON CONFLICT
   (`classroom/store.js:242-246, 893-934`). Invarianten testgesichert.
2. **Transaktionsdisziplin:** `db.transaction(...).immediate()` mit korrekter Begründung
   gegen Webhook-Races (`routes/payments.js:252-279`, `routes/iap.js:193-213`);
   TOCTOU-bewusster Join-Code-Retry (`classroom/store.js:386-441`).
3. **Neustart-feste Jobs statt In-Memory-Timern:** AutoEnd/Retention rechnen gegen
   persistierte Timestamps, laufen idempotent und beim Boot nach.
4. **Backup korrekt für WAL:** Online-Backup-API statt `cp`, gzip, Rotation,
   Reentrancy-Guard (`jobs/sqliteBackup.js:45-74`).
5. **Boot-Hygiene:** Root-Start-Verweigerung, Pflicht-Env-Validierung inkl.
   Platzhalter-Erkennung mit hartem Exit in Prod (`config.js:45-73`), Fail-Fast bei
   Migrationsfehlern, Graceful Shutdown mit Force-Exit-Timeout, globale
   `unhandledRejection`/`uncaughtException`-Handler (`index.js:58-64`).
6. **Mehrschichtige Sicherheit:** CSRF via Custom-Header + Content-Type,
   Pre-Flight-Body-Limit vor dem 10-MB-Parser, Timing-sicherer Admin-Login mit Dummy-Hash,
   globaler Join-Brute-Force-Guard, Akteur-basierte Limiter hinter Schul-NAT,
   Apple-JWS-Verifikation mit vollständiger Kettenprüfung, Push-Endpoint-SSRF-Whitelist.
7. **DSGVO-Bewusstsein:** E-Mail-Hashing in Logs, zweistufige Classroom-Retention
   (Anonymisierung 48 h / Hard-Delete 30 d), pseudonyme Telemetrie.

### 1c. Findings

#### Hoch

**B-H1 — PM2-Worker referenziert nicht existierende Datei → Crash-Loop im Deployment.**
`ecosystem.config.cjs:25` startet `server/workers/classroomWorker.js` mit
`autorestart: true` — das Verzeichnis `server/workers/` existiert im Repo nicht. PM2 hält
die App `signifikation-worker` in einer Restart-Schleife (Log-Spam, Restart-Counter,
Alerting-Rauschen). Entweder Worker einchecken oder den App-Block entfernen.

**B-H2 — Origin-Konfiguration doppelt implementiert und auseinandergedriftet.**
`server/auth/index.js:101-112` dupliziert die `ALLOWED_ORIGINS`-Parsing-Logik aus
`server/config/origins.js:3-17`. Konkret gedriftet:
- `auth/index.js:107` nimmt `http://localhost` **auch in Production** in die
  better-auth-`trustedOrigins` auf — genau das, was `config/origins.js:12-14` mit
  Begründung („lokale Schadsoftware + SameSite=None-Cookie") in Prod ausschließt.
- Umgekehrt fehlt `https://localhost` (Capacitor-Android-Scheme) in den
  better-auth-`trustedOrigins` → potenziell scheitern Android-Sign-in-Flows.

Fix: `auth/index.js` importiert `ALLOWED_ORIGINS`/`CAPACITOR_ORIGINS` aus
`config/origins.js` (Single Source) + Paritätstest.

**B-H3 — Heuristische Fehlerkategorisierung kann Statuscodes verfälschen.**
`server/error-handling.js:86-108` mappt per Message-Substring: jede Exception mit „invalid"
im Text wird zum **400 VALIDATION_ERROR**, alles mit „file" zum FILE_IO, alles mit
„sql"/„database" zum DATABASE_ERROR. Ein interner Bug mit „invalid state" in der Message
würde dem Client als Client-Fehler präsentiert und im Monitoring unsichtbar (Warn- statt
Error-Log, `error-handling.js:133-138`). Da Express 5 rejected Promises automatisch hierher
routet, betrifft das alle async-Pfade ohne eigenes try/catch. Fix: Kategorisierung
ausschließlich über `AppError`/Error-Codes (`err.code === 'SQLITE_*'`), Default 500.

#### Mittel

**B-M1 — Parallele, handgebaute Admin-Auth neben better-auth.**
`middleware/auth.js:94-116` (`adminAuth`) schreibt Sessions direkt per SQL in die
better-auth-Tabelle und setzt ein eigenes, unsigniertes Cookie; `requireAuth`
(`auth.js:196-243`) validiert per Raw-Lookup. Umgeht better-auths Cookie-Signing,
`updateAge`-Rotation und `__Secure-`-Prefix-Logik — Drift-Risiko bei better-auth-Upgrades.

**B-M2 — Massive try/catch-Duplikation im Classroom-Router.**
`routes/classroom.js` enthält 27 identische `try { … } catch { logger.error; 500 }`-Blöcke
plus 22× das `if (result.error) { mapError… }`-Muster. Express 5 leitet Rejections ohnehin
an den zentralen `errorHandler`; ein `handleStoreResult(res, result)`-Helper würde ~200
Zeilen sparen (Datei hat 1311 Zeilen).

**B-M3 — Memory-Leak im Socket-Connect-Rate-Limit.**
`realtime/classroomSocket.js:103, 135-146`: `connectAttempts` (Map pro IP) wird nie geprunt
— wächst über Wochen mit jeder je gesehenen IP. Vergleich: `rateLimiter.js:6-27`
(CleanupStore) macht es richtig.

**B-M4 — Wortprofil-Startup-Timeout ist wirkungslos.**
`index.js:210-218` wrappt `ensureWortprofilDb()` in `Promise.race` mit 130-s-Timeout — aber
`init-wortprofil.js:41, 50` nutzt `execSync` (curl/gunzip), das den Event-Loop blockiert;
der Timeout-Timer kann nicht feuern. `gunzip` einer 2-GB-Datei ist unbegrenzt blockierend.
Zudem hartkodierte `/app/...`-Pfade (Railway-Altlast, Z. 6-7).

**B-M5 — Fehler werden als 200-Erfolg maskiert (REST-Inkonsistenz).**
- `routes/public.js:150-156`: Wirft `fetchBelege`, antwortet der Server `200` mit `[]` —
  Clients und Monitoring können Defekt nicht von Leere unterscheiden.
- `routes/public.js:216-219` (`/archiv`): jeder Fehler → 200 mit leerer Liste; sogar der
  Path-Traversal-Block (Z. 208-211) liefert 200.
- Drei Antwortformate im Umlauf: `{ error }`, `{ error, code, details? }`, nackte Arrays.

**B-M6 — Beobachtbarkeitslücken trotz vorhandener Bausteine.**
- Correlation-ID wird gesetzt (`index.js:125-128`), aber außer im `errorHandler` nirgends
  geloggt; kein Request-Logging (pino-http fehlt).
- `alerting.js` prüft nur Event-Loop-Lag; Backup-Fehler (`sqliteBackup.js:93-95`),
  Push-Job-Fehler, 5xx-Raten sind nicht alarmiert. Ohne `ALERT_WEBHOOK_URL` komplett aus.
- `metrics.js` misst nur Lag; keine Request-/DB-Metriken.

**B-M7 — Täglicher Push ohne Catch-up.**
`notifications/scheduler.js:31` (`cron 0 8 * * *`): Ist der Prozess um 08:00 down
(Deploy/Crash), entfällt der Tages-Push stillschweigend — im Gegensatz zu allen Sweep-Jobs,
die beim Boot nachholen. Kein persistierter „last sent"-Marker.

**B-M8 — Admin-Router-Wiring mit extremer DI-Boilerplate.**
`routes/admin.js:62-242`: Jeder Sub-Router bekommt 15-30 Abhängigkeiten explizit injiziert
(z. B. `createAdminCalendarRouter` mit ~30 Parametern). Jede neue Store-Funktion erfordert
Änderungen an drei Stellen. Direktimporte + `vi.mock` wären wartbarer.

**B-M9 — Account-Löschung nicht atomar.**
`routes/account.js:172-188`: `deleteUserTx(userId)` ist transaktional, aber die
anschließenden `DELETE FROM session/account` (Z. 178-179) laufen außerhalb. Der Kommentar
in Z. 177 widerspricht dem Schema (FK `ON DELETE CASCADE` existiert in `db.js:72, 89`) —
durch die aktiven Cascades sind die manuellen Deletes sogar redundant.

**B-M10 — CORS-Ablehnung wird zum 500.**
`index.js:98-101` und Socket-CORS (`index.js:241-244`): `cb(new Error('CORS: …'))` landet
im errorHandler als `500 INTERNAL_ERROR` statt 403 — verfälscht Fehlerraten durch
Bot-Traffic.

#### Niedrig

- **B-N1 — Drei parallele Migrationsmechanismen** (Inline-`hasColumn` in `db.js:290-536`,
  `migrate-sync.js`, `migrate-runner.js`); Schema-Wahrheit auf drei Orte verteilt. Dazu
  String-Interpolation von `year` in SQL (`db.js:376, 390, 404, 418` — ungefährlich, aber
  Anti-Pattern). → Details in Abschnitt 4 (DB-M3).
- **B-N2 — Legacy-Datei-API im Store:** `store.js:200-223` stringly-typed Dispatcher über
  Pseudo-Dateinamen (`'lemmata.json'`).
- **B-N3 — ReadOnly-Cache liefert geteilte Referenzen:** `store-readonly-cache.js:4-8` —
  eine versehentliche Mutation vergiftet den Cache für 5 Minuten.
- **B-N4 — `/health` nimmt bei jedem Probe einen Write-Lock** (`routes/public.js:37`,
  `BEGIN IMMEDIATE; ROLLBACK;`) — unnötige Contention mit echten Writes.
- **B-N5 — Toter Code:** `notifyStudentKicked` nie aufgerufen
  (`realtime/classroomSocket.js:538-541`); Status `'aborted'` wird nirgends erzeugt, aber an
  ≥4 Stellen defensiv behandelt.
- **B-N6 — Zod-v3-Kompat-Import bei installiertem zod@4** (`validate.js:1`, `public.js:9`,
  `payments.js:2`, `push.js:10`).
- **B-N7 — `validate()` entfernt unbekannte Query-Keys nicht** (`validate.js:18`,
  `Object.assign` statt Ersetzen).
- **B-N8 — Shutdown ohne `db.close()`** (`index.js:263-272`).
- **B-N9 — IAP-Sandbox-Default an** (`routes/iap.js:37`) — als Security-Finding S-H1
  ausführlich in Abschnitt 3.

---

## 2. Frontend (`src/`)

### 2a. Architekturüberblick

**Stack:** React 18 + Vite 6, Vanilla CSS (Token-basiert), PWA via `vite-plugin-pwa`
(injectManifest/Workbox), Capacitor 8 (iOS/Android), kein Router-Framework, keine
State-Library.

- **Einstieg:** `index.html` (inkl. zweier Inline-Bootstrap-Skripte: Remote-Debug-Logger +
  Safety-Net) → `src/main.jsx` (CSRF-Fetch-Patch, Native-Token-Bootstrap,
  Asset-Fail-Recovery) → `src/App.jsx` (nur 106 Zeilen).
- **Routing:** Mini-Pfad-Router nur für Classroom (`src/components/classroom/routing.js`,
  `/c` und `/c/:code`); der Rest läuft über einen Tab-/Phasen-Zustandsautomaten (`phase`:
  home → selection → quiz → results, plus Sekundärspiele, `custom-play`, `sw-*`).
- **Zustand:** Orchestrator-Hook `src/hooks/useAppModel.js` (231 Z.) komponiert ~10
  Spezial-Hooks. Kein Context für Spiel-/Tagesdaten — alles wird als Props durchgereicht.
  Einziger Context: `ThemeContext`.
- **Persistente Tabs:** Konto- und Lehrer-Klassenraum-Tab werden einmal gemountet und per
  `display:none` versteckt (Sockets/Formular-State überleben Tab-Wechsel).
- **API-Schicht:** vier parallele Wege — `utils/apiFetch.js` (Native-Bearer aus Keychain),
  `utils/fetchWithRetry.js` + `hooks/useApiResource.js`, nackte `fetch()`-Aufrufe,
  `classroom/student/kioskFetch.js` (Participant-Token, eigene Fehlerklasse).
- **Bundle:** `manualChunks` (react-vendor/realtime-vendor/vendor), Lazy-Imports für
  Quiz/Results, alle drei Sekundärspiele, Konto, Classroom; `socket.io-client`,
  `@capacitor/*` und `@dnd-kit` dynamisch geladen.
- **CSS:** 8 Feature-Dateien (~6.7k Zeilen), zentrale Tokens + Dark Mode über
  `[data-theme="dark"]`; `dictionary.css` (2329 Z.) trägt das Wörterbuch-Designsystem.

### 2b. Stärken

1. **Disziplinierte Dekomposition:** `App.jsx` 106 Zeilen, größte Komponente `Home.jsx`
   576 Zeilen — keine Monolithen. Classroom sauber in steps/hooks/states/games gegliedert.
2. **Bundle-Hygiene:** Lazy-Loading mit dokumentierter Begründung (Kommentare nennen sogar
   KB-Zahlen), Vendor-Splitting, bewusster Verzicht auf react-router.
3. **Robustheit Native:** dreistufiges Bootstrap-Sicherheitsnetz, Keychain-Token mit
   dokumentierter Thenable-Falle (`apiFetch.js:25-37`).
4. **Offline-Konzept:** `heuteCache`-Fallback mit Datums-Validierung, Workbox NetworkFirst
   mit 3s-Timeout und begründeter Strategiewahl (`sw.js:32-44`).
5. **A11y-Aufwand sichtbar:** Skip-Link, `sr-only`-Live-Regionen, Fokus-Trap im Sheet,
   `inert`-Verwaltung der Snap-Cards, ausführliche `prefers-reduced-motion`-Behandlung,
   44px-Touchtargets.
6. **Saubere Sicherheits-Patterns:** globaler CSRF-Header-Wrapper mit Origin-Allowlist,
   bewusste Trennung von User-Bearer und Participant-Token.

### 2c. Findings

#### Hoch

**F-H1 — Rules-of-Hooks-Verstoß in Quiz.jsx** — `src/components/Quiz.jsx:77-96`.
Early-Return `if (shouldSkip) return null` (Z. 81) steht **vor** den Joker-Hooks `useState`
(Z. 86-88) und `useEffect` (Z. 91). Wechselt `kollokatoren` zwischen Renders von leer →
befüllt, ändert sich die Hook-Anzahl → React-Crash („Rendered more hooks…"). Funktioniert
heute nur, weil `lemma` pro Mount stabil ist; das ESLint-Disable in Z. 79 kaschiert das.

**F-H2 — SW-Update-Verhalten: `skipWaiting`/`clientsClaim` fehlen** — `src/sw.js`,
`vite.config.js:55-57`. `registerType: 'autoUpdate'` ist gesetzt, aber bei
`strategies: 'injectManifest'` muss das eigene SW-Skript `self.skipWaiting()` +
`clientsClaim()` selbst aufrufen — beides fehlt. Der neue SW bleibt im *waiting*-State, bis
alle Tabs geschlossen sind; bis dahin liefert der Precache die alte App-Version. In
Kombination mit StaleWhileRevalidate auf `/assets/*.js` (`sw.js:11-19`) steigt das Risiko
gemischter Versionen — genau das Szenario, das der Kommentar in `vite.config.js:61-64`
vermeiden will. Die Asset-Fail-Recovery in `main.jsx:73-89` ist nur ein Pflaster.

**F-H3 — Dialog für Screenreader unsichtbar** — `src/components/ui/Sheet.jsx:206-211`.
Das Backdrop-`<div>` trägt `aria-hidden="true"` und **umschließt** das Panel mit
`role="dialog" aria-modal="true"`. `aria-hidden` auf dem Vorfahren versteckt den kompletten
Dialog (Belege, Info-Sheet, Share-Sheet) vor assistiven Technologien.

**F-H4 — SW-Registrierung landet auch im Native-Build** — `vite.config.js:52-104`,
`main.jsx:19-28`. Kein `virtual:pwa-register`-Import; vite-plugin-pwa injiziert bei
`injectRegister: 'auto'` daher `registerSW.js` direkt in die gebaute `index.html`. Dieselbe
`dist/` wird per `cap sync` in die Native-App kopiert. Unter `capacitor://` schlägt
`serviceWorker.register()` fehl und produziert eine Unhandled Rejection.

#### Mittel

**F-M1 — Massives Prop-Drilling statt Context** — `src/hooks/useGameScreenProps.js` (104 Z.
reines Prop-Mapping), `src/components/AppGameScreens.jsx:20-86` (~65 Props),
`src/components/Home.jsx:17-27` (~20 Props). Jede neue Spielvariante multipliziert Props in
4-5 Dateien. Ein `DailyContentContext`/`GameActionsContext` würde die Plumbing-Dateien fast
vollständig eliminieren.

**F-M2 — Keine Memoisierung; Komponenten-Aufruf als Funktion** —
`src/hooks/useAppTabScreens.js:40-80`. `AppTabScreens({...})` wird als normale Funktion
aufgerufen und erzeugt bei **jedem** Render neue `<Home>`/`<KursTab>`-Elemente; dazu
`{ play: () => … }`-Objektliterale ohne `useCallback`. Im gesamten `src/` gibt es kein
einziges `React.memo`. Jeder State-Tick rendert die komplette Home-Seite inkl.
`computeStreak()`-localStorage-Scan (`Home.jsx:49`) neu.

**F-M3 — Re-Render pro Touchmove beim Swipen** — `src/components/Zeitenwende.jsx:226-237,
276-286, 312-320`. `setDragX` feuert bei jedem `touchmove` → kompletter Re-Render pro
Frame. Auf Low-End-Android (Classroom-Zielgruppe!) Jank-Risiko; Transform per Ref direkt
aufs DOM wäre framestabil.

**F-M4 — API-Layer fragmentiert, Auth/Retry inkonsistent.**
- `useApiResource` nutzt `fetchWithRetry` **ohne** `apiFetch` → Tagescontent-Requests
  laufen nativ ohne Bearer (bricht still, sobald ein Endpoint auth-pflichtig wird).
- Rohe `fetch()` ohne Retry/Fehlernormalisierung: `Results.jsx:56`,
  `WortZwilling.jsx:199-205`, `useBelege.js:58`, `Zeitenwende.jsx:152`, `api/stats.js:18`,
  `useKontoAuth.js:187`.
- Fehlerbehandlung dreifach implementiert (`KioskApiError`, `translateAuthError`, ad-hoc
  `parseResponse`).

**F-M5 — Push-Subscribe hardcodiert iOS** — `src/hooks/usePushNotifications.js:149`.
`platform: 'ios', apns_token: token.value` — der Hook ist aber für alle Native-Plattformen
aktiv. Ein Android-Gerät würde sein FCM-Token als APNs-Token registrieren. Zudem erzwingt
der Tap-Handler `window.location.href = '/'` (Z. 89) einen vollständigen WebView-Reload.

**F-M6 — `useKontoAuth.js` als 589-Zeilen-God-Hook.** 23 useState/Callbacks, ~40
Rückgabefelder. Fehlerübersetzung per String-Matching auf englische Servermeldungen
(Z. 73-112) ist fragil gegenüber better-auth-Updates.

**F-M7 — Duplizierter Erklärtext „Was ist eine Kollokation?"** — `Home.jsx:415-439` vs.
`521-544`, wortgleich zweimal im JSX.

**F-M8 — Kein `navigateFallback` im SW** — `src/sw.js:6`. Navigationen zu `/c/:code`
(Schüler-Kiosk) haben keine Offline-Antwort — Reload der Kiosk-URL offline führt zum
Browserfehler statt zur App-Shell (relevant bei instabilem Schul-WLAN).

**F-M9 — Debug-Logger postet in Produktion bei jedem Seitenaufruf** — `index.html:64-113`,
`main.jsx:3-5, 15-17, 95-118`. Jeder Boot sendet mehrere Info-POSTs an
`/api/v1/debug/log` — für alle Nutzer, dauerhaft. Log-Volumen + Extra-Request im kritischen
Startpfad.

#### Niedrig

- **F-N1** `Lueckenfueller.jsx:62` — tote Variable `scoreA`.
- **F-N2** `Quiz.jsx:247` — Label-Seed nutzt `toISOString()` (UTC) statt des sonst
  verwendeten Lokaldatums; um Mitternacht ±2h inkonsistent.
- **F-N3** `Zeitenwende.jsx:22` — `definitionen`-Prop wird übergeben, nie gerendert.
- **F-N4** `App.jsx:92` / `useTheme.js:52` — Theme-Context-Value nicht memoisiert.
- **F-N5** `vite.config.js:65` — `maximumFileSizeToCacheInBytes: 512 KB`: Überschreitung
  fällt **stillschweigend** aus dem Precache; kein Build-Guard.
- **F-N6** `api/stats.js:17-23` — Spielergebnisse gehen offline verloren (kein Queue);
  nativ ohne Bearer, d.h. Stats dort nie dem Konto zuordenbar.
- **F-N7** Breakpoint-Zoo: 699px dreifach hardcodiert in CSS **und** JS
  (`useActiveSnapCard.js:7`, `Home.jsx:91`, `dictionary.css`), dazu 499/768/1024px.
- **F-N8** `WortZwilling.jsx:26-51` — `DraggableChip` als `div role="button"` statt echtem
  `<button>`.
- **F-N9** Kontrast: `--muted` AA-konform (knapp); `--disabled: #b8b0a0` unter AA (nur
  deaktivierte Elemente, exempt).
- **F-N10** `public/logo.png` (212 KB) nirgends referenziert — Altlast.

---

## 3. Security

### 3a. Posture-Überblick

Überdurchschnittlich reifer Sicherheitsstand mit sichtbaren Spuren mehrerer
vorangegangener Reviews. Durchgängige Prepared Statements, Zod-Validierung an praktisch
allen Eingängen, server-autoritatives Scoring, saubere Payment-Webhook-Verifikation,
bewusste Datenschutz-Architektur. **Keine kritischen Schwachstellen gefunden.** Die
Findings sind überwiegend Konfigurations-/Defense-in-Depth-Themen.

### 3b. Bereits gut gelöst

- **SQL-Injection:** Durchgängig Prepared Statements. Die zwei String-Interpolationen
  (`routes/classroom.js:424`, `db.js:285` PRAGMA) verwenden ausschließlich statische,
  code-interne Templates.
- **Mollie:** IP-Whitelist (Prod) + serverseitige Re-Verifikation via `payments.get` +
  Betrags-/Währungs-Prüfung gegen `VALID_PRICES` + Idempotenz über
  `BEGIN IMMEDIATE`-Transaktion. `userId` stammt aus selbst gesetzten Metadaten.
- **Apple IAP:** Vollständige manuelle JWS/ES256-Verifikation — Root-CA-Fingerprint-Pinning,
  CA-Flags, Kettensignatur, `bundleId`/`productId`/`environment`-Checks, Account-Binding
  via `appAccountToken` (UUIDv5).
- **Auth/Authz:** httpOnly/secure/SameSite-Cookies; Constant-Time-bcrypt mit Dummy-Hash
  gegen User-Enumeration; Dev-Header-Backdoor doppelt gegated; Rollen-Eskalation per API
  unmöglich (`admin` nur via Script).
- **Classroom-Token:** ≈256 Bit Entropie, at-rest HMAC-SHA256-gehasht
  (`CLASSROOM_JOIN_SECRET` in Prod erzwungen). Whitelist-View verhindert Lösungs-Leak.
- **XSS:** React escaped per Default; `dangerouslySetInnerHTML` nur für
  Library-generiertes QR-SVG; `admin.js` nutzt durchgängig `esc()`.
- **Pfad-Traversal:** `routes/public.js:204-211` normalisiert und prüft Präfix korrekt.
- **Header/DoS:** Striktes CSP (`scriptSrc 'self'`, `frameAncestors 'none'`), separater
  Admin-CSP, `X-Robots-Tag`, globales `express.json({limit:'16kb'})`, Graceful Shutdown,
  Root-Start-Verweigerung.

### 3c. Findings

#### Hoch

**S-H1 — IAP-Sandbox standardmäßig aktiv (Konfigurationsrisiko nach Launch).**
`server/routes/iap.js:37`: `ALLOW_SANDBOX = process.env.IAP_ALLOW_SANDBOX !== '0'`
(Default: **an**). Nach App-Store-Launch sind Sandbox-JWS echte, valide Apple-Signaturen —
jeder mit Sandbox-/TestFlight-Account kann die Gesamtausgabe **kostenlos** freischalten,
solange das Flag nicht auf `0` steht. *Fix:* Default invertieren (`=== '1'`), Prod-Warnung
beim Boot, Deploy-Checkliste/CI-Guard.

**S-H2 — IAP-Legacy-Pfad ohne `appAccountToken` erlaubt JWS-Replay über Accounts.**
`server/routes/iap.js:184-189`: Transaktionen ohne `appAccountToken` werden akzeptiert
(nur Warn-Log). Ein geteiltes/abgefangenes Legacy-JWS kann von einem **anderen** Account
bei `/iap/verify` bzw. `/iap/restore` eingelöst werden — das Account-Binding greift nur,
wenn ein Token vorhanden ist. Idempotenz schützt nur denselben `transactionId`, nicht die
Account-Zuordnung. *Fix:* Nach Migration der Legacy-Käuferbasis fehlendes Token ablehnen
(Feature-Flag `IAP_REQUIRE_ACCOUNT_TOKEN=1`); bis dahin Legacy-Einlösungen global auf
1×/`originalTransactionId` begrenzen.

#### Mittel

**S-M1 — Globaler Join-Guard als Availability-/DoS-Vektor.**
`server/classroom/join-guard.js` (MAX_FAILURES=40 / 10 min, **global**): 40 falsche Codes
sind trivial verteilt zu senden und blockieren dann den Beitritt für eine reale
Schulklasse. *Fix:* Guard pro Session/Code statt global; Alerting-Hook bei
Guard-Aktivierung; ggf. Allowlist für bereits beigetretene IPs.

**S-M2 — `isAllowedOrigin` erlaubt leere Origin.**
`server/config/origins.js:20` (`!origin || …`), genutzt für CORS **und** Socket.io-CORS.
Für Browser-CSRF nicht ausnutzbar (CSRF-Header + SameSite greifen), weicht aber den
Origin-Check für Nicht-Browser-Clients vollständig auf. Als bewusste Entscheidung für
Capacitor-Clients akzeptabel — sollte explizit dokumentiert werden.

**S-M3 — Pino ohne globale `redact`-Konfiguration.**
`server/logger.js` setzt keine `redact`-Pfade; `sanitize()` in `middleware/auth.js:31`
deckt nur einzelne catch-Blöcke ab. Latentes Risiko, dass künftige Header-Logs
`authorization`/`cookie` im Klartext schreiben. *Fix:* globale Redact-Liste
(`req.headers.authorization`, `req.headers.cookie`, `*.password`, `*.token`, `*.secret`).

#### Niedrig

- **S-N1 — Race Condition bei Custom-Lemma-Quota:** `routes/custom-lemma.js:56-72` liest
  `getQuota` und inkrementiert erst nach `buildCustomPlay` — zwei parallele Requests bei
  `remaining=1` ergeben 1 Gratis-Spiel zu viel. Fix: atomar zählen+prüfen
  (`WHERE count < allowance` oder `BEGIN IMMEDIATE`).
- **S-N2 — Mollie-Webhook loggt `req.body` bei Reject** (`payments.js:191`) — unkritisch,
  ggf. auf `req.body.id` reduzieren.
- **S-N3 — Admin-Login an better-auth vorbei** (siehe B-M1) — funktioniert, erhöht aber
  die Pflege-Kopplung an das better-auth-Schema.

### 3d. Härtungsvorschläge

1. IAP-Defaults invertieren (S-H1) + CI-Guard für Prod-Env.
2. Legacy-IAP auslaufen lassen, `appAccountToken` verpflichtend (S-H2).
3. Pino-`redact` global setzen (S-M3) — billigste Defense-in-Depth.
4. Join-Guard pro Code/Session + Alerting (S-M1).
5. Quota atomar (S-N1).
6. **Secret-Stärke-Validierung beim Start:** `BETTER_AUTH_SECRET`/`CLASSROOM_JOIN_SECRET`
   auf Mindestlänge prüfen (aktuell nur „gesetzt?"); `.env.example`-Platzhalter dürfen
   nicht in Prod landen.
7. **Rate-Limit für Passwort-Reset**, falls `PASSWORD_RESET_DELIVERY=webhook` aktiviert
   wird.
8. **Socket.io-Rate-Limit hinter nginx prüfen:** `connectRateLimit` keyt auf
   `socket.handshake.address` (`classroomSocket.js:268`) — hinter nginx ggf. die Proxy-IP →
   Limit kollabiert effektiv auf eine einzige IP. `X-Forwarded-For`-Behandlung verifizieren.

---

## 4. Datenbank & Performance

### 4a. Überblick Datenarchitektur

| DB | Verbindung | Inhalt |
|---|---|---|
| `signifikation.db` (`db.js:27`) | 1 Schreibverbindung, WAL, `synchronous=NORMAL`, `busy_timeout=5000`, FK ON, 16 MB Cache, stündlicher PASSIVE-Checkpoint | Auth, Spielinhalte, Stats, Payments, Push, Audit-Log, Classroom (8 Tabellen), Telemetrie |
| `wortprofil.db` (`wortprofil.js:48`) | readonly, lazy, 64 MB Cache, 512 MB mmap | Kollokationen/Zeitreise (reproduzierbar aus Korpus-Pipeline) |
| `belege.db` (`belege.js:29`) | readonly, lazy, 128 MB Cache | FTS5-Belegsätze |

**Schema-Evolution zweigleisig:** Baseline + Ad-hoc-Migrationen inline in `db.js`
(Z. 284-536), danach versionierte Migrationen `0001–0012` über zwei Runner
(`migrate-sync.js` synchron, `migrate-runner.js` async). Tracking via `_schema_migrations`.

**Caching-Schichten:** ReadOnly-Cache (5 min TTL), Lemmata-Index (Map, invalidierungsbasiert),
Stats-Window-Cache (Single-Slot, 30 s), Beleg-Cache (6 h TTL, 2000 Einträge), Query-Cache
für Wortprofil (1 h TTL, **unbegrenzt**).

### 4b. Stärken

1. **SQLite-Pragmas vorbildlich** (`db.js:28-50`), jeweils mit begründetem Kommentar.
2. **Konsequentes Statement-Caching auf Modul-Ebene** — die kürzliche Nachrüstung ist fast
   überall konsistent umgesetzt.
3. **Transaktionen bei Multi-Step-Writes:** `submitAnswer` (Submission+Score+Activity-Touch
   atomar), `joinByCode` (Count-Check + Insert + Grants atomar), `saveTagAtomically`.
4. **Durchdachte Indizes:** partielle Unique-Indizes (aktiver Join-Code, aktive Grants),
   Sweep-Indizes nur über relevante Teilmengen; Migration 0012 entfernt sogar redundante
   Indizes — seltene Qualität.
5. **N+1 aktiv vermieden:** Dashboard ≤3 Queries mit JOIN, Session-Results 2 Reads + 1
   JS-Pass, `LIMIT 1 OFFSET` im Submit-Hotpath.
6. **Backup technisch korrekt:** `db.backup()` Online-API (WAL-konsistent), gzip, Rotation.
7. **Retention neustart-fest und idempotent.**
8. **Idempotenz-Konstrukte:** UNIQUE + ON CONFLICT DO NOTHING mit Re-Read, bounded Retry.

### 4c. Findings

#### Hoch

**D-H1 — Unbegrenztes Wachstum der `stats`-Tabelle + synchrone Voll-Scans.**
`stats` wächst eine Zeile pro User×Spiel×Tag ohne Retention. `loadStatsRows()`
(`store-stats.js:256`) liest die **gesamte** Tabelle bei jedem Gist-Backup (`store.js:274`,
`backup.js:35`) und Admin-Export; `loadStats(400)` aggregiert 400 Tage per GROUP BY +
JSON-Parsing pro Zeile in JS. better-sqlite3 ist synchron → blockiert den Event-Loop für
**alle** Requests inkl. Classroom-Submissions und Socket-Handshakes. Problem ist erkannt
(Kommentar Z. 246-250), aber bei 10x Nutzern die erste Bruchstelle.

**D-H2 — `query-cache.js` ohne Größenlimit bei nutzergesteuerten Keys**
(`query-cache.js:9-10, 38`). Keys `rel:<lemma>:<pos>:<relCode>` entstehen über das
„Eigenes Lemma"-Feature aus User-Input. Innerhalb der 1-h-TTL (Cleanup nur alle 10 min)
kann der Cache unbegrenzt wachsen; Premium-Accounts sind unlimitiert. Memory-Risiko.

#### Mittel

**D-M1 — JS-Migrationen: Marker-Insert nicht atomar mit der Migration**
(`migrate-runner.js:85-89`). Der Kommentar behauptet Atomarität — der Code tut es nicht:
`await mod.default(db)` läuft, danach separat `markApplied.run(...)`. Crash dazwischen ⇒
Migration läuft beim nächsten Boot erneut. SQL-Migrationen sind dagegen korrekt gewrappt
(`migrate-sync.js:66-70`).

**D-M2 — `saveDailyContentMaps` nicht atomar über drei Tabellen + Lost-Update-Race**
(`store.js:225-240`, `routes/admin-calendar.js:90-120`). Drei separate Replace-Läufe; wirft
Nr. 2, ist Kalender bereits ersetzt. Zusätzlich Read-Modify-Write über die vollständigen
Maps: zwei parallele Admin-Requests überschreiben sich gegenseitig, ein Ein-Tages-Edit
schreibt die komplette Tabelle neu (Write-Amplification). `saveTagAtomically` zeigt das
richtige Muster — wird nicht überall genutzt.

**D-M3 — Schema-Definition dreigeteilt: Drift-Risiko** (`db.js:52-536` vs. `migrations/`
vs. zwei Runner). Migration 0012 musste explizit daran erinnern, dass CREATE-INDEX auch in
`db.js` entfernt werden muss — dieser Doppelpflege-Fehler ist vorprogrammiert. Die
MM-DD→YYYY-Migration (`db.js:368-424`) läuft zudem bei jedem Boot und würde Alt-Keys das
*aktuelle* Jahr zuweisen — über Jahresgrenzen falsch.

**D-M4 — Backup-/Restore-Pfad asymmetrisch und ungetestet.**
Voll-Backup per Default auf demselben Volume; Gist-Restore deckt **nur Spieldaten** ab —
für user/account/payments/classroom existiert kein dokumentierter Restore-Pfad. Kein
automatisierter Restore-Test. Außerdem wandern `stats-rows` inkl. `user_id` in den Gist
(pseudonyme User-IDs zu GitHub — Datenschutz-Randnotiz).

**D-M5 — `statsWindowCache` invalidiert bei jedem `recordStat`**
(`store-stats.js:243, 268-278`). Single-Slot-Cache, bei jedem Spielzug komplett
invalidiert — unter Last fällt das Admin-Summary praktisch immer auf die volle
400-Tage-Aggregation zurück (verschärft D-H1).

#### Niedrig

- **D-N1 — Rohes `BEGIN;…COMMIT;` mit `ROLLBACK` im catch** (`db.js:441-469, 480-507`):
  kann „no transaction is active" werfen und den Originalfehler maskieren.
- **D-N2 — Redundanter Index `idx_user_email`** (`db.js:226`): `email TEXT UNIQUE` erzeugt
  bereits einen impliziten Unique-Index.
- **D-N3 — `connectAttempts`-Map wächst unbegrenzt** (= B-M3).
- **D-N4 — Beleg-Cache: FIFO statt LRU** (`store-belege-cache.js:23-26`): `get()` refresht
  nicht; Kommentar-Label „LRU" (`store.js:322`) stimmt nicht.
- **D-N5 — FK-Cascade-Scans ohne Index:** `classroom_participant_state.assignment_id` ohne
  Index; `classroom_telemetry`-Delete ohne ts-Index = täglicher Full Scan (bewusst
  akzeptiert, durch Retention gedeckelt).
- **D-N6 — `loadReadOnly` liefert geteilte, mutierbare Referenzen** (= B-N3); Doc-Kommentar
  verspricht „frisches Objekt".
- **D-N7 — Kleinkram:** `session-cleanup.js:10-14` prepared pro Lauf neu; manuelle Deletes
  in `account.js` durch `ON DELETE CASCADE` redundant, Kommentar veraltet (= B-M9);
  Cache-Intervalle nicht `unref()`'d.

### 4d. Skalierungsfazit

Was zuerst bricht, ist nicht SQLite (WAL + Single-Writer + Indizes tragen 10x problemlos),
sondern der **Event-Loop**: synchrone Voll-Aggregationen und FTS5-Cache-Misses blockieren
bei Lastspitzen alle Requests inkl. Classroom-Echtzeit. Zweite harte Grenze: die
dokumentierte Single-Prozess-Architektur des Socket-Layers (kein Redis-Adapter) — bewusste
Entscheidung, aber damit nur vertikales Wachstum. Bei weiterem Wachstum: schwere
Aggregationen in `worker_threads` mit eigener readonly-Connection auslagern.

---

## 5. Tests, CI/CD & Betrieb

### 5a. Testlauf (im Rahmen dieser Analyse durchgeführt)

`npm ci` + `npm run test`: **53 Testdateien, 676 Tests, 676 bestanden, 0 Failures,
Dauer 33,9 s.** Migrationen liefen idempotent durch.

### 5b. Ist-Zustand

- **Server-Integrationstests** (20 Dateien): Classroom sehr breit (routes 1418 Z., store
  1128 Z., socket, scoring, telemetry, join-code/-guard, capability), Payments (Mollie),
  IAP (Apple), Account, Admin, Public-API, Custom-Lemma + Quota, Data-Retention, Backup.
- **Frontend:** 17 `.test.jsx`-Komponententests plus Hooks und Utils (Achtung: ein Glob nur
  auf `*.test.js` übersieht die `.test.jsx`-Dateien).
- **E2E:** 5 Playwright-Specs (Admin-Login, Audit-Filter, Preview, Users-Bulk,
  Spielmodi-Smoke) — **läuft nicht in CI**.
- **CI:** `verify.yml` (Push main + PRs): `npm ci` → Vitest + Build → ausgefeilter
  Server-Start-Smoke (frische DB, `/health`, `/api/v1/heute`, Auth-Endpoint) →
  dist-Artefakt. `deploy.yml`: deployt das **verifizierte CI-Artefakt** per SSH mit
  Concurrency-Gruppe, WAL-Checkpoint + DB-Pre-Deploy-Snapshot, `pm2 startOrRestart`,
  lokalem + externem Healthcheck und **automatischem Rollback** (Code, dist, DB) — inkl.
  Lessons-Learned aus dem Push-Outage 2026-05-26 (Phantom-PM2-Check,
  APNs-Key-Permission-Check). `ios-testflight.yml`: manueller iOS-Build.
- **Betrieb:** PM2 `instances: 1, fork` mit dokumentierter Begründung; Alerting nur
  Event-Loop-Lag; tägliches SQLite-Backup + Deploy-Snapshots + Legacy-Gist-Backup;
  nginx-Beispielconf in `ops/`; Loadtest (50 simulierte Schüler) in `scripts/`.

### 5c. Stärken

1. **Deploy-Pipeline überdurchschnittlich robust:** Artefakt-Promotion, DB-Snapshot vor
   Migrationen, automatischer Rollback inkl. DB, Post-Deploy-Sanity-Checks aus echten
   Incidents abgeleitet.
2. **Kritische Geldpfade getestet:** Mollie-Webhook (Freischaltung, Idempotenz, gefälschte
   Payment-ID) und Apple IAP mit echten Integrationstests über HTTP + DB-Assertions.
3. **Classroom (komplexester Bereich) am dichtesten getestet.**
4. **676 grüne Tests in 34 s** — schnelle, deterministische Suite.
5. PM2-Konfiguration und ADRs dokumentieren die SQLite/Fork-Constraints explizit.

### 5d. Findings

#### Hoch

**T-H1 — Keine Test-DB-Isolation.** Vitest läuft gegen die echte lokale
`server/data/signifikation.db` (`server/db.js:23`, bestätigt in
`classroom.store.test.js:1020`); Isolation nur über zufällige IDs + manuelles Cleanup. Ein
abgebrochener Lauf hinterlässt Test-User/Payments in der Dev-DB; Flakiness-Risiko bei
parallel laufendem Dev-Server.

**T-H2 — E2E läuft nicht in CI und ist lokal nicht reproduzierbar.** Kein Global-Setup,
das den Admin-Account (`e2e/helpers/admin.js`) oder Seeds anlegt — frischer Checkout →
`npm run test:e2e` schlägt am Login fehl. Die Audit-Filter-Spec hat einen
daten-abhängigen Early-Return (testet bei leerer DB faktisch nichts).

**T-H3 — better-auth-Integration selbst ungetestet.** Alle Server-Tests umgehen Auth via
`x-dev-user-id`-Header (`ALLOW_DEV_AUTH=1`). Session-Erzeugung, Cookie-Handling,
Apple-Sign-in, Password-Reset nur durch den CI-Smoke (401-Check) abgedeckt.

**T-H4 — Kein Lint/Typecheck-Gate.** Weder ESLint noch Prettier noch tsc in `package.json`
oder CI; nur `src/globals.d.ts`. Keine statische Absicherung — hätte z. B. den
Rules-of-Hooks-Verstoß F-H1 automatisch gefunden.

#### Mittel

- **T-M1 — Ungetestete Server-Bereiche:** `server/notifications/` (Push-Scheduler, APNs —
  Quelle des Mai-Outage!), `routes/push.js`, `admin-push.js`, `mailer.js` (nur gemockt),
  `backup.js` (Gist), `audit.js`, Migrationen 0001-0012 (keine Schema-Assertions außer
  Stats-Migration).
- **T-M2 — Keine Coverage-Schwellen:** v8-Coverage konfiguriert, aber ohne `thresholds`;
  läuft nicht in CI.
- **T-M3 — PM2 ohne Log-Rotation und `max_memory_restart`:** keine
  `error_file`/`out_file`-Konfiguration; `pm2-logrotate` nirgends dokumentiert → Logs
  wachsen unbegrenzt.
- **T-M4 — README-Drift:** verweist auf nicht existierende `OPS.md` (Z. 205) und
  `ADMIN_API.md` (Z. 195); Loadtest liegt in `scripts/`, nicht `ops/`; **Vite-Proxy zeigt
  auf Port 3000** (`vite.config.js:108`), Backend läuft laut README/.env auf 3001 —
  Dev-Setup nach README funktioniert so nicht ohne PORT-Anpassung.
- **T-M5 — Android-Versionierung statisch:** `android/app/build.gradle` auf
  `versionCode 1 / versionName "1.0"` bei `package.json` 1.1.0; kein Android-CI-Workflow.
  iOS-Build-Nummer `run_number - 74` ist fragil.

#### Niedrig

- **T-N1 — Monitoring dünn:** kein externes Uptime-Monitoring, keine
  Fehlerraten-/Disk-/Backup-Erfolgs-Alerts.
- **T-N2 — Playwright nur Chromium**, keine Mobile-Viewports — für eine PWA/Capacitor-App
  relevant.
- **T-N3 — `.env.example`:** `APNS_KEY_PATH` fehlt komplett (wird im Deploy-Workflow
  geprüft!); README-Env-Tabelle ohne APNs-/IAP-/Retention-Variablen.

---

## 6. Konsolidierte Roadmap

Querverweise: mehrere Agents fanden dieselben Themen unabhängig (IAP-Sandbox = B-N9 + S-H1;
`connectAttempts`-Leak = B-M3 + D-N3; Admin-Auth = B-M1 + S-N3; Account-Löschung = B-M9 +
D-N7; ReadOnly-Cache-Referenzen = B-N3 + D-N6) — das erhöht die Konfidenz dieser Findings.

### Stufe 1 — Sofort (alle S, zusammen < 1 Tag)

| Maßnahme | Findings |
|---|---|
| PM2-Worker-Block aus `ecosystem.config.cjs` entfernen (oder Worker einchecken) | B-H1 |
| IAP-Sandbox-Default invertieren + Prod-Boot-Warnung | S-H1, B-N9 |
| Origin-Konfiguration konsolidieren (`auth/index.js` ← `config/origins.js`) | B-H2 |
| Joker-Hooks in `Quiz.jsx` vor den Early-Return ziehen | F-H1 |
| `self.skipWaiting()` + `clientsClaim()` in `sw.js` | F-H2 |
| `aria-hidden` vom Sheet-Backdrop entfernen | F-H3 |
| SW-Registrierung explizit hinter `!IS_NATIVE` (`injectRegister: null`) | F-H4 |
| Test-DB-Isolation: `APP_DB=/tmp/…` in `vitest.setup.js` | T-H1 |
| `query-cache.js` deckeln (maxEntries + LRU, Vorlage existiert in `store-belege-cache.js`) | D-H2 |
| `connectAttempts`-Pruning ergänzen | B-M3, D-N3 |
| JS-Migrationen atomar (Marker in Transaktion) + Kommentar-Fix | D-M1 |
| Pino-`redact` global | S-M3 |
| Push-Subscribe: `platform: Capacitor.getPlatform()` | F-M5 |
| Vite-Proxy-Port 3000→3001, README-Totverweise fixen | T-M4 |

### Stufe 2 — Kurzfristig (M, 1-2 Wochen)

1. **Fehlerbehandlung Backend:** `categorizeError` auf Code-basierte Erkennung; CORS als
   403; Fehlermaskierung in `public.js` beheben; einheitliches `{ error, code }`-Format
   (B-H3, B-M5, B-M10).
2. **ESLint (flat config, inkl. react-hooks-Plugin) + Prettier als CI-Gate**; optional
   `tsc --noEmit` mit `checkJs` für `server/` (T-H4).
3. **E2E in CI:** Playwright-`globalSetup` mit `setup-admin.js` + `seed-dev.js` gegen
   Temp-DB; als Job nach Verify (T-H2).
4. **IAP-Legacy härten:** `IAP_REQUIRE_ACCOUNT_TOKEN`-Flag, Legacy global auf
   1×/`originalTransactionId` begrenzen (S-H2).
5. **Stats-Retention:** per-User-Zeilen > 180 Tage in anonyme Zeilen zusammenfalten
   (Muster `dataRetention.js`); `loadStatsRows()` aus dem Gist-Backup nehmen;
   Stats-Window-Cache auf TTL statt Invalidierung pro Spielzug (D-H1, D-M5).
6. **`saveDailyContentMaps` atomar** + Tagesedits auf `saveTagAtomically` (D-M2).
7. **Beobachtbarkeit:** pino-http mit `req.id`-Child-Logger; Alerting um
   Backup-/Push-Fehler + 5xx-Zähler erweitern; Push-Job mit persistiertem
   „last sent"-Marker + Boot-Catch-up (B-M6, B-M7).
8. **Classroom-Router entschlacken:** `respondStoreResult`-Helper, try/catch-Boilerplate
   raus (~200 Zeilen) (B-M2).
9. **Join-Guard pro Session/Code** + Alerting-Hook (S-M1).
10. **PM2-Härtung:** Log-Pfade, `max_memory_restart`, `pm2-logrotate` dokumentieren;
    OPS.md anlegen (T-M3).
11. **Auth-Integrationstests** (echte better-auth-Flows ohne Dev-Header) +
    **Push-Pfad-Tests** (Regression zum Mai-Outage) + Migrations-Smoke gegen leere DB
    (T-H3, T-M1).
12. **Restore-Pfad:** Restore-Skript (gunzip → integrity_check → swap) + periodischer
    Restore-Smoke-Test; `SQLITE_BACKUP_DIR`-Warnung bei Default-Volume (D-M4).
13. **API-Client Frontend vereinheitlichen** (`apiFetch` + Retry + Fehlernormalisierung)
    (F-M4); Zeitenwende-Swipe auf Ref-Transform (F-M3); Memoisierung an den heißen Stellen
    (F-M2).

### Stufe 3 — Mittelfristig (L, strategisch)

1. **Schema konsolidieren:** `db.js`-Baseline als `0000_baseline.sql` einfrieren,
   Ad-hoc-Blöcke in nummerierte Migrationen, `db.js` nur noch Verbindung + Pragmas
   (B-N1, D-M3).
2. **Frontend-Context-Refactoring:** `DailyContentContext` + `GameActionsContext`,
   Abbau von `useGameScreenProps`/Prop-Listen — senkt die Kosten jeder neuen
   Spielvariante (F-M1).
3. **Admin-Auth auf better-auth-APIs** umstellen (B-M1, S-N3).
4. **Admin-DI auflösen:** Sub-Router importieren Deps direkt (B-M8).
5. **Bei Wachstum:** schwere Aggregationen (Stats, Telemetrie) in `worker_threads` mit
   readonly-Connection (D-H1-Endausbau); Android-Versionierung aus `package.json` ableiten
   + Android-CI (T-M5); Coverage-Thresholds in CI (T-M2).

---

*Erstellt am 2026-06-11 durch fünf parallele Analyse-Agents (Backend, Frontend, Security,
Datenbank/Performance, Tests/DevOps). Testsuite zum Analysezeitpunkt: 676/676 grün.*
