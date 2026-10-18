import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { RequestContext, SessionUser } from '../context'
import { AppError, forbidden } from '../errors'
import { readRequestMeta, type RequestMeta } from '../http/request-meta'
import { env } from '../env'
import { can, type Permission } from './rbac'
import { resolveSession } from './session'

export function sessionCookieName(): string {
  return env().APP_URL.startsWith('https://') ? '__Host-agoramoz_session' : 'agoramoz_session'
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env().APP_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    expires,
  }
}

export async function currentRequestMeta(): Promise<RequestMeta> {
  return readRequestMeta(await headers())
}

export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  return resolveSession(jar.get(sessionCookieName())?.value)
}

/** Para páginas: redirecciona para o login se não houver sessão. */
export async function requireUser(): Promise<RequestContext> {
  const user = await currentUser()
  if (!user) redirect('/entrar')
  const meta = await currentRequestMeta()
  return { tenantId: user.tenantId, user, ...meta }
}

/** Para páginas: exige uma permissão; sem ela mostra 403 em vez de dados. */
export async function requirePermission(permission: Permission): Promise<RequestContext> {
  const ctx = await requireUser()
  if (!can(ctx.user.role, permission)) redirect('/app/sem-acesso')
  return ctx
}

/** Para Server Actions e route handlers: lança erros em vez de redireccionar. */
export async function authorize(permission?: Permission): Promise<RequestContext> {
  const user = await currentUser()
  if (!user) throw new AppError('UNAUTHENTICATED', 'A sessão expirou. Entre novamente.')
  if (permission && !can(user.role, permission)) throw forbidden()
  const meta = await currentRequestMeta()
  return { tenantId: user.tenantId, user, ...meta }
}
