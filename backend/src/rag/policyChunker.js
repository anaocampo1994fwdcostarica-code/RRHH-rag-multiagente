// Convierte un documento de política (Google Doc exportado a Markdown, texto de PDF o filas de Google Sheets)
// en metadatos + secciones numeradas, y fragmenta cada sección sin partir tablas.
// Límite por fragmento: E5 admite 512 tokens; ~1400 caracteres en español dejan margen para el encabezado.

export const MAX_CHUNK_CHARS = 1400
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const METADATA_KEYS = { 'código': 'code', 'codigo': 'code', 'versión': 'version', 'version': 'version', 'fecha de vigencia': 'effectiveFrom', 'responsable': 'owner', 'título': 'title', 'titulo': 'title' }

// --- utilidades -------------------------------------------------------------------------------

// Quita el énfasis y los escapes que agrega la exportación a Markdown de Google Docs.
export function cleanMarkdownInline(text) {
  return text.replace(/\*\*([^*]*)\*\*/g, '$1').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2').replace(/\\([\\`*_{}[\]()#+\-.!|=~>])/g, '$1')
}

/** "1 de enero de 2026" → "2026-01-01" (null si no se reconoce). */
export function parseSpanishDate(text) {
  const match = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i.exec(text ?? '')
  if (!match) return null
  const month = MONTHS.indexOf(match[2].toLowerCase())
  if (month < 0) return null
  // Rechaza fechas imposibles ("31 de febrero"), que Postgres no aceptaría.
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])))
  if (date.getUTCMonth() !== month || date.getUTCDate() !== Number(match[1])) return null
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

