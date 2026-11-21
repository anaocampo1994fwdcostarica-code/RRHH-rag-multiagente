import { google } from 'googleapis'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export const supportedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
])

function required(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}.`)
  return value.trim()
}

export function createGoogleDriveClient({
  clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL,
  privateKey = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY,
  folderId = process.env.GOOGLE_DRIVE_FOLDER_ID,
  googleApi = google,
  retries = 2,
} = {}) {
  let drive
  let sheets

  function clients() {
    if (drive) return { drive, sheets }
    const auth = new googleApi.auth.JWT({
      email: required(clientEmail, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL'),
      key: required(privateKey, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    drive = googleApi.drive({ version: 'v3', auth })
    sheets = googleApi.sheets({ version: 'v4', auth })
    return { drive, sheets }
  }

  async function retry(operation) {
    let failure
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try { return await operation() } catch (error) { failure = error }
    }
    throw failure
  }

  return {
    // Recorre la carpeta y sus subcarpetas (BFS). Cada archivo lleva folderPath con la subcarpeta de origen.
    async listFiles({ recursive = true, includeUnsupported = false } = {}) {
      const rootId = required(folderId, 'GOOGLE_DRIVE_FOLDER_ID')
      const files = []
      const queue = [{ id: rootId, path: '' }]
      const visited = new Set()
      while (queue.length) {
        const folder = queue.shift()
        if (visited.has(folder.id)) continue
        visited.add(folder.id)
        let pageToken
        do {
          const result = await retry(() => clients().drive.files.list({
            q: `'${folder.id.replace(/'/g, "\\'")}' in parents and trashed = false`,
            pageSize: 1000,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,trashed,parents,webViewLink,capabilities/canDownload)',
            orderBy: 'name',
          }))
          for (const file of result.data.files ?? []) {
            if (file.mimeType === FOLDER_MIME) {
              if (recursive) queue.push({ id: file.id, path: folder.path ? `${folder.path}/${file.name}` : file.name })
              continue
            }
            if (includeUnsupported || supportedMimeTypes.has(file.mimeType)) files.push({ ...file, folderPath: folder.path })
          }
          pageToken = result.data.nextPageToken
        } while (pageToken)
      }
      return files
    },

    async getFolder() {
      const id = required(folderId, 'GOOGLE_DRIVE_FOLDER_ID')
      return (await retry(() => clients().drive.files.get({ fileId: id, fields: 'id,name,mimeType', supportsAllDrives: true }))).data
    },

    async getMetadata(id) {
      return (await retry(() => clients().drive.files.get({ fileId: id, fields: 'id,name,mimeType,modifiedTime,md5Checksum,trashed,parents,webViewLink', supportsAllDrives: true }))).data
    },

    async downloadPdf(id) {
      const result = await retry(() => clients().drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'arraybuffer' }))
      return Buffer.from(result.data)
    },

    async exportGoogleDoc(id) {
      const result = await retry(() => clients().drive.files.export({ fileId: id, mimeType: 'text/plain' }, { responseType: 'arraybuffer' }))
      return Buffer.from(result.data).toString('utf8')
    },

    async readGoogleSheet(id) {
      const { sheets: sheetsApi } = clients()
      const metadata = await retry(() => sheetsApi.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(title,index)' }))
      const tabs = metadata.data.sheets ?? []
      const sections = await Promise.all(tabs.map(async ({ properties }) => {
        const title = properties?.title
        if (!title) return null
        const result = await retry(() => sheetsApi.spreadsheets.values.get({ spreadsheetId: id, range: `'${title.replace(/'/g, "''")}'` }))
        const text = (result.data.values ?? []).map((row) => row.join('\t')).join('\n')
        return { section: title, text }
      }))
      return sections.filter(Boolean)
    },
  }
}
