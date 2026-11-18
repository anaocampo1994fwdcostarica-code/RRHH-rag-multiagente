const verifiedIdentities = new WeakSet()
const verifiedAccessTokens = new WeakMap()

export function createVerifiedAuthIdentity({ userId, role, accessToken }) {
  const identity = Object.freeze({ userId, role })
  verifiedIdentities.add(identity)

  if (accessToken !== undefined) {
    if (typeof accessToken !== 'string' || !accessToken.trim()) {
      throw new TypeError('Verified access token must be a non-empty string.')
    }
    verifiedAccessTokens.set(identity, accessToken)
  }

  return identity
}

export function isVerifiedAuthIdentity(identity) {
  return typeof identity === 'object'
    && identity !== null
    && verifiedIdentities.has(identity)
    && identity.role === 'authenticated'
}

export function getVerifiedAccessToken(identity) {
  if (!isVerifiedAuthIdentity(identity)) return undefined
  return verifiedAccessTokens.get(identity)
}
