# Umsetzungsplan Verbesserungen — Signifikation

Basiert auf: `planning/2026-06-11-tiefenanalyse.md` (Finding-IDs wie B-H1, F-M5 etc.
verweisen dorthin). Stand: 2026-06-11, Branch `claude/kind-thompson-1od5ll`.

**Arbeitsweise:** Jedes Arbeitspaket (WP) ist als ein eigener Commit/PR geschnitten,
unabhängig mergebar und endet mit `npm run verify` (Tests + Build). Reihenfolge ist so
gewählt, dass Absicherung (Phase 0) vor Risiko-Fixes kommt und kein WP ein späteres
blockiert. Schätzungen: S < 1 h, M = 0,5–1 Tag, L = mehrere Tage.

**Empfohlene Sofort-Reihenfolge bei knapper Zeit:** WP 0.1 → 1.1 → 1.2 → 1.3 → 1.4 → 1.5.

---

## Phase 0 — Fundament (zuerst, sichert alles Weitere ab)

### WP 0.1 — Test-DB-Isolation (T-H1) — S
**Dateien:** `vitest.setup.js`, ggf. `vite.config.js` (globalSetup)
1. In `vitest.setup.js` **vor jedem Import von `server/db.js`**:
   `process.env.APP_DB = path.join(os.tmpdir(), 'signifikation-test-' + process.pid + '.db')`.
   Achtung: Import-Reihenfolge prüfen — `db.js` migriert als Import-Seiteneffekt; der
   Env-Set muss garantiert vorher laufen (notfalls eigene `globalSetup`-Datei).
2. Migrationen laufen dann automatisch gegen die frische Temp-DB.
3. Cleanup: Temp-Datei (+ `-wal`/`-shm`) in `afterAll`/globalTeardown löschen.
4. Prüfen, ob einzelne Tests absichtlich Bestandsdaten erwarten (laut Analyse: nein,
   Isolation lief bisher über Zufalls-IDs) — die `afterAll`-Cleanups können bleiben.

**Akzeptanz:** `npm run test` grün; `server/data/signifikation.db` wird von Tests nicht
mehr berührt (Timestamp der Datei unverändert nach Testlauf).

### WP 0.2 — ESLint + Prettier als Gate (T-H4) — M
**Dateien:** neu `eslint.config.js`, `.prettierrc`, `package.json`, `.github/workflows/verify.yml`
1. ESLint flat config mit `eslint-plugin-react`, **`eslint-plugin-react-hooks`** (hätte
   F-H1 gefunden), `globals` für Node/Browser; `server/` und `src/` getrennte Blöcke.
2. Erst `--max-warnings` großzügig, dann Bestand in 2–3 Aufräum-Commits auf 0 bringen.
   Bewusste Ausnahmen (z. B. das Disable in `Quiz.jsx` — fliegt eh raus mit WP 1.4) als
   Inline-Disable mit Begründung.
3. `npm run lint` + in `verify`-Script aufnehmen; CI-Step in `verify.yml`.
4. Prettier nur als Check für neue Dateien oder einmaliges Format-Commit (Entscheidung
   dokumentieren — einmaliges Format-Commit verschmutzt `git blame`, dafür Ruhe danach).

**Akzeptanz:** `npm run verify` enthält Lint; CI rot bei Lint-Fehlern;
`react-hooks/rules-of-hooks` aktiv.

---

## Phase 1 — Kritische Fixes (Produktion, Sicherheit, echte Bugs)

### WP 1.1 — PM2-Worker-Crash-Loop beseitigen (B-H1) — S
**Datei:** `ecosystem.config.cjs:25`
1. Klären (Git-Historie/Server prüfen): War `server/workers/classroomWorker.js` je
   eingecheckt oder nur geplant? `git log --all -- 'server/workers/*'`.
2. Da nicht vorhanden: kompletten `signifikation-worker`-App-Block entfernen.
3. Deploy-Workflow gegenprüfen, ob er den Worker-Namen referenziert
   (`pm2 startOrRestart`, Phantom-PM2-Check in `deploy.yml`).

**Akzeptanz:** `pm2 startOrRestart ecosystem.config.cjs` startet ohne Restart-Loop;
kein Verweis auf `signifikation-worker` mehr im Repo.

### WP 1.2 — IAP härten (S-H1, S-H2, B-N9) — S–M
**Dateien:** `server/routes/iap.js`, `.env.example`, `server/config.js`
1. Default invertieren: `ALLOW_SANDBOX = process.env.IAP_ALLOW_SANDBOX === '1'`.
   `.env.example` anpassen (`IAP_ALLOW_SANDBOX=1` für Dev dokumentieren).
