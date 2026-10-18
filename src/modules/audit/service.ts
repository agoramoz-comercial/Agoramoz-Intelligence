import { withTenant, type Tx } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { forbidden } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { toCsv } from '@/lib/csv'

export interface AuditRow {
  id: string
  occurredAt: Date
  actorType: string
  actorName: string | null
  action: string
  entityType: string
  entityId: string | null
  summary: string
  changes: Record<string, unknown>
  reason: string | null
  ip: string | null
  correlationId: string | null
}

export interface AuditFilters {
  q?: string
  action?: string
  entityType?: string
  actorId?: string
  from?: string
  to?: string
  page?: number
}

const PAGE_SIZE = 100
const DATE = /^\d{4}-\d{2}-\d{2}$/

function where(tx: Tx, filters: AuditFilters) {
  return tx`
    where true
      ${filters.action ? tx`and e.action like ${`${filters.action.replace(/[%_]/g, '')}%`}` : tx``}
      ${filters.entityType ? tx`and e.entity_type = ${filters.entityType}` : tx``}
      ${filters.actorId ? tx`and e.actor_id = ${filters.actorId}` : tx``}
      ${filters.from && DATE.test(filters.from) ? tx`and e.occurred_at >= ${filters.from}::date` : tx``}
      ${filters.to && DATE.test(filters.to) ? tx`and e.occurred_at < (${filters.to}::date + 1)` : tx``}
      ${filters.q ? tx`and (e.summary ilike ${`%${filters.q.replace(/[%_]/g, '')}%`} or e.entity_id::text = ${filters.q} or e.correlation_id = ${filters.q})` : tx``}
  `
}

export async function searchAudit(ctx: RequestContext, filters: AuditFilters): Promise<{ rows: AuditRow[]; total: number; pageSize: number; actions: string[] }> {
  if (!can(ctx.user.role, 'audit.view')) throw forbidden()
  const page = Math.max(1, filters.page ?? 1)
  return withTenant(ctx.tenantId, async (tx) => {
    const [{ total } = { total: 0 }] = await tx<{ total: number }[]>`select count(*)::int as total from audit_events e ${where(tx, filters)}`
    const rows = await tx<AuditRow[]>`
      select e.id::text, e.occurred_at, e.actor_type, u.full_name as actor_name, e.action, e.entity_type, e.entity_id, e.summary,
        e.changes, e.reason, e.ip, e.correlation_id
      from audit_events e left join users u on u.id = e.actor_id
      ${where(tx, filters)}
      order by e.occurred_at desc, e.id desc
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
    `
    const actions = (await tx<{ prefix: string }[]>`select distinct split_part(action, '.', 1) as prefix from audit_events order by 1`).map((row) => row.prefix)
    return { rows, total, pageSize: PAGE_SIZE, actions }
  })
}

const EXPORT_LIMIT = 50_000

export async function exportAuditCsv(ctx: RequestContext, filters: AuditFilters): Promise<string> {
  if (!can(ctx.user.role, 'audit.export')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx<AuditRow[]>`
      select e.id::text, e.occurred_at, e.actor_type, u.full_name as actor_name, e.action, e.entity_type, e.entity_id, e.summary,
        e.changes, e.reason, e.ip, e.correlation_id
      from audit_events e left join users u on u.id = e.actor_id
      ${where(tx, filters)}
      order by e.occurred_at desc limit ${EXPORT_LIMIT}
    `
    await recordAudit(tx, actorOf(ctx), {
      action: 'audit.exported',
      entityType: 'audit',
      summary: `Exportação de ${rows.length} evento(s) de auditoria`,
      changes: { filters: { ...filters }, rows: rows.length },
    })
    return toCsv(
      ['id', 'data_utc', 'tipo_actor', 'actor', 'accao', 'entidade', 'entidade_id', 'resumo', 'alteracoes', 'fundamento', 'ip', 'correlation_id'],
      rows.map((row) => [row.id, row.occurredAt, row.actorType, row.actorName, row.action, row.entityType, row.entityId, row.summary, row.changes, row.reason, row.ip, row.correlationId]),
    )
  })
}
