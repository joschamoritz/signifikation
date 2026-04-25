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
        CLASSROOM_EXPORT_WORKER_ENABLED: 'false',
        DOTENV_CONFIG_PATH: '/opt/signifikation/app/.env',
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
        DOTENV_CONFIG_PATH: '/opt/signifikation/app/.env',
      },
    },
  ],
}
