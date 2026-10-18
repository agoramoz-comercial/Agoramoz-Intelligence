import { z } from 'zod'
import { withTenant, type Tx } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { env } from '@/server/env'
import { parseInput, asList } from '@/server/validation'
import { formatDateTime } from '@/lib/format'
import { zonedLocalToUtc } from '@/lib/time'
import { enqueueTemplateMessage } from '@/modules/communications/service'
import { loadSettings } from '@/modules/organizations/settings'
import type { Competency } from '@/modules/requisitions/schema'
import { applicationScope } from '@/modules/applications/scope'
import { buildIcs, emailAddressOf } from './ics'
import { canSeeOthersFeedback, consolidate, RECOMMENDATION_LABELS, type Consolidation, type Rating, type Recommendation, type SubmittedScorecard } from './consolidation'

export const MODE_LABELS = { presencial: 'Presencial', video: 'Videochamada', telefone: 'Telefone' } as const

const scheduleSchema = z.object({
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Indique data e hora'),
  durationMinutes: z.coerce.number().int().min(10).max(480),
  mode: z.enum(['presencial', 'video', 'telefone']),
  location: z.string().trim().max(300).optional().transform((value) => value || null),
  participantIds: z.array(z.string().uuid()).min(1, 'Escolha pelo menos um entrevistador').max(6),
  notifyCandidate: z.preprocess((value) => value === true || value === 'on' || value === 'true', z.boolean()).default(true),
})

interface InterviewContext {
  applicationId: string
  candidateId: string
  candidateName: string
  candidateEmail: string | null
  reference: string
  vacancyTitle: string
  orgName: string
  status: string
}

async function loadApplicationForInterview(tx: Tx, ctx: RequestContext, applicationId: string): Promise<InterviewContext> {
  const [row] = await tx<InterviewContext[]>`
    select a.id as application_id, a.candidate_id, c.full_name as candidate_name, c.email as candidate_email, a.reference,
      coalesce(vv.title, 'Candidatura') as vacancy_title, o.name as org_name, a.status
    from applications a join candidates c on c.id = a.candidate_id join organizations o on o.id = a.tenant_id
    left join vacancy_versions vv on vv.id = a.vacancy_version_id
    where a.id = ${applicationId} ${applicationScope(tx, ctx)}
  `
  if (!row) throw notFound('Candidatura')
  return row
}

function icsAttachment(ics: string) {
  return [{ filename: 'convite.ics', contentType: 'text/calendar; charset=utf-8; method=REQUEST', content: Buffer.from(ics).toString('base64') }]
}

export async function scheduleInterview(ctx: RequestContext, applicationId: string, input: unknown): Promise<string> {
  if (!can(ctx.user.role, 'interview.schedule')) throw forbidden()
  const raw = input as Record<string, unknown>
  const data = parseInput(scheduleSchema, { ...raw, participantIds: asList(raw.participantIds) })
  return withTenant(ctx.tenantId, async (tx) => {
    const app = await loadApplicationForInterview(tx, ctx, applicationId)
    if (app.status !== 'active') throw new AppError('CONFLICT', 'Só candidaturas activas podem ter entrevistas.')
    const settings = await loadSettings(tx, ctx.tenantId)
    const startsAt = zonedLocalToUtc(data.startsAt, settings.timezone)
    if (startsAt.getTime() < Date.now() - 60_000) throw new AppError('VALIDATION', 'A entrevista tem de ser no futuro.', { startsAt: 'Data no passado' })
    const participants = await tx<{ id: string; fullName: string; email: string }[]>`
      select id, full_name, email from users where id = any(${data.participantIds}) and status = 'active'
    `
    if (participants.length !== new Set(data.participantIds).size) throw new AppError('VALIDATION', 'Entrevistador inválido.')

    const [interview] = await tx<{ id: string }[]>`
      insert into interviews (tenant_id, application_id, starts_at, duration_minutes, mode, location, created_by)
      values (${ctx.tenantId}, ${applicationId}, ${startsAt}, ${data.durationMinutes}, ${data.mode}, ${data.location}, ${ctx.user.id})
      returning id
    `
    if (!interview) throw new Error('insert falhou')
    for (const participant of participants) {
      await tx`insert into interview_participants (tenant_id, interview_id, user_id) values (${ctx.tenantId}, ${interview.id}, ${participant.id})`
    }
    const where = data.location ?? MODE_LABELS[data.mode]
    if (data.notifyCandidate && app.candidateEmail) {
      const ics = buildIcs({
        uid: `${interview.id}@agoramoz-hr`,
        sequence: 0,
        method: 'REQUEST',
        start: startsAt,
        durationMinutes: data.durationMinutes,
        summary: `Entrevista — ${app.vacancyTitle} (${app.orgName})`,
        description: `Entrevista para ${app.vacancyTitle}. Referência ${app.reference}.`,
        location: where,
        organizerEmail: emailAddressOf(env().EMAIL_FROM),
        organizerName: app.orgName,
        attendees: [{ email: app.candidateEmail, name: app.candidateName }],
      })
      await enqueueTemplateMessage(tx, actorOf(ctx), {
        candidateId: app.candidateId,
        applicationId,
        to: app.candidateEmail,
        templateKey: 'interview_invitation',
        vars: {
          candidato: app.candidateName.split(' ')[0],
          vaga: app.vacancyTitle,
          empresa: app.orgName,
          referencia: app.reference,
          data_entrevista: formatDateTime(startsAt, settings.timezone),
          local: where,
        },
        idempotencyKey: `interview_invitation:${interview.id}:0`,
        attachments: icsAttachment(ics),
        createdBy: ctx.user.id,
      })
    }
    await recordAudit(tx, actorOf(ctx), {
      action: 'interview.scheduled',
      entityType: 'application',
      entityId: applicationId,
      summary: `Entrevista agendada (${MODE_LABELS[data.mode]}) com ${participants.length} entrevistador(es)`,
      changes: { interviewId: interview.id, startsAt: startsAt.toISOString(), participants: participants.map((p) => p.id), notified: data.notifyCandidate },
    })
    return interview.id
  })
}

