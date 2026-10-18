import { z } from 'zod'
import { withTenant, type Tx } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { parseInput } from '@/server/validation'
import { daysBetween } from '@/lib/time'
import { enqueueTemplateMessage } from '@/modules/communications/service'
import { refreshEvidence } from '@/modules/evidence/service'
import { loadSettings } from '@/modules/organizations/settings'
import type { EvidenceReport } from '@/modules/evidence/engine'
import { vacancyScope, type StageRow } from '@/modules/vacancies/service'
import { privacyLink, retentionUntil } from './intake'
import { applicationScope } from './scope'

export const REJECTION_REASONS = {
  requisitos_obrigatorios: 'Não cumpre requisitos obrigatórios',
  experiencia_insuficiente: 'Experiência insuficiente para a função',
  outro_candidato: 'Outro candidato mais adequado',
  desistencia: 'Desistência do candidato',
  nao_compareceu: 'Não compareceu à entrevista',
  vaga_cancelada: 'Vaga cancelada',
  outro: 'Outro motivo (descrever)',
} as const

export type RejectionReason = keyof typeof REJECTION_REASONS

export interface BoardCard {
  id: string
  candidateId: string
  candidateName: string
  reference: string
  source: string
  stageId: string | null
  status: 'active' | 'hired' | 'rejected' | 'withdrawn'
  tags: string[]
  ownerName: string | null
  daysInStage: number
  createdAt: Date
  evidence: Pick<EvidenceReport, 'mustFound' | 'mustTotal' | 'hasText' | 'answerFlags'> | null
  hasDuplicate: boolean
  nextInterviewAt: Date | null
  pendingScorecards: number
  rejectionReason: string | null
}

export interface Board {
  vacancy: { id: string; title: string; status: string; slug: string }
  stages: (StageRow & { cards: BoardCard[] })[]
  rejected: BoardCard[]
  stalledDays: number
}

export async function getBoard(ctx: RequestContext, vacancyId: string): Promise<Board> {
  if (!can(ctx.user.role, 'application.view')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const [vacancy] = await tx<{ id: string; title: string; status: string; slug: string }[]>`
      select v.id, coalesce(vv.title, r.title) as title, v.status, v.slug
      from vacancies v join requisitions r on r.id = v.requisition_id left join vacancy_versions vv on vv.id = v.published_version_id
      where v.id = ${vacancyId} ${vacancyScope(tx, ctx)}
    `
    if (!vacancy) throw notFound('Vaga')
    const settings = await loadSettings(tx, ctx.tenantId)
    const stages = await tx<StageRow[]>`select id, position, name, kind from pipeline_stages where vacancy_id = ${vacancyId} order by position`
    const rows = await tx<(Omit<BoardCard, 'daysInStage'> & { stageEnteredAt: Date })[]>`
      select a.id, a.candidate_id, c.full_name as candidate_name, a.reference, a.source, a.stage_id, a.status, a.tags,
        u.full_name as owner_name, a.stage_entered_at, a.created_at, a.rejection_reason,
        case when a.evidence is null then null else jsonb_build_object(
          'mustFound', a.evidence->'mustFound', 'mustTotal', a.evidence->'mustTotal',
          'hasText', a.evidence->'hasText', 'answerFlags', a.evidence->'answerFlags') end as evidence,
        exists (select 1 from duplicate_suggestions d where d.status = 'open' and (d.candidate_a = a.candidate_id or d.candidate_b = a.candidate_id)) as has_duplicate,
        (select min(i.starts_at) from interviews i where i.application_id = a.id and i.status = 'scheduled' and i.starts_at > now()) as next_interview_at,
        (select count(*)::int from interviews i join interview_participants p on p.interview_id = i.id
          where i.application_id = a.id and i.status <> 'cancelled' and i.starts_at < now()
            and not exists (select 1 from scorecards s where s.interview_id = i.id and s.author_id = p.user_id and s.status = 'submitted')) as pending_scorecards
      from applications a
      join candidates c on c.id = a.candidate_id
      left join users u on u.id = a.owner_id
      where a.vacancy_id = ${vacancyId} and a.status <> 'withdrawn' ${applicationScope(tx, ctx)}
      order by a.stage_entered_at
    `
    const now = new Date()
    const cards: BoardCard[] = rows.map(({ stageEnteredAt, ...row }) => ({ ...row, daysInStage: daysBetween(stageEnteredAt, now) }))
    return {
      vacancy,
      stages: stages.map((stage) => ({ ...stage, cards: cards.filter((card) => card.stageId === stage.id && card.status !== 'rejected') })),
      rejected: cards.filter((card) => card.status === 'rejected'),
      stalledDays: settings.stalledDays,
    }
  })
}