/** "25/12/2026" → "viernes 25 de diciembre de 2026" (el día de la semana se calcula, no se confía en la hoja). */
export function formatSheetDate(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(text).trim())
  if (!match) return null
  const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${WEEKDAYS[date.getUTCDay()]} ${day} de ${MONTHS[month - 1]} de ${year}`
}

function assignMetadata(metadata, rawKey, rawValue) {
  const key = METADATA_KEYS[cleanMarkdownInline(rawKey).trim().toLowerCase()]
  const value = cleanMarkdownInline(rawValue ?? '').trim()
  if (key === 'code' && !/^[A-Z]{2,5}(-[A-Z]{2,5})?-\d{1,3}$/.test(value)) return
  if (key && value && !metadata[key]) metadata[key] = value
}

function finishMetadata(metadata) {
  return { ...metadata, effectiveFromDate: parseSpanishDate(metadata.effectiveFrom) }
}

// --- Markdown (Google Docs) ---------------------------------------------------------------------

export function parseMarkdownPolicy(markdown) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const metadata = {}
  const intro = []
  const sections = []
  let current = null
  for (const rawLine of lines) {
    const heading = /^#{1,6}\s+(.*)$/.exec(rawLine)
    if (heading) {
      const title = cleanMarkdownInline(heading[1]).trim()
      if (/^\d+(\.\d+)*\.?\s+\S/.test(title)) {
        current = { section: title, lines: [] }
        sections.push(current)
        continue
      }
      if (!metadata.title && !current) { metadata.title = title; continue }
    }
    const row = /^\|(.*)\|\s*$/.exec(rawLine)
    if (row && !current) {
      const cells = row[1].split('|').map((cell) => cell.trim())
      if (cells.length >= 2 && !/^:?-+:?$/.test(cells[0])) assignMetadata(metadata, cells[0], cells[1])
      continue
    }
    const line = cleanMarkdownInline(rawLine).replace(/\s+$/, '')
    ;(current ? current.lines : intro).push(line)
  }
  return { metadata: finishMetadata(metadata), intro: intro.join('\n').trim(), sections: sections.map(toSection) }
}

// --- PDF ------------------------------------------------------------------------------------------

// Pies de página: "Empresa · Documento · Código · Versión · Vigente desde el 1 de enero" + "de 2026" en otra línea.
const PDF_NOISE = [/^--\s*\d+\s+of\s+\d+\s*--$/i, /·.*Vigente desde/i, /^(de\s+)?\d{4}$/i]

export function parsePdfPolicy(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/\s+$/, '')).filter((line) => !PDF_NOISE.some((pattern) => pattern.test(line.trim())))
  const metadata = {}
  const intro = []
  const sections = []
  let current = null
  let expected = 1
  let lastKey = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { (current ? current.lines : intro).push(''); continue }
    // Encabezado: "N. Título", corto y en orden (evita confundir listas numeradas con secciones).
    const heading = /^(\d+)\.\s+(\S.{0,90})$/.exec(trimmed)
    if (heading && Number(heading[1]) === expected && !/[.:;,]$/.test(trimmed)) {
      current = { section: trimmed, lines: [] }
      sections.push(current)
      expected += 1
      continue
    }
    if (!current) {
      // El título es la línea después del nombre de la empresa y antes del primer metadato
      // (puede empezar por "Código de…", como el Código de Conducta).
      if (!metadata.title && intro.length === 1 && Object.keys(metadata).length === 0) { metadata.title = trimmed; continue }
      const meta =/^(Código|Versión|Fecha de vigencia|Responsable|Aprobado por|Próxima revisión)\s+(.+)$/.exec(trimmed)
      if (meta) { assignMetadata(metadata, meta[1], meta[2]); lastKey = METADATA_KEYS[meta[1].toLowerCase()] ?? null; continue }
      // Valor de metadato que continúa en la línea siguiente (p. ej. Responsable en dos líneas).
      if (lastKey === 'owner' && metadata.owner && !/[.]$/.test(metadata.owner) && !/^Documento ficticio/.test(trimmed)) { metadata.owner += ` ${trimmed}`; continue }
      lastKey = null
      if (!metadata.title && intro.length >= 1 && !/S\.A\.$/.test(trimmed)) { metadata.title = trimmed; continue }
      intro.push(trimmed)
      continue
    }
    current.lines.push(line)
  }
  return { metadata: finishMetadata(metadata), intro: intro.join('\n').trim(), sections: sections.map(toSection) }
}

// --- Google Sheets ---------------------------------------------------------------------------------

/** Convierte una fila en texto legible: "Feriado: Navidad. Fecha: viernes 25 de diciembre de 2026. Tipo de pago: …". */
export function sheetRowToText(headers, row) {
  const cells = headers.map((header, index) => ({ header: String(header ?? '').trim(), raw: String(row[index] ?? '').trim() })).filter((cell) => cell.header && cell.raw)
  const hasDate = cells.some((cell) => formatSheetDate(cell.raw))
  const parts = cells
    .filter((cell) => !(hasDate && /^d[ií]a$/i.test(cell.header))) // el día de la semana ya va dentro de la fecha
    .map((cell) => ({ ...cell, value: formatSheetDate(cell.raw) ?? cell.raw, isDate: Boolean(formatSheetDate(cell.raw)) }))
  const leadIndex = parts.findIndex((part) => !part.isDate)
  if (leadIndex > 0) parts.unshift(...parts.splice(leadIndex, 1))
  return parts.map((part) => `${part.header}: ${part.value.replace(/\.$/, '')}.`).join(' ')
}

export function parseSheetPolicy(tabs) {
  const metadata = {}
  const sections = []
  for (const tab of tabs) {
    const rows = (tab.rows ?? []).filter((row) => row.some((cell) => String(cell ?? '').trim()))
    if (!rows.length) continue
    if (/^informaci[oó]n$/i.test(tab.section)) {
      for (const [key, value] of rows) assignMetadata(metadata, String(key ?? ''), String(value ?? ''))
      sections.push({ section: tab.section, text: rows.map(([key, value]) => `${key}: ${value ?? ''}`.trim()).join('\n'), rows: null })
      continue
    }
    const [headers, ...body] = rows
    sections.push({ section: tab.section, text: body.map((row) => sheetRowToText(headers, row)).join('\n'), rows: body.length })
  }
  return { metadata: finishMetadata(metadata), intro: '', sections }
}

// --- Fragmentación ----------------------------------------------------------------------------------

function toSection(section) {
  return { section: section.section, text: section.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() }
}

// Bloques indivisibles: párrafos separados por línea en blanco; una tabla Markdown completa es un solo bloque.
function blocksOf(text) {
  const blocks = []
  let buffer = []
  let inTable = false
  const flush = () => { if (buffer.join('').trim()) blocks.push(buffer.join('\n').trim()); buffer = [] }
  for (const line of text.split('\n')) {
    const isTableLine = /^\s*\|/.test(line)
    if (isTableLine !== inTable) { flush(); inTable = isTableLine }
    if (!isTableLine && !line.trim()) { flush(); continue }
    buffer.push(line)
  }
  flush()
  return blocks
}

// Una línea de texto más larga que el límite se parte por frases (y, si aun así no cabe, por palabras).
function splitLongLine(line, max) {
  if (line.length <= max) return [line]
  const pieces = []
  let current = ''
  for (const sentence of line.match(/[^.!?]+[.!?]*\s*/g) ?? [line]) {
    for (const part of sentence.length > max ? sentence.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) ?? [sentence] : [sentence]) {
      if (current && (current + part).length > max) { pieces.push(current.trim()); current = '' }
      current += part
    }
  }
  if (current.trim()) pieces.push(current.trim())
  return pieces
}

// Divide un bloque demasiado grande por líneas (las tablas se parten por filas y repiten el encabezado).
function splitOversized(block, max) {
  const lines = block.split('\n').flatMap((line) => (/^\s*\|/.test(line) ? [line] : splitLongLine(line, max)))
  const isTable = /^\s*\|/.test(lines[0])
  const header = isTable && lines.length > 2 && /^\s*\|\s*:?-/.test(lines[1]) ? lines.slice(0, 2) : []
  const body = header.length ? lines.slice(2) : lines
  const pieces = []
  let current = [...header]
  for (const line of body) {
    if (current.length > header.length && [...current, line].join('\n').length > max) { pieces.push(current.join('\n')); current = [...header] }
    current.push(line)
  }
  if (current.length > header.length) pieces.push(current.join('\n'))
  return pieces
}

/**
 * Fragmenta las secciones. Cada fragmento lleva un encabezado con documento, código y sección para que
 * el embedding y el LLM sepan de dónde viene, y conserva section y metadatos para la cita.
 */
export function chunkPolicy({ metadata, intro, sections }, { maxChars = MAX_CHUNK_CHARS, fallbackTitle = '' } = {}) {
  const title = metadata.title || fallbackTitle
  const headerFor = (section) => `${title}${metadata.code ? ` (${metadata.code})` : ''} — ${section}`
  const chunks = []
  const infoLines = [
    metadata.code && `Código: ${metadata.code}`, metadata.version && `Versión: ${metadata.version}`,
    metadata.effectiveFrom && `Fecha de vigencia: ${metadata.effectiveFrom}`, metadata.owner && `Responsable: ${metadata.owner}`,
  ].filter(Boolean)
  const all = [
    ...(infoLines.length || intro ? [{ section: 'Información del documento', text: [infoLines.join('\n'), intro].filter(Boolean).join('\n\n') }] : []),
    ...sections.filter((section) => section.text),
  ]
  for (const section of all) {
    const header = headerFor(section.section)
    const budget = Math.max(200, maxChars - header.length - 2)
    let current = []
    const push = () => { if (current.length) chunks.push({ section: section.section, content: `${header}\n\n${current.join('\n\n')}` }); current = [] }
    for (const block of blocksOf(section.text).flatMap((block) => (block.length > budget ? splitOversized(block, budget) : [block]))) {
      if (current.length && [...current, block].join('\n\n').length > budget) push()
      current.push(block)
    }
    push()
  }
  return chunks.map((chunk, index) => ({ ...chunk, index }))
}
