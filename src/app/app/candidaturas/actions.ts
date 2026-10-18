'use server'

import { refresh } from 'next/cache'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { formDataToObject } from '@/server/validation'
import { kickOutbox } from '@/server/kick'
import { addComment, assignOwner, hireApplication, linkSpontaneousToVacancy, moveApplication, rejectApplication, reopenApplication, setTags } from '@/modules/applications/pipeline'
import { cancelInterview, completeInterview, scheduleInterview } from '@/modules/interviews/service'
import { retryMessage, sendInformationRequest } from '@/modules/communications/service'
import { recordAiHumanAction, summarizeCv, type CvSummary } from '@/modules/ai/service'
import { redirect } from 'next/navigation'

function done<T>(result: ActionResult<T>, deliver = false): ActionResult<T> {
  if (deliver) kickOutbox()
  refresh()
  return result
}

export async function moveAction(id: string, _: unknown, form: FormData) {
  return done(await runAction(async () => moveApplication(await authorize('application.move'), id, formDataToObject(form)), 'Etapa actualizada.'), true)
}

export async function rejectAction(id: string, _: unknown, form: FormData) {
  return done(await runAction(async () => rejectApplication(await authorize('application.decide'), id, formDataToObject(form)), 'Decisão registada.'), true)
}

export async function hireAction(id: string, _: unknown, form: FormData) {
  return done(await runAction(async () => hireApplication(await authorize('application.decide'), id, form.get('notify') === 'on'), 'Contratação registada.'), true)
}

export async function reopenAction(id: string, _: unknown, form: FormData) {
  return done(await runAction(async () => reopenApplication(await authorize('application.decide'), id, String(form.get('reason') ?? '')), 'Candidatura reaberta.'))
}

export async function commentAction(id: string, _: unknown, form: FormData) {
  return done(await runAction(async () => addComment(await authorize('comment.create'), id, String(form.get('body') ?? ''))))
}

export async function tagsAction(id: string, _: unknown, form: FormData) {
  return done(await runAction(async () => setTags(await authorize('application.move'), id, String(form.get('tags') ?? '')), 'Etiquetas guardadas.'))
}

export async function ownerAction(id: string, _: unknown, form: FormData) {
  const owner = String(form.get('ownerId') ?? '')
  return done(await runAction(async () => assignOwner(await authorize('application.move'), id, owner || null), 'Responsável actualizado.'))
}

export async function scheduleAction(id: string, _: unknown, form: FormData) {
  const raw = { ...formDataToObject(form), participantIds: form.getAll('participantIds').map(String) }
  return done(await runAction(async () => { await scheduleInterview(await authorize('interview.schedule'), id, raw) }, 'Entrevista agendada e convite enviado.'), true)
}

export async function cancelInterviewAction(interviewId: string, _: unknown, form: FormData) {
  return done(await runAction(async () => cancelInterview(await authorize('interview.schedule'), interviewId, String(form.get('reason') ?? '')), 'Entrevista cancelada.'), true)
}

export async function completeInterviewAction(interviewId: string) {
  return done(await runAction(async () => completeInterview(await authorize('interview.schedule'), interviewId), 'Marcada como realizada.'))
}

export async function informationRequestAction(id: string, _: unknown, form: FormData) {
  return done(await runAction(async () => sendInformationRequest(await authorize('message.send'), id, formDataToObject(form)), 'Mensagem em envio.'), true)
}

export async function retryMessageAction(messageId: string) {
  return done(await runAction(async () => retryMessage(await authorize('message.send'), messageId), 'Reenvio pedido.'), true)
}

export async function summarizeCvAction(id: string): Promise<ActionResult<CvSummary>> {
  return runAction(async () => summarizeCv(await authorize('ai.use'), id))
}

export async function aiFeedbackAction(interactionId: string, action: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await recordAiHumanAction(await authorize('ai.use'), interactionId, action)
    return null
  })
}

export async function linkVacancyAction(id: string, _: unknown, form: FormData): Promise<ActionResult<string>> {
  const result = await runAction(async () => linkSpontaneousToVacancy(await authorize('application.move'), id, String(form.get('vacancyId') ?? '')))
  if (result.ok) redirect(`/app/candidaturas/${result.data}`)
  return result
}
