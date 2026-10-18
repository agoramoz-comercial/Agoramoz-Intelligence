import postgres from 'postgres'
import { env } from '../env'

export type Sql = postgres.Sql
export type Tx = postgres.TransactionSql

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const store = globalThis as unknown as { __agoramozSql?: Sql; __agoramozAdminSql?: Sql }

function connect(url: string, max: number): Sql {
  return postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { ...postgres.camel, undefined: null },
    connection: { application_name: 'agoramoz-hr' },
    onnotice: () => undefined,
  })
}

/** Pool do papel da aplicação: a RLS aplica-se a todas as consultas. */
export function appSql(): Sql {
  store.__agoramozSql ??= connect(env().DATABASE_URL, 10)
  return store.__agoramozSql
}

/** Pool administrativo (owner): apenas migrações, seed e testes. Nunca em pedidos HTTP. */
export function adminSql(): Sql {
  const url = env().DATABASE_ADMIN_URL
  if (!url) throw new Error('DATABASE_ADMIN_URL não configurado')
  store.__agoramozAdminSql ??= connect(url, 3)
  return store.__agoramozAdminSql
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/**
 * Executa `fn` numa transacção com o tenant fixado em app.tenant_id.
 * As políticas RLS filtram todas as tabelas por esse valor, mesmo que uma consulta se esqueça do WHERE.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!isUuid(tenantId)) throw new Error('tenantId inválido')
  const result = await appSql().begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx)
  })
  return result as T
}

export async function closeDb(): Promise<void> {
  await Promise.all([store.__agoramozSql?.end({ timeout: 5 }), store.__agoramozAdminSql?.end({ timeout: 5 })])
  store.__agoramozSql = undefined
  store.__agoramozAdminSql = undefined
}
