import type { Role } from './auth/rbac'

export interface SessionUser {
  id: string
  tenantId: string
  email: string
  fullName: string
  role: Role
  departmentId: string | null
}

export interface OrgSummary {
  id: string
  slug: string
  name: string
  sector: string | null
}

/** Contexto de um pedido autenticado: quem, em que tenant, de onde. */
export interface RequestContext {
  tenantId: string
  user: SessionUser
  ip: string | null
  userAgent: string | null
  correlationId: string
}

/** Contexto de um actor não autenticado (candidato, sistema) já associado a um tenant. */
export interface ActorContext {
  tenantId: string
  actorType: 'user' | 'candidate' | 'system'
  actorId: string | null
  ip: string | null
  userAgent: string | null
  correlationId: string
}

export function actorOf(ctx: RequestContext): ActorContext {
  return {
    tenantId: ctx.tenantId,
    actorType: 'user',
    actorId: ctx.user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    correlationId: ctx.correlationId,
  }
}

export function systemActor(tenantId: string, correlationId = 'system'): ActorContext {
  return { tenantId, actorType: 'system', actorId: null, ip: null, userAgent: null, correlationId }
}
