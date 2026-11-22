const allowedHosts = new Set(['drive.google.com', 'docs.google.com'])

/** Solo https y dominios de Google Drive / Docs. */
export function isSafeCitationUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && allowedHosts.has(url.hostname)
  } catch {
    return false
  }
}
