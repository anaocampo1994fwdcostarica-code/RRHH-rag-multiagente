export function getRouteAccess(status, user) {
  if (status === 'loading') return 'loading'
  return user ? 'allow' : 'redirect-login'
}
