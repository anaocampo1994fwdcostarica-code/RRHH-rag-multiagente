export function notFound(request, response) {
  response.status(404).json({
    error: 'Not found',
    message: `Route ${request.method} ${request.originalUrl} does not exist`,
  })
}
