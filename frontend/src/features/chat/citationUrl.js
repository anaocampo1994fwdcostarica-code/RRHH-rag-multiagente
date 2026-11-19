export function isSafeCitationUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'drive.google.com'
  } catch {
    return false
  }
}
