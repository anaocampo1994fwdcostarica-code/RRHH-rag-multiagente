import { format, isValid, parseISO } from 'date-fns'
import { es } from 'date-fns/locale/es'

export function parseDateKey(value) {
  if (!value) return undefined
  const result = typeof value === 'string' ? parseISO(value) : value
  return isValid(result) ? result : undefined
}

export function dateKey(value) {
  return value && isValid(value) ? format(value, 'yyyy-MM-dd') : ''
}

export function displayDate(value) {
  const date = parseDateKey(value)
  return date ? format(date, "d 'de' MMMM 'de' yyyy", { locale: es }) : 'Seleccionar fecha'
}
