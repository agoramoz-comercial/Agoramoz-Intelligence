'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { formDataToObject } from '@/server/validation'
import { cancelRequisition, createRequisition, decideRequisition, submitRequisition, updateRequisition } from '@/modules/requisitions/service'
import { createVacancyFromRequisition } from '@/modules/vacancies/service'

export async function createRequisitionAction(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const result = await runAction(async () => createRequisition(await authorize('requisition.create'), formDataToObject(form)))
  if (result.ok) redirect(`/app/requisicoes/${result.data}`)
  return result
}

export async function updateRequisitionAction(id: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await updateRequisition(await authorize('requisition.create'), id, formDataToObject(form))
    return null
  })
  if (result.ok) redirect(`/app/requisicoes/${id}`)
  return result
}

export async function submitRequisitionAction(id: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await submitRequisition(await authorize('requisition.create'), id)
    return null
  }, 'Requisição enviada para aprovação.')
  refresh()
  return result
}

export async function decideRequisitionAction(id: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await decideRequisition(await authorize('requisition.approve'), id, formDataToObject(form))
    return null
  }, 'Decisão registada.')
  refresh()
  return result
}

export async function cancelRequisitionAction(id: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await cancelRequisition(await authorize('requisition.create'), id, String(form.get('reason') ?? ''))
    return null
  }, 'Requisição cancelada.')
  refresh()
  return result
}

export async function createVacancyAction(requisitionId: string): Promise<ActionResult<string>> {
  const result = await runAction(async () => createVacancyFromRequisition(await authorize('vacancy.manage'), requisitionId))
  if (result.ok) redirect(`/app/vagas/${result.data}/publicar`)
  return result
}
