// Rota la contraseña del login rrhh_api en el proyecto Supabase de PRUEBAS.
//   node scripts/rotate-rrhh-api-password.mjs --confirm
// - Genera una contraseña aleatoria fuerte (32 bytes, base64url) que nunca se imprime.
// - Envía a la base SOLO el verificador SCRAM-SHA-256 (no la contraseña en claro), para que no quede en
//   registros de sentencias. Usa la conexión de administración del harness RLS (supabase/tests/rls/.env).
// - Verifica que rrhh_api conecta con la nueva contraseña ANTES de actualizar DATABASE_URL en
//   backend/.env y backend/.env.integration (escritura atómica). Si la verificación falla, no toca los
//   archivos y lo informa.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

if (!process.argv.includes('--confirm')) {
  console.log('Este script cambia la contraseña de rrhh_api. Ejecútalo con --confirm.')
  process.exit(1)
}

const EXPECTED_PROJECT_REF = 'bxtetlzjlgoezxcjhdrw'
const backendDir = fileURLToPath(new URL('../', import.meta.url))
const rlsEnvFile = fileURLToPath(new URL('../../supabase/tests/rls/.env', import.meta.url))
const envFiles = [`${backendDir}.env`, `${backendDir}.env.integration`]

const parseEnv = (file) => Object.fromEntries(readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')] }))

// Verificador SCRAM-SHA-256 en el formato de PostgreSQL (RFC 5802 / 7677).
function scramVerifier(password, iterations = 4096) {
  const salt = randomBytes(16)
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const clientKey = createHmac('sha256', saltedPassword).update('Client Key').digest()
  const storedKey = createHash('sha256').update(clientKey).digest()
  const serverKey = createHmac('sha256', saltedPassword).update('Server Key').digest()
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

const sslFor = (url, caFile) => ({ ca: readFileSync(caFile, 'utf8'), rejectUnauthorized: true, servername: url.hostname })
const withoutSslParams = (raw) => { const url = new URL(raw); for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(parameter); return url }

const rlsEnv = parseEnv(rlsEnvFile)
if (rlsEnv.RLS_TEST_PROJECT_REF !== EXPECTED_PROJECT_REF) throw new Error('El harness no apunta al proyecto de pruebas aprobado.')
const backendEnv = parseEnv(envFiles[0])
const currentApiUrl = withoutSslParams(backendEnv.DATABASE_URL)
if (decodeURIComponent(currentApiUrl.username) !== `rrhh_api.${EXPECTED_PROJECT_REF}` || !currentApiUrl.hostname.endsWith('.pooler.supabase.com') || currentApiUrl.port !== '5432') {
  throw new Error('DATABASE_URL de backend/.env no es el login rrhh_api del session pooler de pruebas.')
}

const password = randomBytes(32).toString('base64url')
const verifier = scramVerifier(password)

// 1. ALTER ROLE con el verificador (nunca la contraseña en claro).
const adminUrl = withoutSslParams(rlsEnv.RLS_TEST_DATABASE_URL)
const admin = new pg.Client({ connectionString: adminUrl.toString(), ssl: sslFor(adminUrl, rlsEnv.RLS_TEST_SSL_CA_FILE) })
await admin.connect()
try {
  await admin.query(`alter role rrhh_api with password ${admin.escapeLiteral(verifier)}`)
} finally {
  await admin.end()
}
console.log('1/3 Contraseña de rrhh_api cambiada (se envió solo el verificador SCRAM).')

// 2. Verificar el login con la nueva contraseña (el pooler puede tardar unos segundos en tomarla).
const newApiUrl = new URL(currentApiUrl)
newApiUrl.password = encodeURIComponent(password)
let verified = false
let lastError
for (let attempt = 1; attempt <= 6 && !verified; attempt += 1) {
  const client = new pg.Client({ connectionString: newApiUrl.toString(), ssl: sslFor(newApiUrl, backendEnv.DATABASE_SSL_CA_FILE) })
  try {
    await client.connect()
    const { rows: [row] } = await client.query('select current_user')
    verified = row.current_user === 'rrhh_api'
  } catch (error) {
    lastError = error
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
  } finally {
    await client.end().catch(() => {})
  }
}
if (!verified) {
  console.log(`2/3 ERROR: rrhh_api no conecta con la nueva contraseña (${lastError?.code ?? lastError?.message?.slice(0, 80) ?? 'sin detalle'}). No se modificaron los .env.`)
  console.log('     La contraseña anterior ya no es válida: vuelve a ejecutar el script para generar y aplicar otra.')
  process.exit(1)
}
console.log('2/3 rrhh_api conecta con la nueva contraseña.')

// 3. Actualizar DATABASE_URL en los .env locales (escritura atómica, sin imprimir valores).
for (const file of envFiles) {
  const content = readFileSync(file, 'utf8')
  const updated = content.replace(/^DATABASE_URL=(.*)$/m, (_line, value) => {
    const url = new URL(value.trim().replace(/^["']|["']$/g, ''))
    url.password = encodeURIComponent(password)
    return `DATABASE_URL=${url.toString()}`
  })
  if (updated === content) throw new Error(`No se encontró DATABASE_URL en ${file.split(/[\\/]/).pop()}.`)
  writeFileSync(`${file}.tmp`, updated)
  renameSync(`${file}.tmp`, file)
}
console.log(`3/3 DATABASE_URL actualizado en ${envFiles.map((file) => file.split(/[\\/]/).pop()).join(' y ')} (valores no mostrados).`)
