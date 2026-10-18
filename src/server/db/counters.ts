import type { Tx } from './client'

/** Próximo número sequencial por tenant (ex.: REQ-0007), sem lacunas visíveis entre tenants. */
export async function nextCounter(tx: Tx, tenantId: string, name: string): Promise<number> {
  const [row] = await tx<{ value: string }[]>`
    insert into tenant_counters (tenant_id, name, value) values (${tenantId}, ${name}, 1)
    on conflict (tenant_id, name) do update set value = tenant_counters.value + 1
    returning value
  `
  if (!row) throw new Error('Contador indisponível')
  return Number(row.value)
}

export function formatCode(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, '0')}`
}
