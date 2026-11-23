// Aplica UNA migración en el proyecto de PRUEBAS en una sola transacción (todo o nada).
// Uso: node scripts/apply-migration.mjs ../supabase/migrations/<archivo>.sql
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { connectHarnessAdmin } from './lib/harnessAdmin.mjs'

const file = process.argv[2]
if (!file || !/^\d{14}_[a-z0-9_]+\.sql$/.test(basename(file))) throw new Error('Pasa la ruta de una migración (AAAAMMDDHHMMSS_nombre.sql).')
const sql = readFileSync(file, 'utf8')

const client = await connectHarnessAdmin()
try {
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log(`Aplicada: ${basename(file)}`)
} catch (error) {
  await client.query('rollback').catch(() => {})
  console.error(`Revertida, no se aplicó nada: ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
