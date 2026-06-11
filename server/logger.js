import pino from 'pino'

const IS_PROD = process.env.NODE_ENV === 'production'

const logger = pino({
  level: process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
  // Defense-in-Depth: verhindert, dass kuenftige Log-Aufrufe versehentlich
  // Credentials/Cookies/Tokens im Klartext schreiben (z.B. logger.info({req})).
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.secret',
      '*.authorization',
      '*.cookie',
    ],
    censor: '[Redacted]',
  },
  ...(IS_PROD
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
})

export default logger
