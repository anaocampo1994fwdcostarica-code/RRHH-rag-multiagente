// npm run ingest:drive — ingesta completa de la carpeta de Drive (incluye subcarpetas).
// Publica cada documento por el flujo editorial firmado por RRHH, archiva los que ya no están en la carpeta,
// registra la ejecución en document_sync_runs y deja guardado el startPageToken para sync:drive.
import { createGoogleDriveClient } from '../src/rag/googleDriveClient.js'
import { createDriveIngestion } from '../src/rag/driveIngestion.js'
import { closeScriptPool, createScriptEmbeddings, resolveIngestIdentity, transaction } from './lib/ragScriptContext.mjs'

const drive = createGoogleDriveClient()
const auth = await resolveIngestIdentity()
const embeddings = await createScriptEmbeddings()
const ingestion = createDriveIngestion({ drive, embeddings, transaction })

// El token se toma ANTES de listar: lo que cambie durante la ingesta lo verá el próximo sync:drive.
const startPageToken = await drive.getStartPageToken()
const runId = await ingestion.startRun(auth, 'full')
const results = []
try {
  const files = await drive.listFiles()
  for (const file of files) {
    try {
      results.push(await ingestion.ingestFile(auth, file, { note: 'Ingesta completa (npm run ingest:drive)' }))
    } catch (error) {
      results.push({ externalId: file.id, name: file.name, outcome: 'failed', error: error.message })
    }
  }

  // Documentos de Drive que ya no están en la carpeta: se archivan, no se borran.
  const seen = new Set(files.map((file) => file.id))
  const known = await transaction(auth, async (client) => (await client.query(
    `select external_id, title from public.documents where source_provider = 'google_drive' and document_status <> 'archived'`)).rows)
  for (const document of known.filter((row) => !seen.has(row.external_id))) {
    try {
      if (await ingestion.archiveByExternalId(auth, document.external_id, 'Ya no está en la carpeta de Drive')) {
        results.push({ externalId: document.external_id, name: document.title, outcome: 'archived' })
      }
    } catch (error) {
      results.push({ externalId: document.external_id, name: document.title, outcome: 'failed', error: error.message })
    }
  }

  const failed = results.some((result) => result.outcome === 'failed')
  if (!failed) await ingestion.saveStartPageToken(auth, process.env.GOOGLE_DRIVE_FOLDER_ID, startPageToken)
  await ingestion.finishRun(auth, runId, { failed, results, tokenAfter: failed ? null : startPageToken })

  console.table(results.map(({ name, code, version, chunks, outcome, status, error }) => ({ documento: name, codigo: code, version, fragmentos: chunks, resultado: outcome, estado: status ?? '', error: error ?? '' })))
  console.log(`Modelo de embeddings: ${embeddings.model}. Archivos: ${files.length}. Fallidos: ${results.filter((r) => r.outcome === 'failed').length}.`)
  if (failed) {
    console.log('Hubo fallos: el startPageToken no se actualizó para que sync:drive no los pierda.')
    process.exitCode = 1
  }
} catch (error) {
  await ingestion.finishRun(auth, runId, { failed: true, results: [...results, { name: '(ejecución)', outcome: 'failed', error: error.message }] }).catch(() => {})
  console.error(`La ingesta se detuvo: ${error.message}`)
  process.exitCode = 1
} finally {
  await closeScriptPool()
}
