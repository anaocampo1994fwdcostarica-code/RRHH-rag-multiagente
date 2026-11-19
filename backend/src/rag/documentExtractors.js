import { PDFParse } from 'pdf-parse'
import { normalizeDocumentText } from './chunking.js'

export function createDocumentExtractors({ createPdfParser = (data) => new PDFParse({ data }) } = {}) {
  return {
    async extract(file, drive) {
      if (file.mimeType === 'application/pdf') {
        const parser = createPdfParser(await drive.downloadPdf(file.id))
        try {
          const result = await parser.getText()
          return [{ section: null, text: normalizeDocumentText(result.text) }]
        } finally {
          await parser.destroy?.()
        }
      }
      if (file.mimeType === 'application/vnd.google-apps.document') {
        return [{ section: null, text: normalizeDocumentText(await drive.exportGoogleDoc(file.id)) }]
      }
      if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
        return (await drive.readGoogleSheet(file.id)).map((section) => ({ ...section, text: normalizeDocumentText(section.text) })).filter((section) => section.text)
      }
      throw new Error('Unsupported Google Drive document type.')
    },
  }
}
