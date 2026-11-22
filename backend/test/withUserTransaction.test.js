import assert from 'node:assert/strict'
import test from 'node:test'
import { createVerifiedAuthIdentity } from '../src/security/authIdentity.js'
import { createPostgresPool } from '../src/services/postgresPool.js'
import { TRANSACTION_SETUP_SQL, withUserTransaction } from '../src/services/withUserTransaction.js'

const userA = createVerifiedAuthIdentity({ userId: '11111111-1111-4111-8111-111111111111', role: 'authenticated' })
const userB = createVerifiedAuthIdentity({ userId: '22222222-2222-4222-8222-222222222222', role: 'authenticated' })

function createDatabaseDouble({ failures = {} } = {}) {
  const queries = []
  let releaseCount = 0
  const client = {
    async query(text, values = []) {
      queries.push({ text, values })
      if (failures[text]) throw failures[text]
      return { rows: [], rowCount: 0 }
    },
    release() {
      releaseCount += 1
    },
  }

  return {
    client,
    queries,
    get releaseCount() {
      return releaseCount
    },
    getPool: async () => ({ connect: async () => client }),
  }
}

test('commits a successful RLS transaction after claims and role initialization', async () => {
  const database = createDatabaseDouble()
  const result = await withUserTransaction(userA, async (queryClient) => {
    await queryClient.query('select $1::text', ['safe value'])
    return 'done'
  }, database)

  assert.equal(result, 'done')
  assert.deepEqual(database.queries.map(({ text }) => text), [
    'BEGIN',
    TRANSACTION_SETUP_SQL,
    'select $1::text',
    'COMMIT',
  ])
  assert.deepEqual(JSON.parse(database.queries[1].values[0]), {
    sub: userA.userId,
    role: 'authenticated',
    aud: 'authenticated',
  })
  assert.equal(database.queries[1].values[1], userA.userId)
  assert.ok(TRANSACTION_SETUP_SQL.includes("set_config('role', 'authenticated', true)"))
  assert.equal(database.releaseCount, 1)
})

test('rolls back a successful read-only integration transaction when requested', async () => {
  const database = createDatabaseDouble()
  const result = await withUserTransaction(userA, async (queryClient) => {
    await queryClient.query('select $1::text', ['read only'])
    return 'read result'
  }, { ...database, completion: 'rollback' })

  assert.equal(result, 'read result')
  assert.deepEqual(database.queries.map(({ text }) => text).slice(-1), ['ROLLBACK'])
  assert.equal(database.releaseCount, 1)
})

test('rolls back and releases the client when the callback fails', async () => {
  const database = createDatabaseDouble()
  const expectedError = new Error('callback failed')

  await assert.rejects(
    () => withUserTransaction(userA, async () => { throw expectedError }, database),
    expectedError,
  )

  assert.deepEqual(database.queries.map(({ text }) => text).slice(-1), ['ROLLBACK'])
  assert.equal(database.releaseCount, 1)
})

test('releases the client when BEGIN fails without issuing rollback', async () => {
  const beginError = new Error('begin failed')
  const database = createDatabaseDouble({ failures: { BEGIN: beginError } })

  await assert.rejects(() => withUserTransaction(userA, async () => undefined, database), beginError)
  assert.deepEqual(database.queries.map(({ text }) => text), ['BEGIN'])
  assert.equal(database.releaseCount, 1)
})

test('rolls back when COMMIT fails and preserves the commit error', async () => {
  const commitError = new Error('commit failed')
  const database = createDatabaseDouble({ failures: { COMMIT: commitError } })

  await assert.rejects(() => withUserTransaction(userA, async () => undefined, database), commitError)
  assert.deepEqual(database.queries.map(({ text }) => text).slice(-2), ['COMMIT', 'ROLLBACK'])
  assert.equal(database.releaseCount, 1)
})

test('preserves the original error when rollback also fails', async () => {
  const callbackError = new Error('callback failed')
  const rollbackError = new Error('rollback failed')
  const database = createDatabaseDouble({ failures: { ROLLBACK: rollbackError } })

  await assert.rejects(async () => {
    try {
      await withUserTransaction(userA, async () => { throw callbackError }, database)
    } catch (error) {
      assert.equal(error, callbackError)
      assert.equal(error.rollbackError, rollbackError)
      throw error
    }
  }, callbackError)
  assert.equal(database.releaseCount, 1)
})

test('rejects unverified identities before acquiring a database client', async () => {
  let getPoolCalls = 0
  await assert.rejects(
    () => withUserTransaction({ userId: userA.userId, role: 'authenticated' }, async () => undefined, {
      getPool: async () => { getPoolCalls += 1 },
    }),
    /requires an identity created by requireAuth/,
  )
  assert.equal(getPoolCalls, 0)
})

test('does not leak claims between transactions that reuse a client', async () => {
  const database = createDatabaseDouble()
  await withUserTransaction(userA, async () => undefined, database)
  await withUserTransaction(userB, async () => undefined, database)

  const claimsQueries = database.queries.filter(({ text }) => text === TRANSACTION_SETUP_SQL)
  assert.equal(claimsQueries.length, 2)
  assert.equal(JSON.parse(claimsQueries[0].values[0]).sub, userA.userId)
  assert.equal(JSON.parse(claimsQueries[1].values[0]).sub, userB.userId)
})

test('does not let callbacks control transaction state or role configuration', async () => {
  const database = createDatabaseDouble()
  await assert.rejects(
    () => withUserTransaction(userA, async (queryClient) => queryClient.query('SET ROLE service_role'), database),
    /managed by the RLS transaction wrapper/,
  )
  assert.deepEqual(database.queries.map(({ text }) => text).slice(-1), ['ROLLBACK'])
})

test('creates a TLS-verified pool after removing URL SSL overrides', async () => {
  let capturedConfig
  class PoolDouble {
    constructor(config) {
      capturedConfig = config
    }
  }
  const certificateAuthority = '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----'

  await createPostgresPool({
    databaseConfig: {
        url: 'postgresql://rrhh_api:placeholder@db.example.test:5432/postgres?sslmode=require&sslrootcert=unsafe',
      sslCaFile: 'C:/outside/repository/ca.crt',
    },
    readCaFile: async () => certificateAuthority,
    PoolConstructor: PoolDouble,
  })

  const sanitizedUrl = new URL(capturedConfig.connectionString)
  assert.equal(sanitizedUrl.search, '')
  assert.equal(capturedConfig.ssl.ca, certificateAuthority)
  assert.equal(capturedConfig.ssl.rejectUnauthorized, true)
  assert.equal(capturedConfig.ssl.servername, 'db.example.test')
})

test('rejects every database connection user other than rrhh_api', async () => {
  for (const user of ['postgres', 'service_role', 'supabase_admin', 'authenticated']) {
    await assert.rejects(
      () => createPostgresPool({
        databaseConfig: {
          url: `postgresql://${user}:placeholder@db.example.test:5432/postgres`,
          sslCaFile: 'C:/outside/repository/ca.crt',
        },
        readCaFile: async () => '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----',
      }),
      /dedicated rrhh_api database user/,
    )
  }
})
