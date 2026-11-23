// npm run ingest:drive — ingesta completa de la carpeta de Drive (incluye subcarpetas).
// Publica cada documento por el flujo editorial firmado por RRHH, archiva los que ya no están en la carpeta,
// registra la ejecución en document_sync_runs y deja guardado el startPageToken para sync:drive.
import { runDriveSync } from './lib/runDriveSync.mjs'

await runDriveSync('full')
