import { google } from 'googleapis'

const supportedMimeTypes = new Set([
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
    async listFiles() {
      const activeFolderId = required(folderId, 'GOOGLE_DRIVE_FOLDER_ID')
      const files = []
      let pageToken
      do {
        const result = await retry(() => clients().drive.files.list({
          q: `'${activeFolderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
          pageSize: 1000,
          pageToken,
          fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,trashed,parents)',
          orderBy: 'modifiedTime desc',
        }))
        files.push(...(result.data.files ?? []).filter((file) => supportedMimeTypes.has(file.mimeType)))
        pageToken = result.data.nextPageToken
      } while (pageToken)
      return files
    },

    async getMetadata(id) {
      return (await retry(() => clients().drive.files.get({ fileId: id, fields: 'id,name,mimeType,modifiedTime,md5Checksum,trashed,parents' }))).data
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
