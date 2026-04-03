/**
 * error-handling.js – Strukturiertes Error Handling mit Kategorisierung
 *
 * Zentrale Error-Kategorisierung und strukturiertes Response-Handling.
 * Hilft bei Debugging und ermöglicht differentielle Error-Responses.
 */

import logger from './logger.js'

// Error-Kategorien mit HTTP-Status und standardisierten Messages
export const ErrorCategory = {
  // Client Errors (4xx)
  VALIDATION_ERROR: {
    status: 400,
    code: 'VALIDATION_ERROR',
    message: 'Ungültige Eingabedaten',
  },
  NOT_FOUND: {
    status: 404,
    code: 'NOT_FOUND',
    message: 'Ressource nicht gefunden',
  },
  UNAUTHORIZED: {
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'Authentifizierung erforderlich',
  },
  FORBIDDEN: {
    status: 403,
    code: 'FORBIDDEN',
    message: 'Zugriff verweigert',
  },
  CONFLICT: {
    status: 409,
    code: 'CONFLICT',
    message: 'Konflikt mit existierenden Daten',
  },
  RATE_LIMIT: {
    status: 429,
    code: 'RATE_LIMIT',
    message: 'Zu viele Anfragen, bitte später versuchen',
  },

  // Server Errors (5xx)
  DATABASE_ERROR: {
    status: 500,
    code: 'DATABASE_ERROR',
    message: 'Datenbankfehler',
  },
  FILE_IO_ERROR: {
    status: 500,
    code: 'FILE_IO_ERROR',
    message: 'Fehler beim Dateizugriff',
  },
  INTERNAL_ERROR: {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Interner Serverfehler',
  },
  SERVICE_UNAVAILABLE: {
    status: 503,
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service nicht verfügbar',
  },
}

/**
 * Strukturierter Error mit Kategorie, Context, und optionalen Details.
 */
export class AppError extends Error {
  constructor(category, message = null, context = {}) {
    const cat = ErrorCategory[category] || ErrorCategory.INTERNAL_ERROR
    super(message || cat.message)
    this.category = category
    this.status = cat.status
    this.code = cat.code
    this.context = context
  }
}

/**
 * Kategorisiert einen beliebigen Error aufgrund von Exception-Typ und Message.
 * @param {Error} err – Error-Objekt
 * @returns {string} – ErrorCategory key (z.B. 'DATABASE_ERROR')
 */
export function categorizeError(err) {
  if (err instanceof AppError) return err.category

  const msg = err.message?.toLowerCase() || ''

  // Database Errors
  if (msg.includes('sqlite') || msg.includes('database') || msg.includes('sql')) {
    return 'DATABASE_ERROR'
  }

  // File I/O Errors
  if (msg.includes('enoent') || msg.includes('file') || msg.includes('permission denied')) {
    return 'FILE_IO_ERROR'
  }

  // Validation Errors
  if (msg.includes('validation') || msg.includes('invalid')) {
    return 'VALIDATION_ERROR'
  }

  // Default: Internal Error
  return 'INTERNAL_ERROR'
}

/**
 * Sendet standardisierten Error-Response.
 * @param {Response} res – Express response object
 * @param {AppError|Error} err – Error-Objekt
 * @param {Object} reqContext – Zusätzliche Request-Context (IP, path, user, etc.)
 */
export function sendErrorResponse(res, err, reqContext = {}) {
  const isAppError = err instanceof AppError
  const category = isAppError ? err.category : categorizeError(err)
  const cat = ErrorCategory[category] || ErrorCategory.INTERNAL_ERROR

  // Strukturierte Log-Ausgabe
  const logContext = {
    code: cat.code,
    category,
    message: err.message,
    ...reqContext,
  }

  // Production: keine sensitiven Details sichtbar machen
  const isProduction = process.env.NODE_ENV === 'production'
  const isAdmin = reqContext.path?.startsWith('/admin') === true

  if (cat.status >= 500) {
    logger.error(logContext, `${cat.code}: ${err.message}`)
    if (err.stack) logger.debug({ stack: err.stack }, 'Error Stack')
  } else if (cat.status >= 400) {
    logger.warn(logContext, `${cat.code}: ${err.message}`)
  }

  // Response: Admin sieht Details, Clients nicht
  const response = {
    error: cat.message,
    code: cat.code,
  }

  if (!isProduction || isAdmin) {
    response.details = err.message
  }

  res.status(cat.status).json(response)
}

/**
 * Express Error Handler Middleware.
 * Sollte als letztes Middleware registriert werden (nach allen Routes).
 */
export function errorHandler(err, req, res, _next) {
  const reqContext = {
    method: req.method,
    path: req.path,
    ip: req.ip,
    id: req.id,
  }

  sendErrorResponse(res, err, reqContext)
}
