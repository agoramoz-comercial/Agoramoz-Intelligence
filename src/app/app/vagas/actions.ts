'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { formDataToObject } from '@/server/validation'
import { kickOutbox } from '@/server/kick'
import { closeVacancy, publishVacancy } from '@/modules/vacancies/service'
import { moveApplication } from '@/modules/applications/pipeline'
import { draftJobDescription, recordAiHumanAction, type JobDescriptionDraft } from '@/modules/ai/service'

export async function publishVacancyAction(id: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    const ctx = await authorize('vacancy.manage')
    await publishVacancy(ctx, id, formDataToObject(form))
    const interactionId = String(form.get('aiInteractionId') ?? '')
    if (interactionId) await recordAiHumanAction(ctx, interactionId, String(form.get('aiAction') ?? 'edited')).catch(() => undefined)
    return null
  })
  if (result.ok) redirect(`/app/vagas/${id}`)
  return result
}

export async function closeVacancyAction(id: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await closeVacancy(await authorize('vacancy.manage'), id, String(form.get('reason') ?? ''))
    return null
  }, 'Vaga fechada.')
  refresh()
  return result
}

/** Chamada a partir do quadro (arrastar ou menu). */
export async function moveCardAction(applicationId: string, stageId: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await moveApplication(await authorize('application.move'), applicationId, { stageId })
    return null
  })
  kickOutbox()
  refresh()
  return result
}

export async function draftDescriptionAction(vacancyId: string): Promise<ActionResult<JobDescriptionDraft>> {
  return runAction(async () => draftJobDescription(await authorize('ai.use'), vacancyId))
}
