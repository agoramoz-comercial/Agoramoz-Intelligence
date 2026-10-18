import { appSql, withTenant } from '../db/client'
import { recordAudit } from '../audit/audit'
import type { SessionUser } from '../context'
import { AppError } from '../errors'
import { isRole } from './rbac'
import { dummyPasswordHash, verifyPassword } from './password'
import { hashToken, randomToken } from './tokens'
import type { RequestMeta } from '../http/request-meta'

export const SESSION_TTL_HOURS = 12
const IDLE_TIMEOUT_MINUTES = 120
const LAST_SEEN_REFRESH_MINUTES = 5
const MAX_FAILED_LOGINS = 5
const LOCKOUT_MINUTES = 15

export interface LoginResult {
  token: string
  expiresAt: Date
  user: SessionUser
}

const INVALID_CREDENTIALS = 'Email ou palavra-passe incorrectos.'

/** Autenticação com bloqueio progressivo e tempo de resposta constante para emails inexistentes. */
export async function login(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase()
  const [found] = await appSql()<{
    id: string
    tenantId: string
    passwordHash: string
    status: string
    failedLogins: number
    lockedUntil: Date | null
    orgStatus: string
  }[]>`select * from auth_lookup_user(${normalizedEmail})`

  if (!found) {
    await verifyPassword(password, await dummyPasswordHash())
    throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS)
  }
  if (found.lockedUntil && found.lockedUntil > new Date()) {
    throw new AppError('RATE_LIMITED', 'Conta temporariamente bloqueada por tentativas falhadas. Tente mais tarde.')
  }
  const valid = await verifyPassword(password, found.passwordHash)
  const actor = { tenantId: found.tenantId, actorType: 'user' as const, actorId: found.id, ...meta }

  if (!valid || found.status !== 'active' || found.orgStatus !== 'active') {
    await withTenant(found.tenantId, async (tx) => {
      const failed = found.failedLogins + 1
      const lock = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null
      await tx`update users set failed_logins = ${lock ? 0 : failed}, locked_until = ${lock} where id = ${found.id}`
      await recordAudit(tx, actor, {
        action: lock ? 'auth.locked' : 'auth.login_failed',
        entityType: 'user',
        entityId: found.id,
        summary: lock ? 'Conta bloqueada após tentativas falhadas' : 'Tentativa de autenticação falhada',
      })
    })
    throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS)
  }

  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000)
  const user = await withTenant(found.tenantId, async (tx) => {
    await tx`update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = ${found.id}`
    await tx`
      insert into sessions (tenant_id, user_id, token_hash, expires_at, ip, user_agent)
      values (${found.tenantId}, ${found.id}, ${hashToken(token)}, ${expiresAt}, ${meta.ip}, ${meta.userAgent})
    `
    await recordAudit(tx, actor, { action: 'auth.login', entityType: 'user', entityId: found.id, summary: 'Sessão iniciada' })
    return loadSessionUser(tx, found.id)
  })
  if (!user) throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS)
  return { token, expiresAt, user }
}

type Queryable = Parameters<Parameters<typeof withTenant>[1]>[0]

async function loadSessionUser(tx: Queryable, userId: string): Promise<SessionUser | null> {
  const [row] = await tx<{ id: string; tenantId: string; email: string; fullName: string; role: string; departmentId: string | null }[]>`
    select id, tenant_id, email, full_name, role, department_id from users where id = ${userId} and status = 'active'
  `
  if (!row || !isRole(row.role)) return null
  return { ...row, role: row.role }
}

/** Resolve o token do cookie para o utilizador; aplica expiração absoluta e por inactividade. */
export async function resolveSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token || token.length > 128) return null
  const tokenHash = hashToken(token)
  const [session] = await appSql()<{ sessionId: string; userId: string; tenantId: string }[]>`
    select session_id, user_id, tenant_id from auth_lookup_session(${tokenHash})
  `
  if (!session) return null
  return withTenant(session.tenantId, async (tx) => {
    const [state] = await tx<{ lastSeenAt: Date }[]>`select last_seen_at from sessions where id = ${session.sessionId}`
    if (!state) return null
    const idleMs = Date.now() - state.lastSeenAt.getTime()
    if (idleMs > IDLE_TIMEOUT_MINUTES * 60_000) {
      await tx`update sessions set revoked_at = now() where id = ${session.sessionId}`
      return null
    }
    if (idleMs > LAST_SEEN_REFRESH_MINUTES * 60_000) {
      await tx`update sessions set last_seen_at = now() where id = ${session.sessionId}`
    }
    return loadSessionUser(tx, session.userId)
  })
}

export async function logout(token: string | undefined, meta: RequestMeta): Promise<void> {
  if (!token) return
  const [session] = await appSql()<{ sessionId: string; userId: string; tenantId: string }[]>`
    select session_id, user_id, tenant_id from auth_lookup_session(${hashToken(token)})
  `
  if (!session) return
  await withTenant(session.tenantId, async (tx) => {
    await tx`update sessions set revoked_at = now() where id = ${session.sessionId}`
    await recordAudit(tx, { tenantId: session.tenantId, actorType: 'user', actorId: session.userId, ...meta }, {
      action: 'auth.logout',
      entityType: 'user',
      entityId: session.userId,
      summary: 'Sessão terminada',
    })
  })
}