export async function cancelInterview(ctx: RequestContext, interviewId: string, reason: string): Promise<void> {
  if (!can(ctx.user.role, 'interview.schedule')) throw forbidden()
  const cleanReason = parseInput(z.string().trim().min(3, 'Indique o motivo'), reason)
  await withTenant(ctx.tenantId, async (tx) => {
    const [interview] = await tx<{ applicationId: string; status: string; startsAt: Date; durationMinutes: number; icsSequence: number; location: string | null; mode: keyof typeof MODE_LABELS }[]>`
      select application_id, status, starts_at, duration_minutes, ics_sequence, location, mode from interviews where id = ${interviewId} for update
    `
    if (!interview) throw notFound('Entrevista')
    if (interview.status !== 'scheduled') throw new AppError('CONFLICT', 'A entrevista já não está agendada.')
    const app = await loadApplicationForInterview(tx, ctx, interview.applicationId)
    const settings = await loadSettings(tx, ctx.tenantId)
    const sequence = interview.icsSequence + 1
    await tx`update interviews set status = 'cancelled', ics_sequence = ${sequence} where id = ${interviewId}`
    if (app.candidateEmail) {
      const ics = buildIcs({
        uid: `${interviewId}@agoramoz-hr`,
        sequence,
        method: 'CANCEL',
        start: interview.startsAt,
        durationMinutes: interview.durationMinutes,
        summary: `Entrevista cancelada — ${app.vacancyTitle}`,
        description: 'A entrevista foi cancelada.',
        location: interview.location ?? MODE_LABELS[interview.mode],
        organizerEmail: emailAddressOf(env().EMAIL_FROM),
        organizerName: app.orgName,
        attendees: [{ email: app.candidateEmail, name: app.candidateName }],
      })
      await enqueueTemplateMessage(tx, actorOf(ctx), {
        candidateId: app.candidateId,
        applicationId: app.applicationId,
        to: app.candidateEmail,
        templateKey: 'interview_cancelled',
        vars: { candidato: app.candidateName.split(' ')[0], vaga: app.vacancyTitle, empresa: app.orgName, referencia: app.reference, data_entrevista: formatDateTime(interview.startsAt, settings.timezone) },
        idempotencyKey: `interview_cancelled:${interviewId}`,
        attachments: [{ filename: 'cancelamento.ics', contentType: 'text/calendar; charset=utf-8; method=CANCEL', content: Buffer.from(ics).toString('base64') }],
        createdBy: ctx.user.id,
      })
    }
    await recordAudit(tx, actorOf(ctx), {
      action: 'interview.cancelled',
      entityType: 'application',
      entityId: interview.applicationId,
      summary: 'Entrevista cancelada',
      changes: { interviewId },
      reason: cleanReason,
    })
  })
}

export async function completeInterview(ctx: RequestContext, interviewId: string): Promise<void> {
  if (!can(ctx.user.role, 'interview.schedule')) throw forbidden()
  await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<{ applicationId: string }[]>`
      update interviews set status = 'completed' where id = ${interviewId} and status = 'scheduled' returning application_id
    `
    if (!row) throw new AppError('CONFLICT', 'A entrevista não está agendada.')
    await recordAudit(tx, actorOf(ctx), { action: 'interview.completed', entityType: 'application', entityId: row.applicationId, summary: 'Entrevista marcada como realizada', changes: { interviewId } })
  })
}

