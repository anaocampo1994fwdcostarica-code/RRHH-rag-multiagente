export const CATEGORIES = ['Política', 'Procedimiento', 'Reglamento', 'Manual', 'Código', 'Catálogo', 'Aviso', 'Calendario']

const DRIVE_PREFIXES = ['https://docs.google.com/', 'https://drive.google.com/']

export function isDriveUrl(url) {
  return typeof url === 'string' && DRIVE_PREFIXES.some((prefix) => url.startsWith(prefix))
}

export function formatVersion(policy) {
  return policy.revision > 1 ? `${policy.version} (rev. ${policy.revision})` : String(policy.version)
}

// effectiveFrom es una fecha pura (AAAA-MM-DD): se formatea sin pasar por zona horaria.
export function formatEffectiveFrom(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  if (!match) return '—'
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
}
