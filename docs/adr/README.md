# Architecture Decision Records (ADRs)

Jede wichtige Architekturentscheidung wird hier dokumentiert. Format:

- **Datei:** `NNNN-kebab-case-titel.md`
- **Status:** Proposed / Accepted / Deprecated / Superseded by ADR-XXXX
- **Sektionen:** Kontext, Entscheidung, Konsequenzen, Verworfene Alternativen

Lesen statt Commit-Archäologie. Ändert sich eine Entscheidung, alte ADR
als `Superseded` markieren und neue anlegen — Historie bleibt nachvollziehbar.

## Index

- [0001 – SQLite statt Postgres](0001-sqlite-statt-postgres.md)
- [0002 – better-auth statt Clerk/Auth0](0002-better-auth-statt-clerk.md)
- [0003 – Single-Instance PM2 auf Hetzner](0003-single-instance-pm2-hetzner.md)
- [0004 – Eigene Korpus-Pipeline statt DWDS-API](0004-eigene-korpus-pipeline.md)
- [0005 – Capacitor-iOS-Builds nur via GitHub Actions](0005-capacitor-builds-via-github-actions.md)
