'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { authorize } from '@/server/auth/current'
import { runAction, type ActionResult } from '@/server/actions'
import { AppError } from '@/server/errors'
import { formDataToObject } from '@/server/validation'
import { kickOutbox } from '@/server/kick'
import { createManualApplication, dismissDuplicate, mergeCandidates } from '@/modules/candidates/service'
import { importCandidates, type ImportReport } from '@/modules/candidates/import'
import { eraseCandidate } from '@/modules/privacy/service'

const MAX_UPLOAD = 5 * 1024 * 1024

export async function createManualAction(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const result = await runAction(async () => {
    const ctx = await authorize('candidate.manage')
    const raw = formDataToObject(form)
    const file = form.get('cv')
    const upload = file instanceof File && file.size > 0 ? { name: file.name, data: new Uint8Array(await file.arrayBuffer()) } : null
    if (upload && upload.data.length > MAX_UPLOAD) throw new AppError('VALIDATION', 'O ficheiro excede 5 MB.', { cv: 'Máximo 5 MB' })
    const intake = await createManualApplication(
      ctx,
      { ...raw, consentConfirmed: raw.consentConfirmed === 'on', consentTalentPool: raw.consentTalentPool === 'on', notifyCandidate: raw.notifyCandidate === 'on' },
      upload,
    )
    return intake.applicationId
  })
  if (result.ok) {
    kickOutbox()
    redirect(`/app/candidaturas/${result.data}`)
  }
  return result
}

export async function importAction(_: unknown, form: FormData): Promise<ActionResult<ImportReport>> {
  return runAction(async () => {
    const ctx = await authorize('candidate.manage')
    const file = form.get('csv')
    if (!(file instanceof File) || file.size === 0) throw new AppError('VALIDATION', 'Escolha um ficheiro CSV.', { csv: 'Ficheiro em falta' })
    const report = await importCandidates(ctx, {
      csvText: await file.text(),
      vacancyId: String(form.get('vacancyId') ?? '') || null,
      dryRun: form.get('intent') !== 'import',
      consentConfirmed: form.get('consentConfirmed') === 'on',
    })
    if (!report.dryRun) refresh()
    return report
  })
}

export async function mergeAction(keepId: string, mergeId: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await mergeCandidates(await authorize('candidate.manage'), keepId, mergeId)
    return null
  }, 'Registos fundidos.')
  if (result.ok) redirect(`/app/candidatos/${keepId}`)
  return result
}

export async function dismissDuplicateAction(suggestionId: string): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await dismissDuplicate(await authorize('candidate.manage'), suggestionId)
    return null
  }, 'Sugestão descartada.')
  refresh()
  return result
}

export async function eraseAction(candidateId: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const result = await runAction(async () => {
    await eraseCandidate(await authorize('privacy.manage'), candidateId, String(form.get('reason') ?? ''))
    return null
  }, 'Candidato anonimizado. Ficheiros eliminados.')
  refresh()
  return result
}