export interface MyInterview {
  id: string
  applicationId: string
  startsAt: Date
  durationMinutes: number
  mode: keyof typeof MODE_LABELS
  location: string | null
  status: string
  candidateName: string
  vacancyTitle: string
  scorecardStatus: 'draft' | 'submitted' | null
  isPast: boolean
}

/** Agenda do entrevistador: só as suas entrevistas, com o estado do seu scorecard. */
export async function listMyInterviews(ctx: RequestContext): Promise<MyInterview[]> {
  if (!can(ctx.user.role, 'interview.view_assigned')) throw forbidden()
  return withTenant(ctx.tenantId, (tx) => tx<MyInterview[]>`
    select i.id, i.application_id, i.starts_at, i.duration_minutes, i.mode, i.location, i.status, c.full_name as candidate_name,
      coalesce(vv.title, 'Candidatura') as vacancy_title, i.starts_at < now() as is_past,
      (select s.status from scorecards s where s.interview_id = i.id and s.author_id = ${ctx.user.id}) as scorecard_status
    from interviews i
    join interview_participants p on p.interview_id = i.id and p.user_id = ${ctx.user.id}
    join applications a on a.id = i.application_id
    join candidates c on c.id = a.candidate_id
    left join vacancy_versions vv on vv.id = a.vacancy_version_id
    where i.status <> 'cancelled'
    order by i.starts_at desc
    limit 100
  `)
}

export interface ScorecardForm {
  interviewId: string
  applicationId: string
  candidateName: string
  vacancyTitle: string
  startsAt: Date
  competencies: Competency[]
  criteriaVersionId: string
  existing: { ratings: Rating[]; recommendation: Recommendation | null; summary: string | null; status: 'draft' | 'submitted' } | null
}

async function participantInterview(tx: Tx, ctx: RequestContext, interviewId: string) {
  const [row] = await tx<{ applicationId: string; startsAt: Date; candidateName: string; vacancyTitle: string; competencies: Competency[] | null; versionId: string | null; status: string }[]>`
    select i.application_id, i.starts_at, c.full_name as candidate_name, coalesce(vv.title, 'Candidatura') as vacancy_title,
      vv.competencies, vv.id as version_id, i.status
    from interviews i
    join interview_participants p on p.interview_id = i.id and p.user_id = ${ctx.user.id}
    join applications a on a.id = i.application_id
    join candidates c on c.id = a.candidate_id
    left join vacancy_versions vv on vv.id = a.vacancy_version_id
    where i.id = ${interviewId}
  `
  if (!row) throw notFound('Entrevista')
  if (!row.competencies || !row.versionId) throw new AppError('CONFLICT', 'Esta candidatura não tem critérios publicados.')
  return { ...row, competencies: row.competencies, versionId: row.versionId }
}

export async function getScorecardForm(ctx: RequestContext, interviewId: string): Promise<ScorecardForm> {
  if (!can(ctx.user.role, 'scorecard.submit')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const interview = await participantInterview(tx, ctx, interviewId)
    const [existing] = await tx<{ ratings: Rating[]; recommendation: Recommendation | null; summary: string | null; status: 'draft' | 'submitted' }[]>`
      select ratings, recommendation, summary, status from scorecards where interview_id = ${interviewId} and author_id = ${ctx.user.id}
    `
    return {
      interviewId,
      applicationId: interview.applicationId,
      candidateName: interview.candidateName,
      vacancyTitle: interview.vacancyTitle,
      startsAt: interview.startsAt,
      competencies: interview.competencies,
      criteriaVersionId: interview.versionId,
      existing: existing ?? null,
    }
  })
}

const recommendationKeys = Object.keys(RECOMMENDATION_LABELS) as [Recommendation, ...Recommendation[]]

