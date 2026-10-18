import { appSql, isUuid } from '@/server/db/client'
import type { OrgSummary } from '@/server/context'

const SLUG = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/

/** Organização activa pelo slug público (função SECURITY DEFINER: sem expor outras colunas nem tenants). */
export async function getPublicOrg(slug: string): Promise<OrgSummary | null> {
  if (!SLUG.test(slug)) return null
  const [row] = await appSql()<OrgSummary[]>`select * from public_org_by_slug(${slug})`
  return row && isUuid(row.id) ? row : null
}
