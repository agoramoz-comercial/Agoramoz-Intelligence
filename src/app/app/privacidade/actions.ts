'use server'

import { refresh } from 'next/cache'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { formDataToObject } from '@/server/validation'
import { AppError } from '@/server/errors'
import { resolveDsr, runRetention, type RetentionCandidate } from '@/modules/privacy/service'

export async function resolveDsrAction(id: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await resolveDsr(await authorize('privacy.manage'), id, formDataToObject(form))
    return null
  }, 'Pedido encerrado.')
  refresh()
  return result
}

export async function retentionAction(_: unknown, form: FormData): Promise<ActionResult<{ dryRun: boolean; candidates: RetentionCandidate[] }>> {
  const dryRun = form.get('intent') !== 'execute'
  const result = await runAction(async () => {
    if (!dryRun && form.get('confirm') !== 'on') throw new AppError('VALIDATION', 'Marque a confirmação antes de executar: a anonimização é irreversível.')
    const run = await runRetention(await authorize('privacy.manage'), dryRun)
    return { dryRun, candidates: run.candidates }
  }, dryRun ? 'Simulação concluída: nada foi alterado.' : 'Retenção aplicada e registada.')
  if (!dryRun) refresh()
  return result
}
