import { withTenant } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import type { EvidenceReport } from '@/modules/evidence/engine'
import type { Competency, Requirement } from '@/modules/requisitions/schema'
import type { ScreeningQuestion, StageKind } from '@/modules/vacancies/schema'
import { applicationScope } from './scope'

export interface ApplicationDetail {
  id: string
  reference: string
  status: 'active' | 'hired' | 'rejected' | 'withdrawn'
  source: string
  createdAt: Date
  stageEnteredAt: Date
  decidedAt: Date | null
  rejectionReason: string | null
  rejectionNote: string | null
  tags: string[]
  coverNote: string | null
  answers: { questionId: string; answer: string }[]
  evidence: EvidenceReport | null
  ownerId: string | null
  ownerName: string | null
  stageId: string | null
  stageName: string | null
  stageKind: StageKind | null
  candidate: {
    id: string
    fullName: string
    email: string | null
    phone: string | null
    location: string | null
    consentTalentPool: boolean
    consentWhatsapp: boolean
    anonymized: boolean
    hasOpenDuplicate: boolean
  }
  vacancy: {
    id: string
    title: string
    version: number
    requirements: Requirement[]
    competencies: Competency[]
    screeningQuestions: ScreeningQuestion[]
  } | null
  stages: { id: string; name: string; kind: StageKind; position: number }[]
  files: { id: string; filename: string; sizeBytes: number; hasText: boolean; scanStatus: string; createdAt: Date }[]
  comments: { id: string; body: string; authorName: string; createdAt: Date }[]
  timeline: { action: string; summary: string; actorName: string | null; actorType: string; occurredAt: Date; reason: string | null }[]
  contactHidden: boolean
}

export async function getApplicationDetail(ctx: RequestContext, applicationId: string): Promise<ApplicationDetail> {
  const canView = can(ctx.user.role, 'application.view') || can(ctx.user.role, 'interview.view_assigned')
  if (!canView) throw forbidden()
  // Entrevistadores não precisam dos contactos do candidato para avaliar.
  const contactHidden = ctx.user.role === 'interviewer'
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<(Omit<ApplicationDetail, 'candidate' | 'vacancy' | 'stages' | 'files' | 'comments' | 'timeline' | 'contactHidden'> & {
      candidateId: string
      fullName: string
      email: string | null
      phone: string | null
      location: string | null
      consentTalentPool: boolean
      consentWhatsapp: boolean
      anonymizedAt: Date | null
      hasOpenDuplicate: boolean
      vacancyId: string | null
      vacancyTitle: string | null
      version: number | null
      requirements: Requirement[] | null
      competencies: Competency[] | null
      screeningQuestions: ScreeningQuestion[] | null
    })[]>`
      select a.id, a.reference, a.status, a.source, a.created_at, a.stage_entered_at, a.decided_at, a.rejection_reason, a.rejection_note,
        a.tags, a.cover_note, a.answers, a.evidence, a.owner_id, u.full_name as owner_name, a.stage_id, s.name as stage_name, s.kind as stage_kind,
        c.id as candidate_id, c.full_name, c.email, c.phone, c.location, c.consent_talent_pool, c.consent_whatsapp, c.anonymized_at,
        exists (select 1 from duplicate_suggestions d where d.status = 'open' and (d.candidate_a = c.id or d.candidate_b = c.id)) as has_open_duplicate,
        a.vacancy_id, vv.title as vacancy_title, vv.version, vv.requirements, vv.competencies, vv.screening_questions
      from applications a
      join candidates c on c.id = a.candidate_id
      left join users u on u.id = a.owner_id
      left join pipeline_stages s on s.id = a.stage_id
      left join vacancy_versions vv on vv.id = a.vacancy_version_id
      where a.id = ${applicationId} ${applicationScope(tx, ctx)}
    `
    if (!row) throw notFound('Candidatura')
    const stages = row.vacancyId
      ? await tx<ApplicationDetail['stages']>`select id, name, kind, position from pipeline_stages where vacancy_id = ${row.vacancyId} order by position`
      : []
    const files = await tx<ApplicationDetail['files']>`
      select id, filename, size_bytes, text_content is not null as has_text, scan_status, created_at
      from candidate_files where candidate_id = ${row.candidateId} order by (application_id = ${applicationId}) desc nulls last, created_at desc
    `
    const comments = contactHidden
      ? []
      : await tx<ApplicationDetail['comments']>`
          select c.id, c.body, u.full_name as author_name, c.created_at from comments c join users u on u.id = c.author_id
          where c.application_id = ${applicationId} order by c.created_at
        `
    const timeline = contactHidden
      ? []
      : await tx<ApplicationDetail['timeline']>`
          select e.action, e.summary, u.full_name as actor_name, e.actor_type, e.occurred_at, e.reason
          from audit_events e left join users u on u.id = e.actor_id
          where e.entity_type = 'application' and e.entity_id = ${applicationId}
          order by e.occurred_at desc limit 100
        `
    await recordAudit(tx, actorOf(ctx), { action: 'application.viewed', entityType: 'application', entityId: applicationId, summary: 'Dossier de candidatura consultado' })
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      source: row.source,
      createdAt: row.createdAt,
      stageEnteredAt: row.stageEnteredAt,
      decidedAt: row.decidedAt,
      rejectionReason: row.rejectionReason,
      rejectionNote: row.rejectionNote,
      tags: row.tags,
      coverNote: row.coverNote,
      answers: row.answers,
      evidence: row.evidence,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      stageId: row.stageId,
      stageName: row.stageName,
      stageKind: row.stageKind,
      candidate: {
        id: row.candidateId,
        fullName: row.fullName,
        email: contactHidden ? null : row.email,
        phone: contactHidden ? null : row.phone,
        location: row.location,
        consentTalentPool: row.consentTalentPool,
        consentWhatsapp: row.consentWhatsapp,
        anonymized: row.anonymizedAt !== null,
        hasOpenDuplicate: row.hasOpenDuplicate,
      },
      vacancy:
        row.vacancyId && row.vacancyTitle && row.version !== null
          ? {
              id: row.vacancyId,
              title: row.vacancyTitle,
              version: row.version,
              requirements: row.requirements ?? [],
              competencies: row.competencies ?? [],
              screeningQuestions: row.screeningQuestions ?? [],
            }
          : null,
      stages,
      files,
      comments,
      timeline,
      contactHidden,
    }
  })
}