interface LockedApplication {
  id: string
  tenantId: string
  candidateId: string
  vacancyId: string | null
  stageId: string | null
  status: string
  reference: string
  candidateName: string
  candidateEmail: string | null
  consentTalentPool: boolean
  vacancyTitle: string
  orgName: string
  orgSlug: string
}

async function lockApplication(tx: Tx, ctx: RequestContext, applicationId: string): Promise<LockedApplication> {
  const [row] = await tx<LockedApplication[]>`
    select a.id, a.tenant_id, a.candidate_id, a.vacancy_id, a.stage_id, a.status, a.reference,
      c.full_name as candidate_name, c.email as candidate_email, c.consent_talent_pool,
      coalesce(vv.title, 'candidatura espontânea') as vacancy_title, o.name as org_name, o.slug as org_slug
    from applications a
    join candidates c on c.id = a.candidate_id
    join organizations o on o.id = a.tenant_id
    left join vacancy_versions vv on vv.id = a.vacancy_version_id
    where a.id = ${applicationId} ${applicationScope(tx, ctx)}
    for update of a
  `
  if (!row) throw notFound('Candidatura')
  return row
}

function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName
}

const moveSchema = z.object({
  stageId: z.string().uuid('Etapa inválida'),
  notify: z.preprocess((value) => value === true || value === 'on' || value === 'true', z.boolean()).default(false),
})

/** Move uma candidatura activa para outra etapa da mesma vaga. A etapa "Contratado" exige a acção de contratação. */
export async function moveApplication(ctx: RequestContext, applicationId: string, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'application.move')) throw forbidden()
  const data = parseInput(moveSchema, input)
  await withTenant(ctx.tenantId, async (tx) => {
    const application = await lockApplication(tx, ctx, applicationId)
    if (application.status !== 'active') throw new AppError('CONFLICT', 'Só candidaturas activas podem mudar de etapa.')
    const [stage] = await tx<{ id: string; name: string; kind: string; vacancyId: string }[]>`
      select id, name, kind, vacancy_id from pipeline_stages where id = ${data.stageId}
    `
    if (!stage || stage.vacancyId !== application.vacancyId) throw new AppError('VALIDATION', 'A etapa não pertence a esta vaga.')
    if (stage.kind === 'hired') throw new AppError('VALIDATION', 'Use a acção "Contratar" para concluir o processo.')
    if (stage.id === application.stageId) return
    const [previous] = await tx<{ name: string }[]>`select name from pipeline_stages where id = ${application.stageId}`
    await tx`update applications set stage_id = ${stage.id}, stage_entered_at = now() where id = ${applicationId}`
    if (data.notify && application.candidateEmail) {
      await enqueueTemplateMessage(tx, actorOf(ctx), {
        candidateId: application.candidateId,
        applicationId,
        to: application.candidateEmail,
        templateKey: 'stage_progress',
        vars: { candidato: firstName(application.candidateName), vaga: application.vacancyTitle, empresa: application.orgName, referencia: application.reference, etapa: stage.name },
        idempotencyKey: `stage_progress:${applicationId}:${stage.id}`,
        createdBy: ctx.user.id,
      })
    }
    await recordAudit(tx, actorOf(ctx), {
      action: 'application.moved',
      entityType: 'application',
      entityId: applicationId,
      summary: `Etapa: ${previous?.name ?? '—'} → ${stage.name}`,
      changes: { stageId: { from: application.stageId, to: stage.id }, notified: data.notify },
    })
  })
}

const rejectSchema = z
  .object({
    reason: z.enum(Object.keys(REJECTION_REASONS) as [RejectionReason, ...RejectionReason[]], { message: 'Escolha o motivo da rejeição' }),
    note: z.string().trim().max(1000).optional().transform((value) => value || null),
    notify: z.preprocess((value) => value === true || value === 'on' || value === 'true', z.boolean()).default(true),
  })
  .refine((data) => data.reason !== 'outro' || (data.note && data.note.length >= 5), {
    message: 'Descreva o motivo',
    path: ['note'],
  })

