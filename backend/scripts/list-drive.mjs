// Lista (solo lectura) la carpeta de Drive y sus subcarpetas: nombre, tipo, fecha y si se puede leer.
// "Legible" = la cuenta de servicio pudo exportar/descargar el archivo de verdad.
import '../src/config/env.js'
import { createGoogleDriveClient, supportedMimeTypes } from '../src/rag/googleDriveClient.js'

const TYPE = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheets',
  'application/pdf': 'PDF',
}

async function probe(drive, file) {
  if (!supportedMimeTypes.has(file.mimeType)) return 'no (tipo no soportado)'
  try {
    if (file.mimeType === 'application/pdf') await drive.downloadPdf(file.id)
    else if (file.mimeType === 'application/vnd.google-apps.document') await drive.exportGoogleDoc(file.id)
    else await drive.readGoogleSheet(file.id)
    return 'sí'
  } catch (error) {
    return `no (${error?.response?.status ?? error?.code ?? 'error'})`
  }
}

const drive = createGoogleDriveClient({ retries: 0 })
const folder = await drive.getFolder()
const files = await drive.listFiles({ includeUnsupported: true })
const rows = await Promise.all(files.map(async (f) => ({
  carpeta: f.folderPath || '(raíz)',
  nombre: f.name,
  tipo: TYPE[f.mimeType] ?? f.mimeType,
  mime: f.mimeType,
  modificado: f.modifiedTime,
  legible: await probe(drive, f),
})))

console.log(`Carpeta raíz: ${folder.name}`)
console.table(rows.map(({ mime: _mime, ...r }) => r))
const count = (t) => rows.filter((r) => r.tipo === t).length
console.log(`Total: ${rows.length} | Google Doc: ${count('Google Doc')} | PDF: ${count('PDF')} | Google Sheets: ${count('Google Sheets')} | legibles: ${rows.filter((r) => r.legible === 'sí').length}`)
if (rows.length !== 11) process.exitCode = 1
