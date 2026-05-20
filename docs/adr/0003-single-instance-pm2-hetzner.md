# ADR-0003: Single-Instance PM2 auf einem Hetzner-VPS

**Status:** Accepted
**Datum:** 2026-01

## Kontext

Backend ist Express + Socket.IO + SQLite. Hosting: ein Hetzner Cloud
CX21 (4 GB RAM) in Nürnberg. Domain `signifikation.de` via nginx-Reverse-
Proxy auf den Node-Prozess.

## Entscheidung

PM2 mit `instances: 1, exec_mode: 'fork'` (siehe `ecosystem.config.cjs`).
Kein Cluster-Mode, kein Multi-Server, kein Load-Balancer.

## Konsequenzen

**Positiv:**
- Trivialer Mental-Model: ein Prozess, ein RAM-Set, ein In-Memory-Cache,
  eine SQLite-Datei
- WebSocket-Sessions (Classroom) müssen nicht über Redis synchronisieren
- Deploy = `pm2 reload` mit nahtlosem Restart, < 1s Downtime
- Memory-Caches in `store.js` funktionieren wie erwartet

**Negativ:**
- Kein Failover bei Hetzner-Ausfall (Nürnberger Single-AZ-Risiko)
- Skalierungsdecke = ein CPU-Kern für CPU-bound-Pfade (z. B.
  bcrypt-Login, Wortprofil-Belege)
- Memory-Leak hat unmittelbare Wirkung — kein anderer Worker fängt es ab

## Trigger-Metriken für Cluster-Mode oder Multi-Server

1. CPU > 70 % im 1h-Median
2. RAM > 75 % im 1h-Median
3. Concurrent WebSocket-Verbindungen > 200
4. p95 Response-Time > 500 ms für Standard-API-Pfade

Vor Cluster-Mode kommt: SQLite → Postgres (ADR-0001), weil Cluster-PM2
mit SQLite Schreibkonflikte verursachen würde.

## Verworfene Alternativen

- **PM2 Cluster (`instances: 'max'`):** verträgt sich schlecht mit SQLite
  + In-Memory-Cache + Socket.IO ohne Sticky-Sessions
- **Kubernetes auf Hetzner / Hetzner Cloud-Server scaled:** Overkill,
  Operations-Aufwand > 80 % der eingesparten CPU-Leistung
- **Serverless (Cloudflare Workers + D1):** SQLite-Driver-Inkompatibilität
  (besser-sqlite3 ist Node-only), kein Persistence-Modell für
  Long-running WebSockets
