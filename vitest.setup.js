// Globale Test-Umgebung
// Aktiviert die Dev-Header-Auth (x-dev-user-id), die im Produktionscode
// zusätzlich zu NODE_ENV !== 'production' jetzt ALLOW_DEV_AUTH=1 verlangt.
process.env.ALLOW_DEV_AUTH = '1'
