'use server'

import { refresh } from 'next/cache'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { formDataToObject } from '@/server/validation'
import { kickOutbox } from '@/server/kick'
import { retryMessage, updateTemplate } from '@/modules/communications/service'
import type { TemplateKey } from '@/modules/communications/defaults'

export async function retryAction(messageId: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await retryMessage(await authorize('message.send'), messageId)
    return null
  }, 'Reenvio pedido.')
  kickOutbox()
  refresh()
  return result
}

export async function templateAction(key: TemplateKey, _: unknown, form: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await updateTemplate(await authorize('template.manage'), key, formDataToObject(form))
    return null
  }, 'Modelo guardado.')
}
