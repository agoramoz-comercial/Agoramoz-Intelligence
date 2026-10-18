import type { Tx } from '../db/client'
import type { ActorContext } from '../context'

export interface AuditEntry {
  action: string
  entityType: string
  entityId?: string | null
  /** Frase legível, sem dados pessoais (nomes, emails, telefones). */
  summary: string
  /** Diferenças de campos; valores pessoais devem ser substituídos por REDACTED_VALUE. */
  changes?: Record<string, unknown>
  reason?: string | null
}

export const REDACTED_VALUE = '[dados pessoais]'
const PERSONAL_FIELDS = new Set(['fullName', 'full_name', 'email', 'phone', 'location', 'coverNote', 'answers', 'textContent', 'body'])

/** Remove valores pessoais de um objecto de alterações, mantendo o nome do campo como prova de mudança. */
export function redactPersonal(changes: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [key, PERSONAL_FIELDS.has(key) ? REDACTED_VALUE : value]),
  )
}

/**
 * Regista um evento na mesma transacção da alteração: se a alteração falhar, o evento não existe,
 * e se o registo falhar, a alteração é desfeita. A tabela é só-de-acréscimo.
 */
export async function recordAudit(tx: Tx, actor: ActorContext, entry: AuditEntry): Promise<void> {
  await tx`
    insert into audit_events (
      tenant_id, actor_type, actor_id, action, entity_type, entity_id, summary, changes, reason, ip, user_agent, correlation_id
    ) values (
      ${actor.tenantId}, ${actor.actorType}, ${actor.actorId}, ${entry.action}, ${entry.entityType}, ${entry.entityId ?? null},
      ${entry.summary}, ${tx.json(redactPersonal((entry.changes ?? {}) as Record<string, never>) as never)}, ${entry.reason ?? null},
      ${actor.ip}, ${actor.userAgent?.slice(0, 300) ?? null}, ${actor.correlationId}
    )
  `
}