2. Boot-Warnung in Prod, falls Sandbox aktiv (`logger.warn` + idealerweise
   Alert-Webhook).
3. **Vor Deploy:** Prod-`.env` auf dem Server prüfen — nach der Invertierung ist
   Sandbox dort automatisch aus; TestFlight-Tester brauchen ggf. eine Staging-Umgebung
   oder das explizite Flag. Bewusst entscheiden und im Commit dokumentieren.
4. S-H2 (Legacy-Replay): neues Env-Flag `IAP_REQUIRE_ACCOUNT_TOKEN` (Default aus);
   wenn an → Payloads ohne `appAccountToken` ablehnen. Zusätzlich sofort: Einlösung
   ohne Token global auf 1× pro `originalTransactionId` begrenzen (Unique-Check über
   alle User statt pro User — Query in `rejectReasonForPayload`-Umfeld ergänzen).
5. Tests: bestehende `iap`-Testdatei erweitern — Sandbox-Payload bei Flag aus → 4xx;
   Legacy-Payload zweiter Account → abgelehnt.

**Akzeptanz:** Tests grün; Boot-Log zeigt Sandbox-Status; Replay-Test rot→grün.

### WP 1.3 — Origin-Konfiguration konsolidieren (B-H2) — S
**Dateien:** `server/auth/index.js:101-112`, `server/config/origins.js`
1. Parsing-Logik aus `auth/index.js` löschen; `ALLOWED_ORIGINS`/`CAPACITOR_ORIGINS`
   aus `config/origins.js` importieren (Export dort ggf. ergänzen).
   Nebenbei prüfen: Import-Richtung `origins.js → middleware/auth.js` (zieht db in
   jeden Import) — wenn trivial entkoppelbar, mitmachen, sonst lassen.
2. Effekt verifizieren: `http://localhost` ist in Prod-trustedOrigins **nicht** mehr
   enthalten, `https://localhost` (Capacitor Android) **ist** enthalten.
3. Paritätstest schreiben: trustedOrigins von better-auth === origins.js-Quelle
   (für dev und prod NODE_ENV).
4. **Manueller Check nach Deploy:** Android-Login durchspielen (das war der latent
   kaputte Flow).

**Akzeptanz:** Paritätstest grün; keine zweite Origin-Liste mehr im Code.

### WP 1.4 — Quiz.jsx Hooks-Bug (F-H1) — S
**Datei:** `src/components/Quiz.jsx:77-96`
1. Joker-`useState`/`useEffect` (Z. 86-91) vor den Early-Return (Z. 81) verschieben.
2. ESLint-Disable (Z. 79) entfernen — nach WP 0.2 wacht die Regel darüber.
3. Bestehenden Quiz-Komponententest um den Übergang „kollokatoren leer → befüllt"
   erweitern (Re-Render mit geänderten Props, kein Crash).

**Akzeptanz:** Lint ohne Disable grün; neuer Test grün.

### WP 1.5 — Service-Worker-Lebenszyklus (F-H2, F-H4, F-M8, F-N5) — M
**Dateien:** `src/sw.js`, `vite.config.js`, `src/main.jsx`, `scripts/` (Build-Guard)
1. `sw.js`: `self.skipWaiting()` + `clientsClaim()` (workbox-core) ergänzen.
2. `vite.config.js`: `injectRegister: null`; Registrierung explizit in `main.jsx`
   hinter `if (!IS_NATIVE && 'serviceWorker' in navigator)` — Kommentar dort stimmt
   dann wieder mit der Realität überein.
3. `navigateFallback: '/index.html'` für Navigations-Requests registrieren
   (Allowlist mit `/c/*`, Denylist `/admin`, `/api`).
4. Build-Guard-Script: nach `vite build` prüfen, dass alle JS-Chunks im
   Precache-Manifest sind (512-KB-Falle, F-N5); in `verify`-Script einhängen.
5. **Manueller Test (wichtig, schwer automatisierbar):** Alte Version laden → neue
   Version deployen → Reload: neue Version aktiv ohne Tab-Schließen; Kiosk-URL
   `/c/abc` offline neu laden → App-Shell statt Browserfehler.

**Akzeptanz:** Build-Guard grün; manuelles Update-Szenario dokumentiert durchgespielt.

### WP 1.6 — Sheet-A11y (F-H3) — S
**Datei:** `src/components/ui/Sheet.jsx:206-211`
1. `aria-hidden="true"` vom Backdrop entfernen (Klick-Schließen über
   `e.target === e.currentTarget` bleibt). Alternativ Backdrop und Panel als
   Geschwister rendern — nur falls CSS das ohne Verrenkung hergibt.
