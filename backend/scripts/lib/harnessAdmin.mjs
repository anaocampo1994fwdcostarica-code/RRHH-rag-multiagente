// Conexión de administrador del harness RLS, siempre verificando que apunte al proyecto de PRUEBAS.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

export const EXPECTED_PROJECT_REF = 'bxtetlzjlgoezxcjhdrw'
const rlsDir = fileURLToPath(new URL('../../../supabase/tests/rls/', import.meta.url))

export function readHarnessEnv() {
  return Object.fromEntries(readFileSync(`${rlsDir}.env`, 'utf8').split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
}

export async function connectHarnessAdmin() {
  const env = readHarnessEnv()
  if (env.RLS_TEST_PROJECT_REF !== EXPECTED_PROJECT_REF) throw new Error('El harness no apunta al proyecto de pruebas aprobado.')
  const url = new URL(env.RLS_TEST_DATABASE_URL)
  for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(parameter)
  const client = new pg.Client({ connectionString: url.toString(), ssl: { ca: readFileSync(env.RLS_TEST_SSL_CA_FILE, 'utf8'), rejectUnauthorized: true, servername: url.hostname } })
  await client.connect()
  return client
}

// Ejecuta callback como un usuario autenticado (RLS y auth.uid() reales) dentro de una transacción.
export async function asUser(client, userId, callback, { completion = 'commit' } = {}) {
  await client.query('begin')
  try {
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated' })])
    await client.query('set local role authenticated')
    const result = await callback(client)
    await client.query(completion)
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

export async function userIdByEmail(client, email) {
  const { rows } = await client.query('select id from auth.users where email = $1', [email])
  if (!rows[0]) throw new Error('Usuario de prueba no encontrado.')
  return rows[0].id
}
