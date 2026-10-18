import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'
import { TEST_ADMIN_URL, TEST_APP_URL } from './env'

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_APP_URL,
  DATABASE_ADMIN_URL: TEST_ADMIN_URL,
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-secret-0123456789abcdef0123456789abcdef',
  STORAGE_DIR: mkdtempSync(join(tmpdir(), 'agoramoz-hr-test-')),
  EMAIL_PROVIDER: 'log',
  PASSWORD_HASH_COST: '12',
  AI_ENABLED: 'false',
})

afterAll(async () => {
  const { closeDb } = await import('@/server/db/client')
  await closeDb()
})
