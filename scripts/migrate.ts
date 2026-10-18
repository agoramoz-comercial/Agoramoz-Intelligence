/** Aplica migrações SQL de db/migrations por ordem, cada uma numa transacção, com checksum. */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import { loadEnv } from './load-env'

loadEnv()

export async function migrate(adminUrl: string, log = console.log): Promise<void> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined })
  try {
    await sql`
      create table if not exists schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `
    await sql`revoke all on schema_migrations from public`
    const applied = new Map((await sql<{ name: string; checksum: string }[]>`select name, checksum from schema_migrations`).map((row) => [row.name, row.checksum]))
    const dir = join(process.cwd(), 'db', 'migrations')
    const files = readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8')
      const checksum = createHash('sha256').update(content).digest('hex')
      const previous = applied.get(file)
      if (previous) {
        if (previous !== checksum) throw new Error(`Migração ${file} foi alterada depois de aplicada`)
        continue
      }
      await sql.begin(async (tx) => {
        await tx.unsafe(content)
        await tx`insert into schema_migrations (name, checksum) values (${file}, ${checksum})`
      })
      log(`Migração aplicada: ${file}`)
    }
  } finally {
    await sql.end()
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  const url = process.env.DATABASE_ADMIN_URL
  if (!url) {
    console.error('DATABASE_ADMIN_URL não configurado')
    process.exit(1)
  }
  migrate(url).catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
