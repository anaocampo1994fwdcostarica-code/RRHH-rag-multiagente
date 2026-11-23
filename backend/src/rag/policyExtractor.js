// Extrae un archivo de Drive como { metadata, intro, sections } listo para chunkPolicy.
import { PDFParse } from 'pdf-parse'
import { parseMarkdownPolicy, parsePdfPolicy, parseSheetPolicy } from './policyChunker.js'

export const GOOGLE_DOC = 'application/vnd.google-apps.document'
export const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet'
export const PDF = 'application/pdf'

export async function extractPolicy(file, drive, { createPdfParser = (data) => new PDFParse({ data }) } = {}) {
  if (file.mimeType === GOOGLE_DOC) return parseMarkdownPolicy(await drive.exportGoogleDocMarkdown(file.id))
  if (file.mimeType === GOOGLE_SHEET) return parseSheetPolicy(await drive.readGoogleSheet(file.id))
  if (file.mimeType === PDF) {
    const parser = createPdfParser(await drive.downloadPdf(file.id))
    try {
      return parsePdfPolicy((await parser.getText()).text)
    } finally {
      await parser.destroy?.()
    }
  }
  throw new Error(`Tipo de archivo no soportado: ${file.mimeType}`)
}