/** Rejeição final: motivo obrigatório (HR-031), resposta ao candidato por defeito e retenção recalculada. */
export async function rejectApplication(ctx: RequestContext, applicationId: string, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'application.decide')) throw forbidden()
  const data = parseInput(rejectSchema, input)
  await withTenant(ctx.tenantId, async (tx) => {
    const application = await lockApplication(tx, ctx, applicationId)
    if (application.status !== 'active') throw new AppError('CONFLICT', 'A candidatura já tem decisão final.')
    const settings = await loadSettings(tx, ctx.tenantId)
    await tx`
      update applications set status = 'rejected', rejection_reason = ${data.reason}, rejection_note = ${data.note}, decided_at = now()
      where id = ${applicationId}
    `
    await tx`
      update candidates set retention_until = greatest(retention_until, ${retentionUntil(settings, application.consentTalentPool)}::date)
      where id = ${application.candidateId}
    `
    if (data.notify && application.candidateEmail) {
      await enqueueTemplateMessage(tx, actorOf(ctx), {
        candidateId: application.candidateId,
        applicationId,
        to: application.candidateEmail,
        templateKey: 'rejection',
        vars: { candidato: firstName(application.candidateName), vaga: application.vacancyTitle, empresa: application.orgName, referencia: application.reference, link: privacyLink(application.orgSlug) },
        idempotencyKey: `rejection:${applicationId}`,
        createdBy: ctx.user.id,
      })
    }
    await recordAudit(tx, actorOf(ctx), {
      action: 'application.rejected',
      entityType: 'application',
      entityId: applicationId,
      summary: `Rejeitada: ${REJECTION_REASONS[data.reason]}`,
      changes: { status: { from: 'active', to: 'rejected' }, reason: data.reason, notified: data.notify },
      reason: data.note,
    })
  })
}

export async function hireApplication(ctx: RequestContext, applicationId: string, notify: boolean): Promise<void> {
  if (!can(ctx.user.role, 'application.decide')) throw forbidden()
  await withTenant(ctx.tenantId, async (tx) => {
    const application = await lockApplication(tx, ctx, applicationId)
    if (application.status !== 'active' || !application.vacancyId) throw new AppError('CONFLICT', 'Só candidaturas activas a uma vaga podem ser contratadas.')
    const [hiredStage] = await tx<{ id: string }[]>`select id from pipeline_stages where vacancy_id = ${application.vacancyId} and kind = 'hired' limit 1`
    if (!hiredStage) throw new Error('Etapa de contratação em falta')
    await tx`update applications set status = 'hired', stage_id = ${hiredStage.id}, stage_entered_at = now(), decided_at = now() where id = ${applicationId}`
    if (notify && application.candidateEmail) {
      await enqueueTemplateMessage(tx, actorOf(ctx), {
        candidateId: application.candidateId,
        applicationId,
        to: application.candidateEmail,
        templateKey: 'hired',
        vars: { candidato: firstName(application.candidateName), vaga: application.vacancyTitle, empresa: application.orgName, referencia: application.reference },
        idempotencyKey: `hired:${applicationId}`,
        createdBy: ctx.user.id,
      })
    }
    await recordAudit(tx, actorOf(ctx), {
      action: 'application.hired',
      entityType: 'application',
      entityId: applicationId,
      summary: 'Candidato seleccionado para contratação',
      changes: { status: { from: 'active', to: 'hired' }, notified: notify },
    })
  })
}

/** Reabre uma decisão tomada por engano (registado com fundamento). */
export async function reopenApplication(ctx: RequestContext, applicationId: string, reason: string): Promise<void> {
  if (!can(ctx.user.role, 'application.decide')) throw forbidden()
  const cleanReason = parseInput(z.string().trim().min(5, 'Indique o fundamento da reabertura'), reason)
  await withTenant(ctx.tenantId, async (tx) => {
    const application = await lockApplication(tx, ctx, applicationId)
    if (application.status === 'active') return
    const [stage] = await tx<{ id: string }[]>`
      select id from pipeline_stages where vacancy_id = ${application.vacancyId} and kind = 'screening' limit 1
    `
    await tx`
      update applications set status = 'active', rejection_reason = null, rejection_note = null, decided_at = null,
        stage_id = coalesce(${stage?.id ?? null}::uuid, stage_id), stage_entered_at = now()
      where id = ${applicationId}
    `
    await recordAudit(tx, actorOf(ctx), {
      action: 'application.reopened',
      entityType: 'application',
      entityId: applicationId,
      summary: 'Decisão reaberta',
      changes: { status: { from: application.status, to: 'active' } },
      reason: cleanReason,
    })
  })
}

