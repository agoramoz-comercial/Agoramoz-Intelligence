import { NextResponse, type NextRequest } from 'next/server'
import { after } from 'next/server'
import { AppError, isAppError, publicMessage } from '@/server/errors'
import { isSameOrigin, readRequestMeta } from '@/server/http/request-meta'
import { enforceRateLimit, RATE_LIMITS } from '@/server/http/rate-limit'
import { MAX_UPLOAD_BYTES } from '@/server/files/scan'
import { getPublicOrg } from '@/modules/organizations/public'
import { getPublicVacancy } from '@/modules/vacancies/service'
import { submitPublicApplication } from '@/modules/applications/intake'
import { processOutbox } from '@/modules/communications/service'

const MIN_FILL_MS = 2500

/**
 * Candidatura pública (multipart). Defesas: mesmo origin, limitação de taxa por IP, campo-armadilha,
 * tempo mínimo de preenchimento, verificação do ficheiro no servidor. Sem captcha que bloqueie candidatos.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const meta = readRequestMeta(request.headers)
  try {
    if (!isSameOrigin(request.headers)) throw new AppError('FORBIDDEN', 'Pedido de origem não autorizada.')
    const { org: slug } = await params
    const org = await getPublicOrg(slug)
    if (!org) throw new AppError('NOT_FOUND', 'Empresa não encontrada.')
    await enforceRateLimit(`apply:${org.id}:${meta.ip ?? 'unknown'}`, RATE_LIMITS.publicApplication)

    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > MAX_UPLOAD_BYTES + 512 * 1024) throw new AppError('VALIDATION', 'O ficheiro excede 5 MB.', { cv: 'Máximo 5 MB' })
    const form = await request.formData()
    if (String(form.get('website') ?? '') !== '') throw new AppError('VALIDATION', 'Não foi possível enviar a candidatura.')
    const startedAt = Number(form.get('startedAt') ?? 0)
    if (!startedAt || Date.now() - startedAt < MIN_FILL_MS) throw new AppError('VALIDATION', 'Envio demasiado rápido. Reveja os dados e tente de novo.')

    const vacancySlug = String(form.get('vacancy') ?? '')
    const vacancy = vacancySlug ? await getPublicVacancy(org.id, vacancySlug) : null
    if (vacancySlug && !vacancy) throw new AppError('NOT_FOUND', 'Esta vaga já não está aberta a candidaturas.')

    const answers = vacancy
      ? vacancy.screeningQuestions.map((question) => ({ questionId: question.id, answer: String(form.get(`answer_${question.id}`) ?? '').trim() })).filter((answer) => answer.answer)
      : []
    const file = form.get('cv')
    const upload = file instanceof File && file.size > 0 ? { name: file.name, data: new Uint8Array(await file.arrayBuffer()) } : null

    const result = await submitPublicApplication(
      { tenantId: org.id, actorType: 'candidate', actorId: null, ...meta },
      {
        orgSlug: org.slug,
        orgName: org.name,
        vacancy: vacancy
          ? { vacancyId: vacancy.vacancyId, versionId: vacancy.versionId, title: vacancy.title, requirements: vacancy.requirements, screeningQuestions: vacancy.screeningQuestions }
          : null,
      },
      {
        fullName: form.get('fullName'),
        email: form.get('email'),
        phone: form.get('phone'),
        location: form.get('location'),
        consent: form.get('consent') === 'on',
        consentTalentPool: form.get('consentTalentPool') === 'on',
        consentWhatsapp: form.get('consentWhatsapp') === 'on',
        coverNote: form.get('coverNote'),
        answers,
      },
      upload,
    )
    after(() => processOutbox(10).catch((error: unknown) => console.error('[outbox]', error)))
    return NextResponse.json({ ok: true, reference: result.reference, alreadyApplied: result.alreadyApplied }, { headers: { 'X-Correlation-Id': meta.correlationId } })
  } catch (error: unknown) {
    const status = isAppError(error) ? error.status : 500
    return NextResponse.json(
      { ok: false, error: publicMessage(error), fieldErrors: isAppError(error) ? error.fieldErrors : undefined, correlationId: meta.correlationId },
      { status },
    )
  }
}
