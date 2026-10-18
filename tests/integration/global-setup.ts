import postgres from 'postgres'
import { migrate } from '../../scripts/migrate'
import { TEST_ADMIN_URL, TEST_APP_PASSWORD, TEST_APP_URL, TEST_DB } from './env'

/** Recria a base de dados de teste e aplica as migrações reais. */
export default async function setup(): Promise<void> {
  const maintenance = new URL(TEST_ADMIN_URL)
  maintenance.pathname = '/postgres'
  const sql = postgres(maintenance.toString(), { max: 1, onnotice: () => undefined })
  try {
    await sql.unsafe(`drop database if exists ${TEST_DB} with (force)`)
    await sql.unsafe(`create database ${TEST_DB}`)
    const [role] = await sql`select 1 from pg_roles where rolname = 'agoramoz_app'`
    if (!role) await sql.unsafe(`create role agoramoz_app login password '${TEST_APP_PASSWORD.replaceAll("'", "''")}' nosuperuser nobypassrls`)
  } finally {
    await sql.end()
  }
  await migrate(TEST_ADMIN_URL, () => undefined)
  process.env.TEST_APP_URL = TEST_APP_URL
}
