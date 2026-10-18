'use server'

import { headers } from 'next/headers'
import { runAction, type ActionResult } from '@/server/actions'
import { AppError } from '@/server/errors'
import { readRequestMeta } from '@/server/http/request-meta'
import { enforceRateLimit, RATE_LIMITS } from '@/server/http/rate-limit'
import { kickOutbox } from '@/server/kick'
import { getPublicOrg } from '@/modules/organizations/public'
import { createPublicDsr } from '@/modules/privacy/service'

export async function requestPrivacyAction(orgSlug: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const org = await getPublicOrg(orgSlug)
    if (!org) throw new AppError('NOT_FOUND', 'Empresa não encontrada.')
    const meta = readRequestMeta(await headers())
    await enforceRateLimit(`dsr:${org.id}:${meta.ip ?? 'unknown'}`, RATE_LIMITS.privacyRequest)
    await createPublicDsr({ tenantId: org.id, actorType: 'candidate', actorId: null, ...meta }, org, {
      email: form.get('email'),
      kind: form.get('kind'),
      details: form.get('details'),
    })
    return null
  }, 'Pedido registado. Se o email estiver correcto, receberá uma ligação para o confirmar (válida 48 horas).')
  if (result.ok) kickOutbox()
  return result
}

export async function confirmPrivacyAction(orgSlug: string, token: string): Promise<ActionResult<{ kind: string }>> {
  return runAction(async () => {
    const org = await getPublicOrg(orgSlug)
    if (!org) throw new AppError('NOT_FOUND', 'Empresa não encontrada.')
    const meta = readRequestMeta(await headers())
    await enforceRateLimit(`dsr-confirm:${meta.ip ?? 'unknown'}`, RATE_LIMITS.privacyRequest)
    const { verifyDsr } = await import('@/modules/privacy/service')
    const verified = await verifyDsr({ tenantId: org.id, actorType: 'candidate', actorId: null, ...meta }, token)
    if (!verified) throw new AppError('NOT_FOUND', 'A ligação já foi usada ou passaram mais de 48 horas. Faça um novo pedido.')
    return verified
  }, 'Pedido confirmado. A equipa responde no prazo de 30 dias, por email.')
}
