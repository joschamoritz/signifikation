# ADR-0002: better-auth statt Clerk / Auth0 / NextAuth

**Status:** Accepted
**Datum:** 2026-02
**Hinweis:** Widerspricht teilweise dem Vibe-Coding-Prinzip „Auth über
fertige Dienste lösen, nie selbst bauen" — siehe Begründung.

## Kontext

Signifikation braucht: Email+Passwort-Login, persistente Sessions,
Premium-/Admin-Rollen, optional später OAuth. Native iOS-App (Capacitor)
muss denselben Auth-Pfad nutzen. EU-Hosting / DSGVO-konform.

## Entscheidung

`better-auth` als selbst-gehostete Auth-Library auf demselben Node-Server,
mit Sessions in der eigenen SQLite-DB (Tabellen `user`, `session`, `account`,
`verification`). Premium-/Admin-Rollen in eigener `user_profiles`-Tabelle.

## Konsequenzen

**Positiv:**
- Daten bleiben unter eigener Kontrolle (DSGVO einfacher)
- Keine Subscription-Kosten — Clerk Free-Tier reicht zwar für Solo, aber
  Vendor-Lock und Pricing-Drift sind echte Risiken
- Custom Premium-Rollen ohne Workaround
- Capacitor-App nutzt einfach Bearer-Tokens vom selben Backend, kein
  separater OAuth-Flow

**Negativ:**
- Wir tragen Verantwortung für Auth-Sicherheit (bcrypt, Rate-Limits,
  Session-Rotation, CSRF) — siehe Code-Audit Findings H2, K2, M6
- better-auth ist relativ jung; Breaking Changes möglich

## Verworfene Alternativen

- **Clerk:** macht den meisten Job, aber: Lock-in, Pricing-Drift,
  zusätzliche Domain für Auth, DSGVO-Story mit US-Hosting komplexer.
- **Auth0:** zu teuer für Hobby-Scale.
- **NextAuth.js:** wir haben kein Next.js (Vite-React).
- **Selbst bcrypt + JWT bauen:** Verstoß gegen Vibe-Coding-Regel ohne
  Mehrwert gegenüber better-auth.

## Reviewt wenn

- better-auth wird unmaintained
- Wir brauchen Enterprise-Features (SAML, SCIM)
- Auth-Sicherheit wird zur regelmäßigen Wartungslast (> 1 Audit-Finding pro
  Quartal)