/** Guarda rascunho ou submete. Depois de submetido o scorecard não muda (critério versionado, HR-041). */
export async function saveScorecard(ctx: RequestContext, interviewId: string, input: Record<string, unknown>): Promise<void> {
  if (!can(ctx.user.role, 'scorecard.submit')) throw forbidden()
  const submit = input.intent === 'submit'
  await withTenant(ctx.tenantId, async (tx) => {
    const interview = await participantInterview(tx, ctx, interviewId)
    if (interview.status === 'cancelled') throw new AppError('CONFLICT', 'A entrevista foi cancelada.')
    const ratings: Rating[] = interview.competencies.map((competency) => ({
      competencyId: competency.id,
      rating: Number(input[`rating_${competency.id}`] ?? 0),
      evidence: String(input[`evidence_${competency.id}`] ?? '').trim().slice(0, 1500),
    }))
    const recommendation = recommendationKeys.includes(input.recommendation as Recommendation) ? (input.recommendation as Recommendation) : null
    const summary = String(input.summary ?? '').trim().slice(0, 3000) || null
    if (submit) {
      const fieldErrors: Record<string, string> = {}
      for (const rating of ratings) {
        if (rating.rating < 1 || rating.rating > 4) fieldErrors[`rating_${rating.competencyId}`] = 'Avalie de 1 a 4'
        if (rating.evidence.length < 10) fieldErrors[`evidence_${rating.competencyId}`] = 'Descreva a evidência observada (mín. 10 caracteres)'
      }
      if (!recommendation) fieldErrors.recommendation = 'Escolha uma recomendação'
      if (Object.keys(fieldErrors).length > 0) throw new AppError('VALIDATION', 'Complete o scorecard antes de submeter.', fieldErrors)
    }
    const [current] = await tx<{ status: string }[]>`select status from scorecards where interview_id = ${interviewId} and author_id = ${ctx.user.id} for update`
    if (current?.status === 'submitted') throw new AppError('CONFLICT', 'Este scorecard já foi submetido e não pode ser alterado.')
    await tx`
      insert into scorecards (tenant_id, interview_id, application_id, author_id, criteria_version_id, ratings, recommendation, summary, status, submitted_at)
      values (${ctx.tenantId}, ${interviewId}, ${interview.applicationId}, ${ctx.user.id}, ${interview.versionId}, ${tx.json(ratings as never)},
        ${recommendation}, ${summary}, ${submit ? 'submitted' : 'draft'}, ${submit ? new Date() : null})
      on conflict (interview_id, author_id) do update set
        ratings = excluded.ratings, recommendation = excluded.recommendation, summary = excluded.summary,
        status = excluded.status, submitted_at = excluded.submitted_at
    `
    if (submit) {
      await recordAudit(tx, actorOf(ctx), {
        action: 'scorecard.submitted',
        entityType: 'application',
        entityId: interview.applicationId,
        summary: `Scorecard submetido: ${RECOMMENDATION_LABELS[recommendation!]}`,
        changes: { interviewId, recommendation, ratings: ratings.map((rating) => rating.rating) },
      })
    }
  })
}

export interface InterviewSummary {
  id: string
  startsAt: Date
  durationMinutes: number
  mode: keyof typeof MODE_LABELS
  location: string | null
  status: string
  participants: { userId: string; fullName: string; submitted: boolean }[]
}

export interface ApplicationInterviews {
  interviews: InterviewSummary[]
  consolidation: Consolidation | null
  feedbackHidden: boolean
  ownPending: { interviewId: string }[]
}

/** Entrevistas de uma candidatura e consolidação dos scorecards, respeitando a regra de visibilidade. */
export async function getApplicationInterviews(ctx: RequestContext, applicationId: string): Promise<ApplicationInterviews> {
  return withTenant(ctx.tenantId, async (tx) => {
    await loadApplicationForInterview(tx, ctx, applicationId)
    const settings = await loadSettings(tx, ctx.tenantId)
    const interviews = await tx<InterviewSummary[]>`
      select i.id, i.starts_at, i.duration_minutes, i.mode, i.location, i.status,
        coalesce(json_agg(json_build_object(
          'userId', u.id, 'fullName', u.full_name,
          'submitted', exists (select 1 from scorecards s where s.interview_id = i.id and s.author_id = u.id and s.status = 'submitted')
        ) order by u.full_name) filter (where u.id is not null), '[]') as participants
      from interviews i
      left join interview_participants p on p.interview_id = i.id
      left join users u on u.id = p.user_id
      where i.application_id = ${applicationId}
      group by i.id
      order by i.starts_at desc
    `
    const mine = interviews.filter((interview) => interview.status !== 'cancelled' && interview.participants.some((p) => p.userId === ctx.user.id))
    const ownPending = mine.filter((interview) => !interview.participants.find((p) => p.userId === ctx.user.id)?.submitted).map((interview) => ({ interviewId: interview.id }))
    const visible = canSeeOthersFeedback({
      hideUntilSubmitted: settings.hideFeedbackUntilSubmitted,
      viewerHasViewAll: can(ctx.user.role, 'scorecard.view_all'),
      viewerIsParticipant: mine.length > 0,
      viewerSubmitted: ownPending.length === 0,
    })
    if (!visible) return { interviews, consolidation: null, feedbackHidden: true, ownPending }
    const [version] = await tx<{ competencies: Competency[] | null }[]>`
      select vv.competencies from applications a left join vacancy_versions vv on vv.id = a.vacancy_version_id where a.id = ${applicationId}
    `
    const cards = await tx<SubmittedScorecard[]>`
      select s.author_id, u.full_name as author_name, s.ratings, s.recommendation, s.summary
      from scorecards s join users u on u.id = s.author_id
      where s.application_id = ${applicationId} and s.status = 'submitted'
      order by s.submitted_at
    `
    return {
      interviews,
      consolidation: cards.length > 0 ? consolidate(version?.competencies ?? [], cards) : null,
      feedbackHidden: false,
      ownPending,
    }
  })
}