2. Test in `Sheet.test.jsx`: `getByRole('dialog')` ist für AT erreichbar
   (kein `aria-hidden`-Vorfahre).

**Akzeptanz:** Bestehende + neuer Sheet-Test grün; VoiceOver/NVDA-Quickcheck.

### WP 1.7 — Memory-Leaks deckeln (D-H2, B-M3/D-N3) — S
**Dateien:** `server/query-cache.js`, `server/realtime/classroomSocket.js`
1. `query-cache.js`: `maxEntries` (z. B. 5000) + Eviction; Vorlage ist der
   Beleg-Cache (`store-belege-cache.js`) — dabei dessen FIFO gleich zu echtem LRU
   machen (D-N4: `get()` refresht Position) und das falsche „LRU"-Label in
   `store.js:322` fixen.
2. `classroomSocket.js`: Cleanup-Intervall für `connectAttempts` analog
   `CleanupStore` aus `rateLimiter.js:6-27` (unref'd, ~10 min, abgelaufene Fenster
   löschen).
3. Tests: Cache-Eviction-Test (maxEntries+1 Einträge → ältester weg); Pruning-Test
   mit Fake-Timern.

**Akzeptanz:** Tests grün; beide Maps nachweislich begrenzt.

### WP 1.8 — Migrations-Atomarität (D-M1) — S
**Datei:** `server/migrate-runner.js:85-89`
1. Synchrone JS-Migrationen: `db.transaction(() => { mod.default(db); markApplied.run(...) })()`.
   Falls eine Migration wirklich async sein muss: Marker-Schreiben in die Migration
   selbst verlagern und das im Runner-Kommentar ehrlich dokumentieren.
