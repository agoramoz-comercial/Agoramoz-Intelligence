'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { currentRequestMeta, sessionCookieName, sessionCookieOptions } from '@/server/auth/current'
import { login, logout } from '@/server/auth/session'
import { enforceRateLimit, RATE_LIMITS } from '@/server/http/rate-limit'
import { runAction, type ActionResult } from '@/server/actions'
import { parseInput } from '@/server/validation'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Indique um email válido'),
  password: z.string().min(1, 'Indique a palavra-passe').max(200),
})

export async function loginAction(_: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const data = parseInput(loginSchema, { email: form.get('email'), password: form.get('password') })
    const meta = await currentRequestMeta()
    await enforceRateLimit(`login:ip:${meta.ip ?? 'unknown'}`, RATE_LIMITS.login)
    await enforceRateLimit(`login:email:${data.email}`, RATE_LIMITS.login)
    const session = await login(data.email, data.password, meta)
    const jar = await cookies()
    jar.set(sessionCookieName(), session.token, sessionCookieOptions(session.expiresAt))
    return null
  })
  if (result.ok) {
    const next = String(form.get('next') ?? '')
    redirect(next.startsWith('/app') && !next.startsWith('//') ? next : '/app')
  }
  return result
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies()
  await logout(jar.get(sessionCookieName())?.value, await currentRequestMeta())
  jar.delete(sessionCookieName())
  redirect('/entrar')
}
