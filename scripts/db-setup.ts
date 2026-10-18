/**
 * Prepara uma base de dados local de desenvolvimento/teste:
 *   - cria o papel da aplicação (sem superuser, sem BYPASSRLS);
 *   - cria a base de dados (ou recria com --reset).
 * Em ambientes geridos (Supabase, Azure, RDS) estes passos fazem parte do provisionamento.
 */
import postgres from 'postgres'
import { loadEnv } from './load-env'

loadEnv()

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL
  const appUrl = process.env.DATABASE_URL
  if (!adminUrl || !appUrl) throw new Error('Defina DATABASE_URL e DATABASE_ADMIN_URL (ver .env.example)')

  const target = new URL(adminUrl)
  const database = target.pathname.slice(1)
  const app = new URL(appUrl)
  const appRole = decodeURIComponent(app.username)
  const appPassword = decodeURIComponent(app.password)
  if (!/^[a-z_][a-z0-9_]*$/.test(database) || !/^[a-z_][a-z0-9_]*$/.test(appRole)) {
    throw new Error('Nome de base de dados ou papel inválido')
  }

  const maintenance = new URL(adminUrl)
  maintenance.pathname = '/postgres'
  const sql = postgres(maintenance.toString(), { max: 1, onnotice: () => undefined })
  try {
    if (process.argv.includes('--reset')) {
      await sql.unsafe(`drop database if exists ${database} with (force)`)
      console.log(`Base de dados ${database} removida`)
    }
    const [role] = await sql`select 1 from pg_roles where rolname = ${appRole}`
    if (!role) {
      await sql.unsafe(`create role ${appRole} login password '${appPassword.replaceAll("'", "''")}' nosuperuser nobypassrls`)
      console.log(`Papel ${appRole} criado`)
    }
    const [db] = await sql`select 1 from pg_database where datname = ${database}`
    if (!db) {
      await sql.unsafe(`create database ${database}`)
      console.log(`Base de dados ${database} criada`)
    }
  } finally {
    await sql.end()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
