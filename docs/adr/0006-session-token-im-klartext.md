# ADR-0006: Session-Tokens im Klartext in der DB

**Status:** Accepted
**Datum:** 2026-05
**Bezogene Findings:** Code-Audit R2-H1

## Kontext

Sowohl die admin-eigene `adminAuth` (`server/middleware/auth.js`) als auch
better-auth selbst speichern Session-Tokens unverschlüsselt in der
`session`-Tabelle (Spalte `token`). better-auth liest beim Login-Check
`findSession` direkt per `WHERE token = ?` mit dem Klartext-Cookie-Wert
(vgl. `node_modules/better-auth/dist/db/internal-adapter.mjs`, Z. 161 und
225-229). Eine sha256/HMAC-basierte Speicherung müsste daher auf BEIDEN
Pfaden (better-auth + unsere Custom-Admin-Logik) erfolgen.

Code-Audit R2-H1 hat das als HOCH eingestuft mit der Begründung:
„Bei DB-Leak sind alle aktiven Sessions übernehmbar."

## Entscheidung

Wir behalten die Klartext-Speicherung bei und akzeptieren das Risiko.

## Begründung

1. **Token-Entropie:** Tokens sind 32 Byte aus `crypto.randomUUID()` bzw.
   `generateId(32)` (256 Bit Entropy). Sie sind nicht brute-forcebar — der
   Schutz durch Hashing greift nur, wenn jemand die rohen DB-Bytes liest.

2. **Architektur-Realität:** Bei einem DB-Leak in dieser Codebase sind
   gleichzeitig kompromittiert:
   - `bcrypt(password, cost=12)`-Admin-Hashes (offline brute-forcebar)
   - Mollie-Webhook-Secret, VAPID-Push-Keys, APNs-Keys in `.env`
   - Belege-Datenbank mit allen Korpus-Daten

   In diesem Szenario ist „Session-Hijacking" das geringste Problem.

3. **better-auth-Kompatibilität:** Alle Wege zum Token-Hashing greifen
   tief in better-auth ein:
   - Eigene `admin_session`-Tabelle dupliziert Session-Management und
     entkoppelt von better-auth's Refresh-Logik (`SESSION_UPDATE_AGE`)
   - `hooks.session.create.after` rewriten den Token, aber better-auth
     liest in `findSession` weiter den Raw-Cookie — kein konsistenter Lookup
   - Monkey-Patch der `findSession`-Funktion bricht bei jedem
     better-auth-Update

4. **Kosten/Nutzen:** Custom-Session-Tabelle = 2-3h Refactor + Test-Suite-
   Anpassungen + dauerhafte Wartungslast. Risiko-Reduktion: nur die
   spezifische „DB leakt, Filesystem nicht"-Variante.

## Konsequenzen

**Positiv:**
- Keine Inkonsistenz zwischen better-auth- und Admin-Auth-Pfaden
- Updates von better-auth sind risikofrei
- Klare Architekturlinie: Eine `session`-Tabelle, eine Wahrheit

**Negativ:**
- Bei DB-Leak müssen alle Sessions invalidiert werden (Skript dafür:
  `server/invalidate-all-sessions.js`)
- Wir können den HOCH-Befund nicht abhaken; er bleibt mit
  „acknowledged-and-accepted" markiert

## Mitigationen

- **Notfall-Pfad:** `node server/invalidate-all-sessions.js` löscht alle
  Sessions auf einen Schlag. Alle User müssen sich neu einloggen.
- **Audit-Trail:** `auditSecurity('LOGIN_SUCCESS', …)` läuft bei jedem
  Login (`server/middleware/auth.js`), `audit_log` ist mit `ip`,
  `userId`, `timestamp` indiziert — Anomalien (z.B. Login-Geschwindigkeit)
  retroaktiv erkennbar.
- **Session-TTL:** `AUTH_SESSION_EXPIRES_IN` default 30 Tage, mit
  `SESSION_UPDATE_AGE` 12h-Refresh. Längere Inaktivität = automatische
  Invalidierung.
- **`.env`-Hygiene:** Geheimnisse außerhalb des Repos
  (`.env` in `.gitignore`), Hetzner-VPS hat dedizierten Service-User
  ohne Root-Rechte (ADR-0003).

## Reviewt wenn

- better-auth-Update bringt nativen Token-Hash mit (z.B. via
  `session.tokenHash`-Spalte)
- DB-Speicherort wechselt zu shared/managed DB (z.B. Neon, PlanetScale) —
  dann sind Disk-Zugriffsmuster anders zu bewerten
- Compliance-Anforderung (SOC2, ISO 27001) Hash erzwingt
