module.exports = {
  apps: [
    {
      name: 'signifikation',
      script: 'server/index.js',
      cwd: '/opt/signifikation/app',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        CLASSROOM_EXPORT_WORKER_ENABLED: 'false',
      },
    },
    {
      name: 'signifikation-worker',
      script: 'server/workers/classroomWorker.js',
      cwd: '/opt/signifikation/app',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
