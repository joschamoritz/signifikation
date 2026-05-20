/**
 * asyncHandler – wickelt async Route-Handler so, dass geworfene Fehler
 * automatisch an `next(err)` und damit an den globalen errorHandler
 * (server/error-handling.js → sendErrorResponse) weitergereicht werden.
 *
 * Nutzung:
 *   router.get('/foo', asyncHandler(async (req, res) => {
 *     const x = await doStuff()
 *     res.json(x)
 *   }))
 *
 * Statt try/catch + serverError(res, err) in jeder Route.
 *
 * Für strukturierte Fehler (Status, Code) im Handler:
 *   throw new AppError('NOT_FOUND', 'Lemma nicht gefunden')
 * → errorHandler liefert { error, code, details? } mit passendem Status.
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export default asyncHandler