export async function addComment(ctx: RequestContext, applicationId: string, body: string): Promise<void> {
  if (!can(ctx.user.role, 'comment.create')) throw forbidden()
  const clean = parseInput(z.string().trim().min(1, 'Escreva o comentário').max(4000), body)
  await withTenant(ctx.tenantId, async (tx) => {
    await lockApplication(tx, ctx, applicationId)
    const [row] = await tx<{ id: string }[]>`
      insert into comments (tenant_id, application_id, author_id, body) values (${ctx.tenantId}, ${applicationId}, ${ctx.user.id}, ${clean}) returning id
    `
    await recordAudit(tx, actorOf(ctx), { action: 'comment.added', entityType: 'application', entityId: applicationId, summary: 'Comentário adicionado', changes: { commentId: row?.id } })
  })
}

const TAG_PATTERN = /^[\p{L}\p{N} _-]{1,30}$/u

export async function setTags(ctx: RequestContext, applicationId: string, raw: string): Promise<void> {
  if (!can(ctx.user.role, 'application.move')) throw forbidden()
  const tags = [...new Set(raw.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
  if (tags.some((tag) => !TAG_PATTERN.test(tag))) throw new AppError('VALIDATION', 'Etiquetas só com letras, números, espaço ou hífen (máx. 30).')
  await withTenant(ctx.tenantId, async (tx) => {
    await lockApplication(tx, ctx, applicationId)
    await tx`update applications set tags = ${tags} where id = ${applicationId}`
    await recordAudit(tx, actorOf(ctx), { action: 'application.tagged', entityType: 'application', entityId: applicationId, summary: 'Etiquetas actualizadas', changes: { tags } })
  })
}

export async function assignOwner(ctx: RequestContext, applicationId: string, ownerId: string | null): Promise<void> {
  if (!can(ctx.user.role, 'application.move')) throw forbidden()
  await withTenant(ctx.tenantId, async (tx) => {
    await lockApplication(tx, ctx, applicationId)
    if (ownerId) {
      const [user] = await tx`select 1 from users where id = ${ownerId} and status = 'active'`
      if (!user) throw new AppError('VALIDATION', 'Responsável inválido.')
    }
    await tx`update applications set owner_id = ${ownerId} where id = ${applicationId}`
    await recordAudit(tx, actorOf(ctx), { action: 'application.assigned', entityType: 'application', entityId: applicationId, summary: 'Responsável atribuído', changes: { ownerId } })
  })
}

/** Associa uma candidatura espontânea a uma vaga publicada (nova candidatura, mesma pessoa). */
export async function linkSpontaneousToVacancy(ctx: RequestContext, applicationId: string, vacancyId: string): Promise<string> {
  if (!can(ctx.user.role, 'application.move')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const application = await lockApplication(tx, ctx, applicationId)
    if (application.vacancyId) throw new AppError('CONFLICT', 'Esta candidatura já está associada a uma vaga.')
    const [vacancy] = await tx<{ versionId: string | null }[]>`
      select published_version_id as version_id from vacancies where id = ${vacancyId} and status = 'published'
    `
    if (!vacancy?.versionId) throw new AppError('VALIDATION', 'Escolha uma vaga publicada.')
    const [stage] = await tx<{ id: string }[]>`select id from pipeline_stages where vacancy_id = ${vacancyId} order by position limit 1`
    const [created] = await tx<{ id: string }[]>`
      insert into applications (tenant_id, candidate_id, vacancy_id, vacancy_version_id, stage_id, reference, source, answers, cover_note)
      select tenant_id, candidate_id, ${vacancyId}, ${vacancy.versionId}, ${stage?.id ?? null}, reference || '-V', source, answers, cover_note
      from applications where id = ${applicationId}
      on conflict (candidate_id, vacancy_id) do nothing
      returning id
    `
    if (!created) throw new AppError('CONFLICT', 'Este candidato já tem candidatura a essa vaga.')
    await refreshEvidence(tx, created.id)
    await tx`update applications set status = 'withdrawn', decided_at = now() where id = ${applicationId}`
    await recordAudit(tx, actorOf(ctx), {
      action: 'application.linked',
      entityType: 'application',
      entityId: created.id,
      summary: 'Candidatura espontânea associada a vaga',
      changes: { fromApplicationId: applicationId, vacancyId },
    })
    return created.id
  })
}
