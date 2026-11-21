// Ejecuta la ingesta completa o incremental e imprime el resumen por documento.
import { createGoogleDriveClient } from '../../src/rag/googleDriveClient.js'
import { createDriveIngestion } from '../../src/rag/driveIngestion.js'
import { createDriveSync } from '../../src/rag/driveSync.js'
import { closeScriptPool, createScriptEmbeddings, resolveIngestIdentity, transaction } from './ragScriptContext.mjs'

export async function runDriveSync(kind) {
  try {
    const drive = createGoogleDriveClient()
    const auth = await resolveIngestIdentity()
    const embeddings = await createScriptEmbeddings()
    const ingestion = createDriveIngestion({ drive, embeddings, transaction })
    const sync = createDriveSync({ drive, ingestion, transaction, folderId: process.env.GOOGLE_DRIVE_FOLDER_ID, allowMassArchive: process.argv.includes('--allow-mass-archive') })
    const report = await sync[kind](auth)

    console.log(`[${new Date().toISOString()}] ${report.kind === 'full' ? 'Ingesta completa' : `Sincronización incremental (${report.changesSeen} cambios en Drive)`} · modelo ${embeddings.model}`)
    if (report.results.length) {
      console.table(report.results.map(({ name, previousName, code, version, chunks, outcome, status, reason, error }) => ({
        documento: previousName ? `${previousName} → ${name}` : name, codigo: code ?? '', version: version ?? '', fragmentos: chunks ?? '',
        resultado: outcome, estado: status ?? (outcome === 'archived' ? 'archived' : ''), detalle: error ?? reason ?? '',
      })))
    } else {
      console.log('Sin cambios en la carpeta.')
    }
    console.log(report.tokenSaved ? 'startPageToken actualizado.' : 'startPageToken NO actualizado (hubo fallos o no había token nuevo).')
    if (report.failed) process.exitCode = 1
  } catch (error) {
    console.error(`[${new Date().toISOString()}] La sincronización se detuvo: ${error.message}`)
    process.exitCode = 1
  } finally {
    await closeScriptPool()
  }
}
