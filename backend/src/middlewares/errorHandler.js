export function errorHandler(error, _request, response, _next) {
  const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500
  const message = statusCode >= 500
    ? 'Internal server error'
    : error.message || 'Internal server error'

  response.status(statusCode).json({
    error: message,
  })
}
