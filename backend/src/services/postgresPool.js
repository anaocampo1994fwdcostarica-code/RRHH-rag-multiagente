import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { getDatabaseConfig } from '../config/env.js'

const { Pool } = pg
const sslUrlParameters = ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslpassword', 'uselibpqcompat']
const applicationDatabaseUser = 'rrhh_api'

let poolPromise

function sanitizeDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl)
  const databaseUser = decodeURIComponent(url.username).split('.')[0]
  if (databaseUser !== applicationDatabaseUser) {
    throw new Error('DATABASE_URL must use the dedicated rrhh_api database user.')
  }

  for (const parameter of sslUrlParameters) {
    url.searchParams.delete(parameter)
  }

  return url
}

function validateCaCertificate(certificateAuthority) {
  if (typeof certificateAuthority !== 'string'
    || !certificateAuthority.includes('-----BEGIN CERTIFICATE-----')
    || !certificateAuthority.includes('-----END CERTIFICATE-----')) {
    throw new Error('DATABASE_SSL_CA_FILE must contain a PEM certificate.')
  }
}

export async function createPostgresPool({
  databaseConfig = getDatabaseConfig(),
  readCaFile = readFile,
  PoolConstructor = Pool,
} = {}) {
  const url = sanitizeDatabaseUrl(databaseConfig.url)
  const certificateAuthority = await readCaFile(databaseConfig.sslCaFile, 'utf8')
  validateCaCertificate(certificateAuthority)

  return new PoolConstructor({
    connectionString: url.toString(),
    ssl: {
      ca: certificateAuthority,
      rejectUnauthorized: true,
      servername: url.hostname,
    },
  })
}

export function getPostgresPool() {
  if (!poolPromise) {
    poolPromise = createPostgresPool().catch((error) => {
      poolPromise = undefined
      throw error
    })
  }

  return poolPromise
}
