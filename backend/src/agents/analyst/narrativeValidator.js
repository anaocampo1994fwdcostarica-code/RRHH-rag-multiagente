// Validador del resumen ejecutivo: rechaza el texto si menciona cualquier número que no esté en el JSON
// que recibió el LLM, o si incumple el formato (3 a 5 frases, sin listas, sin personas, sin enlaces).
// Puro y sin red: se prueba con node --test.
//
// - Las cifras permitidas son SOLO los valores numéricos del JSON. Las partes de una fecha (día, mes, año)
//   no se agregan como cifras sueltas: una fecha del JSON solo se acepta escrita como fecha completa
//   ("21 de noviembre", "21 de noviembre de 2026", "21/11", "2026-11-21") y se quita antes de contar números.
// - El prompt exige dígitos: cualquier número escrito con palabras se rechaza (number_words). "uno" ("uno de los")
//   y "ambos/ambas" no se incluyen: son pronombres frecuentes y no afirman una cifra nueva.

const NUMBER_WORDS = new Set([
  'cero', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece',
  'catorce', 'quince', 'dieciséis', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintiún',
  'veintidós', 'veintidos', 'veintitrés', 'veintitres', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintiseis',
  'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa',
  'cien', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos',
  'novecientos', 'mil', 'millón', 'millon', 'millones', 'doble', 'triple', 'cuádruple', 'mitad', 'docena', 'decena', 'centenar',
  'ningún', 'ningun', 'ninguna', 'ninguno',
])
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const NARRATIVE_LIMITS = Object.freeze({ minSentences: 3, maxSentences: 5, maxLength: 900 })

function collectAllowed(value, acc) {
  if (value === null || value === undefined) return
  if (typeof value === 'number' && Number.isFinite(value)) { acc.numbers.add(value); return }
  if (typeof value === 'string') {
    const date = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (date) { acc.dates.push({ year: Number(date[1]), month: Number(date[2]), day: Number(date[3]) }); return }
    // Códigos de documento (POL-RH-05): se permiten como unidad y sus dígitos no cuentan como cifra.
    if (/^[A-Z]{2,}(?:-[A-Z0-9]+)+$/.test(value)) acc.codes.add(value)
    return
  }
  if (Array.isArray(value)) { for (const item of value) collectAllowed(item, acc); return }
  if (typeof value === 'object') for (const item of Object.values(value)) collectAllowed(item, acc)
}

function stripAllowedDates(text, dates) {
  // Primero las fechas completas de TODAS las fechas permitidas y al final "mes de año": si no, quitar
  // "noviembre de 2026" de una fecha dejaría suelto el día de otra ("21 de noviembre de 2026").
  const full = []
  const monthYear = []
  for (const { year, month, day } of dates) {
    const monthName = MONTHS[month - 1]
    const mm = String(month).padStart(2, '0')
    const dd = String(day).padStart(2, '0')
    full.push(
      new RegExp(`\\b0?${day}\\s+de\\s+${monthName}(?:\\s+(?:de|del)\\s+${year})?\\b`, 'giu'),
      new RegExp(`\\b${year}-${mm}-${dd}\\b`, 'g'),
      new RegExp(`\\b0?${day}/0?${month}(?:/${year})?\\b`, 'g'),
    )
    monthYear.push(new RegExp(`\\b${monthName}\\s+(?:de|del)\\s+${year}\\b`, 'giu'))
  }
  return [...full, ...monthYear].reduce((cleaned, pattern) => cleaned.replace(pattern, ' '), text)
}

function parseNumberToken(token) {
  if (/^\d{1,3}(?:[. ]\d{3})+$/.test(token)) return Number(token.replace(/[. ]/g, '')) // 1.234 / 1 234
  return Number(token.replace(',', '.'))
}

export function extractNumbers(text, { codes = [] } = {}) {
  let cleaned = String(text)
  for (const code of codes) cleaned = cleaned.split(code).join(' ')
  return [...cleaned.matchAll(/\d{1,3}(?:[. ]\d{3})+(?![\d,])|\d+(?:[.,]\d+)?/g)].map((match) => ({ token: match[0], value: parseNumberToken(match[0]) }))
}

export function findNumberWords(text) {
  return [...String(text).toLowerCase().matchAll(/\p{L}+/gu)].map((match) => match[0]).filter((word) => NUMBER_WORDS.has(word))
}

export function countSentences(text) {
  // Un punto seguido de dígito (3.7) no cierra la frase.
  return String(text).trim().split(/(?<=[.!?])\s+(?=\S)/).filter((part) => part.trim().length > 0).length
}

export function validateNarrative(text, metrics, { personIdentifiers = [] } = {}) {
  const narrative = typeof text === 'string' ? text.trim() : ''
  if (!narrative) return { ok: false, reason: 'empty' }
  if (narrative.length > NARRATIVE_LIMITS.maxLength) return { ok: false, reason: 'too_long' }
  if (/(^|\n)\s*([-*•#>]|\d+[.)])\s|\*\*|\||```|[{}[\]<>]/.test(narrative)) return { ok: false, reason: 'format' }
  if (/https?:\/\/|www\.|\S+@\S+\.\w/i.test(narrative)) return { ok: false, reason: 'link_or_email' }
  const sentences = countSentences(narrative)
  if (sentences < NARRATIVE_LIMITS.minSentences || sentences > NARRATIVE_LIMITS.maxSentences) {
    return { ok: false, reason: 'sentence_count', sentences }
  }
  const lowered = narrative.toLowerCase()
  const person = personIdentifiers.find((identifier) => lowered.includes(String(identifier).toLowerCase()))
  if (person || /\b(DEMO|RLS-TEST)-[\w-]+/i.test(narrative)) return { ok: false, reason: 'person_identifier' }

  const words = findNumberWords(narrative)
  if (words.length) return { ok: false, reason: 'number_words', offending: words }

  const acc = { numbers: new Set(), dates: [], codes: new Set() }
  collectAllowed(metrics, acc)
  const offending = extractNumbers(stripAllowedDates(narrative, acc.dates), { codes: [...acc.codes] })
    .filter(({ value }) => !Number.isFinite(value) || !acc.numbers.has(value))
    .map(({ token }) => token)
  if (offending.length) return { ok: false, reason: 'unknown_numbers', offending }
  return { ok: true }
}
