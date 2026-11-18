export function getCurrentAuth(request, response) {
  response.status(200).json({
    user: {
      id: request.auth.userId,
      role: request.auth.role,
    },
  })
}
