module.exports = {
  apps: [
    {
      name: 'signifikation',
      script: 'server/index.js',
      cwd: '/opt/signifikation/app',
      // PFLICHT: genau EINE Instanz im Fork-Mode. Der Klassenraum-Realtime
      // (server/realtime/classroomSocket.js) haelt Socket-Broadcasts,
      // Reconnect-Timer (D6) und das IP-Rate-Limit modul-lokal pro Prozess —
      // ohne Redis-Adapter/Pub-Sub. instances>1 (cluster_mode) wuerde Sockets
      // auf mehrere Prozesse verteilen und Realtime STILL brechen. Der Server
      // warnt beim Start laut, falls er doch im Cluster laeuft (assertSingleNode).
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      // Leak-Notbremse: Neustart bevor der Prozess das System wuergt.
      // Bekannte Caches sind gedeckelt (query-cache, belege-cache) — das
      // hier faengt Unbekanntes. Logs: pm2-logrotate installieren (OPS.md),
      // sonst wachsen out/error unbegrenzt.
      max_memory_restart: '512M',
      error_file: '/opt/signifikation/logs/signifikation-error.log',
      out_file: '/opt/signifikation/logs/signifikation-out.log',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: '/opt/signifikation/app/.env',
      },
    },
  ],
}
