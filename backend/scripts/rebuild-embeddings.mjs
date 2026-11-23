// npm run embeddings:rebuild — recalcula los vectores de TODAS las versiones vigentes con el proveedor
// de embeddings activo (EMBEDDINGS_PROVIDER). Úsalo al cambiar de modelo: los vectores de modelos distintos
// no son comparables. Usa --only-stale para recalcular solo las versiones cuyo modelo no coincide.
// Después de cambiar de modelo, recalibra el umbral: npm run calibrate:threshold.
import { createGoogleDriveClient } from '../src/rag/googleDriveClient.js'
import { createDriveIngestion } from '../src/rag/driveIngestion.js'
import { closeScriptPool, createScriptEmbeddings, resolveIngestIdentity, transaction } from './lib/ragScriptContext.mjs'

const onlyStale = process.argv.includes('--only-stale')
try {
  const auth = await resolveIngestIdentity()
  const embeddings = await createScriptEmbeddings()
  const ingestion = createDriveIngestion({ drive: createGoogleDriveClient(), embeddings, transaction })
  const versions = (await ingestion.listCurrentVersions(auth)).filter((version) => !onlyStale || version.embedding_model !== embeddings.model)
  const rows = []
  for (const version of versions) {
    try {
      rows.push({ codigo: version.document_code, antes: version.embedding_model, despues: embeddings.model, fragmentos: await ingestion.reembedVersion(auth, version.id) })
    } catch (error) {
      rows.push({ codigo: version.document_code, antes: version.embedding_model, error: error.message })
      process.exitCode = 1
    }
  }
  console.table(rows)
  console.log(`Versiones recalculadas: ${rows.filter((row) => !row.error).length}/${versions.length}. Recalibra el umbral si cambió el modelo.`)
} catch (error) {
  console.error(`No se pudieron recalcular los embeddings: ${error.message}`)
  process.exitCode = 1
} finally {
  await closeScriptPool()
}
