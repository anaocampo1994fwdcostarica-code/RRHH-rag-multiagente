let accessTokenProvider = async () => undefined
let unauthorizedHandler = async () => undefined

export function configureAccessTokenProvider(provider) {
  if (typeof provider !== 'function') throw new TypeError('The access token provider must be a function.')
  accessTokenProvider = provider
}

export async function getAccessToken() {
  return accessTokenProvider()
}

export function configureUnauthorizedHandler(handler) {
  if (typeof handler !== 'function') throw new TypeError('The unauthorized handler must be a function.')
  unauthorizedHandler = handler
}

export async function handleUnauthorized() {
  return unauthorizedHandler()
}
