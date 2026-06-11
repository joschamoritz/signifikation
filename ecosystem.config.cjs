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
      env: {
        NODE_ENV: 'production',
        DOTENV_CONFIG_PATH: '/opt/signifikation/app/.env',
      },
    },
  ],
}