2. Den falschen Kommentar („Marker atomar") korrigieren.
3. Migrations-Smoke-Test (zieht T-M1 teilweise vor): leere Temp-DB → alle
   Migrationen → Schema-Assertions (Tabellen + Schlüssel-Indizes vorhanden);
   zweiter Lauf → alle übersprungen (Idempotenz).

**Akzeptanz:** Smoke-Test grün in CI.

### WP 1.9 — Kleine Härtungen gebündelt (S-M3, F-M5, T-M4, S-N1) — S
Ein Sammel-Commit, getrennt committen wenn’s übersichtlicher ist:
1. **Pino-redact** (`server/logger.js`): `req.headers.authorization`,
   `req.headers.cookie`, `res.headers["set-cookie"]`, `*.password`, `*.token`,
   `*.secret`.
2. **Push-Platform** (`src/hooks/usePushNotifications.js:149`):
   `platform: Capacitor.getPlatform()`; Server-Vertrag in `routes/push.js` prüfen —
   akzeptiert/validiert er `android`? Falls Android-Push serverseitig noch gar nicht
   existiert, stattdessen Subscribe auf iOS begrenzen (`supported = getPlatform() === 'ios'`).
3. **Dev-Setup-Fix:** `vite.config.js:108` Proxy 3000→3001; README-Totverweise
   (`OPS.md`, `ADMIN_API.md`) entfernen oder Stub-OPS.md anlegen (→ WP 3.3);
   `ops/`→`scripts/`-Verweis korrigieren; `APNS_KEY_PATH` in `.env.example`.
4. **Quota-Race** (`routes/custom-lemma.js:56-72`): Verbrauch atomar —
   `UPDATE … SET count = count + 1 WHERE … AND count < allowance` und Erfolg an
   `changes === 1` festmachen; bei Fehlschlag von `buildCustomPlay` zurückbuchen
   (oder Reihenfolge: erst bauen, dann atomar buchen, bei 0 changes → 429).

**Akzeptanz:** `npm run dev` + `npm run server` funktionieren nach README ohne
Anpassung; Redact-Test (Token im Log-Objekt → `[Redacted]`); Quota-Race-Test mit
zwei parallelen Requests.

---

## Phase 2 — Fehlerbehandlung & Beobachtbarkeit (Backend-Qualität)

### WP 2.1 — Fehlerkategorisierung umbauen (B-H3, B-M10, B-M5) — M
**Dateien:** `server/error-handling.js`, `server/index.js`, `server/routes/public.js`
1. `categorizeError`: Message-Sniffing raus; Erkennung nur über `err instanceof AppError`,
   `err.code?.startsWith('SQLITE_')`, `ENOENT`/`EACCES`, Zod-Fehler-Typ. Default: 500.
2. CORS-Ablehnung (`index.js:98-101` + Socket): `AppError('FORBIDDEN', 403)` werfen
   statt nacktem `Error` → saubere 403, kein 500-Rauschen durch Bots.
3. `public.js`: Belege-Fehler (Z. 150-156) → 502 mit `{ error, code }`;
   `/archiv`-Fehler (Z. 216-219) → 500; Path-Traversal → 400. **Frontend-Gegenseite
   anpassen:** `useBelege.js` und Archiv-Consumer müssen Fehlerstatt leerer Liste
   tolerieren (Fallback-UI „Belege derzeit nicht verfügbar").
4. Einheitliches Fehlerformat `{ error, code, details? }` als Konvention in allen
   Routen dokumentieren (Kommentar in `error-handling.js` genügt).
5. Tests: pro Kategorie ein Fall; „invalid state"-Exception → 500 (Regression zu B-H3).

**Akzeptanz:** Kein Message-Matching mehr; Fehler-Tests grün; Frontend zeigt
Belege-Fallback statt stiller Leere.

### WP 2.2 — Request-Logging + Alerting ausbauen (B-M6, B-M7) — M
**Dateien:** `server/index.js`, `server/logger.js`, `server/alerting.js`,
`server/jobs/sqliteBackup.js`, `server/notifications/scheduler.js`
1. pino-http (oder schlanke eigene Middleware) mit `req.id` als Child-Logger —
   Correlation-ID landet in jeder Log-Zeile. Health-/Static-Pfade ausnehmen.
2. `alerting.js` generalisieren: `reportAlert(kind, payload)`-API; anbinden an
   Backup-Fehler (`sqliteBackup.js:93-95`), Push-Job-Fehler, 5xx-Zähler
   (einfacher Counter in der Error-Middleware, Schwelle pro 5 min). Ohne
   `ALERT_WEBHOOK_URL`: loggen statt komplett deaktivieren.
3. **Push-Catch-up** (B-M7): Tabelle/Key `push_last_sent` (Datum); beim Boot prüfen
   „heute schon gesendet & nach 08:00?" → nachholen. Idempotenz über das Datum.
4. Test für Catch-up (Fake-Clock: Boot um 09:00 ohne Marker → Versand; mit Marker →
   kein Versand).

**Akzeptanz:** Jede Request-Logzeile korrelierbar; simulierter Backup-Fehler erzeugt
Alert; Push-Catch-up-Tests grün.

### WP 2.3 — Classroom-Router entschlacken (B-M2) — M
**Datei:** `server/routes/classroom.js`
1. Helper `respondStoreResult(res, result, onSuccess?)` (mappt `result.error` →
   Status + Format aus WP 2.1).
2. try/catch-Boilerplate entfernen — Express 5 routet Rejections zum zentralen
   errorHandler; Stichprobe per Test absichern (Route wirft → 500 + Error-Log).
3. Rein mechanisches Refactoring: **keine Verhaltensänderung**, die bestehende
   1418-Zeilen-Testdatei ist das Sicherheitsnetz. Erst Helper einführen, dann Route
   für Route umstellen (reviewbare Commits).
4. Optional am Ende: Split in `classroom-teacher.js` / `classroom-student.js`, nur
   wenn die Datei danach immer noch unhandlich ist.

**Akzeptanz:** Alle Classroom-Tests unverändert grün; Datei ≥ 200 Zeilen kürzer.

### WP 2.4 — Backend-Kleinkram (B-M9, B-N4, B-N5, B-N7, B-N8, D-N1, D-N2, S-N2) — S–M
Sammelpaket, jeweils trivial:
1. Account-Löschung (`routes/account.js:172-188`): manuelle session/account-Deletes
   entfernen (FK-Cascade greift, Schema `db.js:72, 89`), veralteten Kommentar fixen;
   Test: User löschen → session/account-Zeilen weg.
2. `/health` ohne Write-Lock (`routes/public.js:37`): `SELECT 1` bzw.
   `PRAGMA quick_check` statt `BEGIN IMMEDIATE`.
3. Toten Code: `notifyStudentKicked` raus (oder verdrahten — Entscheidung);
   `'aborted'`-Handling entweder mit Erzeuger versehen oder entfernen.
4. `validate()` (`middleware/validate.js:18`): `req[source]`-Objekt durch
   `result.data` **ersetzen** statt mergen (Express 5: bei `req.query` ggf. über
   `Object.defineProperty`/Re-Assign-Pattern — kurz testen).
5. `db.close()` im Shutdown (`index.js:263-272`, im `server.close`-Callback).
6. Rohe `BEGIN/COMMIT/ROLLBACK`-Blöcke in `db.js:441-507` auf `db.transaction()`.
7. Migration 0013: `DROP INDEX idx_user_email` (redundant zu UNIQUE).
8. Mollie-Reject-Log auf `req.body.id` reduzieren.

**Akzeptanz:** `npm run verify` grün; Migration 0013 läuft idempotent.

---

## Phase 3 — Tests, CI & Betrieb

### WP 3.1 — E2E reproduzierbar + in CI (T-H2) — M
**Dateien:** `playwright.config.js`, neu `e2e/global-setup.js`, `.github/workflows/verify.yml`
1. Playwright-`globalSetup`: Temp-`APP_DB` setzen, Migrationen laufen lassen,
   `setup-admin.js` (Admin-Account aus `e2e/helpers/admin.js`-Erwartung) +
   `seed-dev.js` ausführen. `webServer`-Env entsprechend.
2. Audit-Filter-Spec fixen: Early-Return bei leerer DB entfernen — Seed garantiert
   jetzt Daten, die Spec kann hart asserten.
3. CI-Job `e2e` nach `verify` (Chromium, Playwright-Container oder
   `npx playwright install --with-deps chromium`), Trace-Upload bei Failure.
4. Danach billig: Mobile-Viewport-Projekt (T-N2) ergänzen — gleiche Specs,
   `Mobile Chrome`-Profil.

**Akzeptanz:** `npm run test:e2e` läuft auf frischem Checkout ohne Handarbeit;
CI führt E2E aus und ist grün.

### WP 3.2 — Auth- & Push-Tests (T-H3, T-M1) — M
**Dateien:** neu `server/__tests__/auth.integration.test.js`,
`server/__tests__/push.test.js`
1. Auth: Tests **ohne** `x-dev-user-id` — echte better-auth-Flows über HTTP:
   Sign-up → Cookie → authentifizierter Request; Sign-in falsches Passwort → 401;
   Session-Ablauf/Sign-out. (Apple-Flow bleibt gemockt — nur der lokale
   Credential-Pfad.)
2. Push: APNs-Provider-Init mit unlesbarem Key → sauberer Fehler statt Crash
   (Regressionstest zum Outage 2026-05-26); Scheduler-Dispatch mit gemocktem
   Provider (richtige Empfängermenge, Fehler eines Tokens bricht Batch nicht ab).
3. Coverage-Thresholds (T-M2) jetzt aktivieren, Startwert konservativ (z. B.
   lines 55 %), `test:coverage` in CI — Ratchet später hochdrehen.

**Akzeptanz:** Neue Tests grün; Coverage-Gate aktiv in CI.

### WP 3.3 — Betrieb härten (T-M3, D-M4, T-N1) — M
**Dateien:** `ecosystem.config.cjs`, neu `docs/OPS.md`, neu `scripts/restore-db.sh`,
`server/jobs/sqliteBackup.js`
1. PM2: `max_memory_restart` (z. B. `512M`), `error_file`/`out_file`-Pfade,
   `pm2-logrotate`-Setup in OPS.md dokumentieren (Install-Befehl + Limits).
2. OPS.md schreiben (README verweist schon darauf): Deploy, Rollback, Backup/Restore,
   PM2-Befehle, bekannte Invarianten (fork/instances:1!), Env-Checkliste
   (inkl. `IAP_ALLOW_SANDBOX`, `APNS_KEY_PATH`).
3. Restore-Skript: jüngstes Backup → `gunzip` → `PRAGMA integrity_check` →
   atomarer Swap (Server gestoppt) → Smoke-Query. Boot-Warnung, wenn
   `SQLITE_BACKUP_DIR` auf dem Daten-Volume liegt.
4. Restore-Smoke automatisiert: wöchentlicher CI-Job (`schedule`) oder lokaler
   Cron, der das Skript gegen das letzte Backup in ein Temp-Verzeichnis fährt.
5. Externes Uptime-Monitoring: minimal GitHub-Actions-`schedule` (alle 15 min
   `/health` prüfen, bei Fail → Alert-Webhook) oder UptimeRobot — Entscheidung
   in OPS.md festhalten.

**Akzeptanz:** OPS.md existiert und stimmt; Restore-Skript einmal erfolgreich
durchgespielt (dokumentiert); Monitoring meldet sich bei künstlichem Fail.

---

## Phase 4 — Daten & Skalierung

### WP 4.1 — Stats-Retention & -Aggregation (D-H1, D-M5) — M
**Dateien:** `server/store-stats.js`, `server/jobs/dataRetention.js`, `server/store.js`,
`server/backup.js`
1. Täglicher Sweep (Muster `dataRetention.js`): per-User-Zeilen älter 180 Tage pro
   Tag×Spiel in eine anonyme Aggregat-Zeile (`user_id = ''`) zusammenfalten —
   Summen/Verteilungen bleiben für die Admin-Statistik korrekt.
2. `loadStatsRows()` aus dem Gist-Backup entfernen oder auf die aggregierte Sicht
   umstellen (nimmt nebenbei die `user_id`s aus dem Gist — Datenschutz-Randnotiz
   aus D-M4 gleich miterledigt).
3. `statsWindowCache`: Map pro `days`-Key, Invalidierung pro `recordStat` ersetzen
   durch kurze TTL (30 s) — Admin-Dashboard ist eventual-consistent, das reicht.
4. Tests: Sweep-Idempotenz; Aggregat-Summen == vorherige Detail-Summen; Cache-TTL.

**Akzeptanz:** `stats`-Wachstum gedeckelt; Admin-Summary trifft Cache unter
simulierter Spiellast (Test mit parallelem `recordStat`).

### WP 4.2 — Tagesinhalte atomar (D-M2) — M
**Dateien:** `server/store.js:225-240`, `server/routes/admin-calendar.js`
1. `saveDailyContentMaps`: eine äußere `db.transaction` um alle drei Replaces.
2. Admin-Ein-Tages-Edits auf `saveTagAtomically`/gezielte Upserts umstellen statt
   Full-Map-Replace (beseitigt Lost-Update-Race + Write-Amplification).
   Full-Replace nur noch für den Import-/Restore-Pfad behalten.
3. Test: simulierter Fehler in Replace Nr. 2 → kein Teilzustand (Rollback);
   zwei „parallele" Ein-Tages-Edits verschiedener Tage → beide persistiert.

**Akzeptanz:** Tests grün; Admin-Kalender-E2E (aus WP 3.1) weiterhin grün.

### WP 4.3 — Join-Guard pro Code + Socket-Limit hinter Proxy (S-M1, Sec-Hinweis 8) — S–M
**Dateien:** `server/classroom/join-guard.js`, `server/realtime/classroomSocket.js`,
`ops/nginx`-Conf
1. Guard-Zähler pro Join-Code (Map code→Fenster) statt global; globaler Zähler
   bleibt als zweite, höhere Schwelle (z. B. 400) bestehen. Bereits beigetretene
   Teilnehmer (gültiges Participant-Token) vom Block ausnehmen.
2. Guard-Aktivierung → `reportAlert` (aus WP 2.2).
3. Socket-Connect-Limit: prüfen, ob `socket.handshake.address` hinter nginx die
   Client-IP ist; sonst `X-Forwarded-For` (vertrauenswürdig nur vom Proxy)
   auswerten — analog zur Express-`trust proxy`-Einstellung.
4. Join-Guard-Tests anpassen (Code-Scope), Loadtest (`scripts/classroom-loadtest.js`)
   einmal laufen lassen.

**Akzeptanz:** Angriff auf Code X blockiert Joins für Code Y nicht (Test);
Loadtest unauffällig.

### WP 4.4 — Wortprofil-Bootstrap entgiften (B-M4) — S–M
**Datei:** `server/init-wortprofil.js`
1. `execSync(curl/gunzip)` → async: `fetch` + Stream-Pipeline durch
   `zlib.createGunzip()` in die Zieldatei; Pfade aus Env statt hartkodiert `/app/...`.
2. Damit greift der bestehende 130-s-`Promise.race`-Timeout in `index.js` real.
3. Da der Pfad nur beim allerersten Boot ohne DB läuft: manuell einmal gegen einen
   Test-Download verifizieren, kein Dauertest nötig.

**Akzeptanz:** Boot mit fehlender wortprofil.db lädt non-blocking; Timeout feuert
nachweislich (Test mit unerreichbarer URL).

---

## Phase 5 — Strukturelle Refactorings (einzeln einplanen, kein Zeitdruck)

### WP 5.1 — Frontend-Contexts gegen Prop-Drilling (F-M1, F-M2) — L
1. Schritt 1 (M): `DailyContentContext` (Tagesdaten, read-only) — `Home`,
   Spielkomponenten, `AppGameScreens` ziehen Daten selbst; `useGameScreenProps.js`
   schrumpft.
2. Schritt 2 (M): `GameActionsContext` (Navigation/Play-Callbacks) — die
   `{ play: … }`-Literale und ~65-Props-Listen verschwinden.
3. Schritt 3 (S): `AppTabScreens` als echte Komponente rendern; `React.memo` auf
   `Home`, `GameEntry`, `TabBar`; Theme-Context-Value memoisieren (F-N4).
4. Sicherheitsnetz: bestehende 17 Komponententests; pro Schritt `npm run verify`.
   **Vorher mit WP 1.4/0.2 abgeschlossen sein** (Hooks-Lint aktiv).

### WP 5.2 — Schema-Konsolidierung (B-N1, D-M3) — L
1. Aktuellen Stand als `migrations/0000_baseline.sql` einfrieren (aus
   `sqlite3 .schema` einer frisch migrierten DB generieren).
2. Runner: leere DB → Baseline; bestehende DB → als angewendet markieren
   (Detection: existiert `user`-Tabelle?).
3. Inline-`hasColumn`-Blöcke aus `db.js` schrittweise löschen (sie sind durch die
   Baseline abgedeckt); die jährlich falsche MM-DD-Migration (db.js:368-424)
   entfernen oder mit festem Jahr versionieren.
4. `db.js` am Ende: nur Verbindung + Pragmas + Checkpoint-Timer.
5. Migrations-Smoke-Test aus WP 1.8 ist das Sicherheitsnetz; zusätzlich Diff-Test:
   Schema „frisch via Baseline" == Schema „alte DB durchmigriert".

### WP 5.3 — Admin-Auth auf better-auth-APIs (B-M1, S-N3) — M–L
1. `adminAuth` auf `auth.api.signInEmail` + Rollenprüfung umstellen; manuelle
   Session-Inserts und das unsignierte Cookie entfernen.
2. `requireAuth`-Raw-Lookup durch better-auth-Session-Validierung ersetzen.
3. E2E-Admin-Login (WP 3.1) ist der Regressionstest; zusätzlich Admin-Testdatei
   prüfen, die ggf. das alte Cookie-Format stubbed.

### WP 5.4 — Admin-DI auflösen (B-M8) — M
Sub-Router (`routes/admin-*.js`) importieren ihre Stores direkt; Tests von
Parameter-Injection auf `vi.mock` umstellen; `routes/admin.js` wird reine
Mount-Liste. Router für Router, jeweils mit grünem Admin-Testlauf.

### WP 5.5 — Frontend-API-Client + Konto-Hook (F-M4, F-M6) — M
1. `src/api/client.js`: `apiFetch` (Bearer) + `fetchWithRetry` + einheitliche
   Fehlerklasse; Migration der rohen `fetch()`-Stellen (`Results.jsx`,
   `WortZwilling.jsx`, `useBelege.js`, `Zeitenwende.jsx`, `stats.js`).
   `kioskFetch` bleibt bewusst getrennt.
2. `useKontoAuth` in `useAuthSession`/`useAuthForms`/`usePasswordReset` splitten;
   Fehlerübersetzung auf better-auth-**Fehlercodes** statt Message-Matching.

### WP 5.6 — Rest-Kleinkram Frontend (F-M3, F-M7, F-M9, F-N1–N3, F-N6–N8, F-N10) — S–M
Zeitenwende-Swipe auf Ref-Transform; `<KollokationNote/>` extrahieren;
Debug-Logger auf Error-Level + Flag (nur Native/Beta); tote Variablen/Props;
UTC-Seed → Lokaldatum; Breakpoint 699px zentralisieren; `DraggableChip` als
`<button>`; Offline-Queue für Stats (`keepalive` als Minimallösung); `logo.png` löschen.

### WP 5.7 — Mobile-Versionierung (T-M5) — M
`versionCode`/`versionName` in `android/app/build.gradle` aus `package.json`
ableiten (Gradle liest die JSON); iOS-Build-Nummer von `run_number - 74` auf einen
expliziten Offset-Parameter oder Tag-basierte Nummer umstellen; optional
Android-Build-Workflow analog `ios-testflight.yml`.

---

## Tracking-Checkliste (Stand 2026-06-11, Umsetzung auf claude/kind-thompson-1od5ll)

### Phase 0 — ERLEDIGT
- [x] WP 0.1 Test-DB-Isolation (Commit 5c31351)
- [x] WP 0.2 ESLint-Gate (89e3ce5; bewusst ohne Prettier-Massenformat)

### Phase 1 — ERLEDIGT
- [x] WP 1.1 PM2-Worker (ae2bc77; Server-Nacharbeit: pm2 delete signifikation-worker)
- [x] WP 1.2 IAP (885b9a4; TestFlight braucht jetzt IAP_ALLOW_SANDBOX=1!)
- [x] WP 1.3 Origins konsolidiert (c953e34; nach Deploy: Android-Login manuell prüfen)
- [x] WP 1.4 Quiz.jsx Hooks (c9ec639)
- [x] WP 1.5 Service Worker (c796e68; Update-Szenario nach Deploy manuell durchspielen)
- [x] WP 1.6 Sheet-A11y (66932e1)
- [x] WP 1.7 Cache-/Map-Limits (9baa346)
- [x] WP 1.8 Migrations-Atomarität + Smoke (4b8e9bc)
- [x] WP 1.9 Härtungen (2ce0f54)

### Phase 2 — ERLEDIGT
- [x] WP 2.1 Fehlerkategorisierung (3e3b5c6)
- [x] WP 2.2 Request-Logging + Alerting + Push-Catch-up (78d4527; Migration 0013)
- [x] WP 2.3 Classroom-Router (4bcd592)
- [x] WP 2.4 Backend-Kleinkram (7050d05; Migration 0014)

### Phase 3 — ERLEDIGT
- [x] WP 3.1 E2E in CI (5cd854d; Browser-Lauf nur in CI — Sandbox blockt Playwright-CDN)
- [x] WP 3.2 Auth-/Push-Tests + Coverage-Gate (0654a67; Thresholds 55/47/56/58)
- [x] WP 3.3 OPS.md, PM2, Restore, Monitoring (2e98a5f; Secret ALERT_WEBHOOK_URL setzen)

### Phase 4 — ERLEDIGT
- [x] WP 4.1 Stats-Retention (c7cfce4)
- [x] WP 4.2 Tagesinhalte atomar (7c4eb62)
- [x] WP 4.3 Join-Guard pro Code + Socket-XFF (08bc092)
- [x] WP 4.4 Wortprofil-Bootstrap (b2fe422)

### Phase 5 — TEILWEISE
- [ ] WP 5.1 Frontend-Contexts — OFFEN (eigene Session; die F-M2-Memoisierung
      (541cc3a) nimmt den akuten Re-Render-Schmerz. Contexts lohnen weiterhin
      VOR der nächsten neuen Spielvariante.)
- [ ] WP 5.2 Schema-Konsolidierung — OFFEN (eigene Session; Vorarbeit fertig:
      Migrations-Smoke-Test als Sicherheitsnetz, Runner atomar)
- [ ] WP 5.3 Admin-Auth auf better-auth — OFFEN (eigene Session;
      E2E-Admin-Login in CI ist der Regressionstest)
- [ ] WP 5.4 Admin-DI auflösen — OFFEN (mechanisch, 10 Factory-Dateien;
      Tests laufen über HTTP gegen den montierten Router → gefahrlos Datei
      für Datei machbar; admin-free-days.js ist die Vorlage)
- [x] WP 5.5 API-Client (f36ec5a) — useKontoAuth-Split bleibt OFFEN
- [x] WP 5.6 Frontend-Kleinkram inkl. Zeitenwende-Swipe (d047372, d634bee)
- [x] WP 5.7 Mobile-Versionierung (d047372)

### Deploy-Checkliste für den nächsten Release (Ops-wirksame Änderungen)

1. `pm2 delete signifikation-worker && pm2 save` (einmalig, als signifikation-User)
2. TestFlight-Phase? → `IAP_ALLOW_SANDBOX=1` in Prod-`.env`; sonst NICHTS tun (Default jetzt aus)
3. `pm2 install pm2-logrotate` + Logverzeichnis `/opt/signifikation/logs` anlegen
4. Repo-Secret `ALERT_WEBHOOK_URL` für uptime.yml setzen
5. `SQLITE_BACKUP_DIR` auf separates Volume (Boot warnt sonst)
6. Nach Deploy: Android-Login + SW-Update-Szenario manuell prüfen

## Aufwands-Summe (grob)

| Phase | Inhalt | Schätzung |
|---|---|---|
| 0 | Fundament | ~1 Tag |
| 1 | Kritische Fixes | ~2–3 Tage |
| 2 | Fehlerbehandlung & Observability | ~3 Tage |
| 3 | Tests/CI/Betrieb | ~3 Tage |
| 4 | Daten & Skalierung | ~3 Tage |
| 5 | Strukturell (optional/verteilt) | ~2–3 Wochen verteilt |

Phasen 0–4 zusammen ≈ 2–2,5 Wochen fokussierte Arbeit; danach ist jedes
Hoch-/Mittel-Finding der Analyse adressiert. Phase 5 ist Investition in
Wartbarkeit und kann beliebig gestreckt werden.
