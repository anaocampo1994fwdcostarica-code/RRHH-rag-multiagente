// npm run sync:drive — sincronización diaria con changes.list desde el startPageToken guardado.
// Nuevos y editados: se reindexan (solo ese documento, con una versión nueva). Renombrados: se actualiza el título.
// Eliminados o movidos fuera de la carpeta: se archivan, no se borran. Cada ejecución queda en document_sync_runs.
// Si no hay token guardado, hace la ingesta completa.
import { runDriveSync } from './lib/runDriveSync.mjs'

await runDriveSync('incremental')
