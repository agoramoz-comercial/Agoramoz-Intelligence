import { z } from 'zod'
import { withTenant } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { parseInput } from '@/server/validation'
import { storage } from '@/server/storage/storage'
import { normalizeText } from '@/lib/text'
import { candidateFieldsSchema, intakeApplication, APPLICATION_SOURCES, type IntakeResult, type UploadedFile } from '@/modules/applications/intake'
import { applicationScope } from '@/modules/applications/scope'
import type { Requirement } from '@/modules/requisitions/schema'
import type { ScreeningQuestion } from '@/modules/vacancies/schema'

export interface CandidateListRow {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  location: string | null
  source: string
  createdAt: Date
  applicationCount: number
  lastStage: string | null
  lastVacancy: string | null
  lastStatus: string | null
  consentTalentPool: boolean
  hasDuplicate: boolean
  anonymized: boolean
}

export interface CandidateFilters {
  q?: string
  vacancyId?: string
  source?: string
  status?: string
  talentPool?: boolean
  page?: number
}

const PAGE_SIZE = 50

/** Pesquisa por nome, email, telefone ou localidade (sem acentos) e filtros de processo. */
export async function searchCandidates(ctx: RequestContext, filters: CandidateFilters): Promise<{ rows: CandidateListRow[]; total: number; pageSize: number }> {
  if (!can(ctx.user.role, 'candidate.view')) throw forbidden()
  const page = Math.max(1, filters.page ?? 1)
  const terms = normalizeText(filters.q ?? '')
    .split(' ')
    .filter((term) => term.length >= 2)
    .map((term) => `${term.replace(/[^a-z0-9@.+]/g, '')}:*`)
    .filter((term) => term.length > 2)
  const tsQuery = terms.join(' & ')
  return withTenant(ctx.tenantId, async (tx) => {
    const where = tx`
      where true
        ${tsQuery ? tx`and c.search_text @@ to_tsquery('simple', ${tsQuery})` : tx``}
        ${filters.source ? tx`and c.source = ${filters.source}` : tx``}
        ${filters.talentPool ? tx`and c.consent_talent_pool and c.anonymized_at is null` : tx``}
        ${filters.vacancyId || filters.status ? tx`and exists (
          select 1 from applications a where a.candidate_id = c.id
            ${filters.vacancyId ? tx`and a.vacancy_id = ${filters.vacancyId}` : tx``}
            ${filters.status ? tx`and a.status = ${filters.status}` : tx``}
        )` : tx``}
    `
    const [{ total } = { total: 0 }] = await tx<{ total: number }[]>`select count(*)::int as total from candidates c ${where}`
    const rows = await tx<CandidateListRow[]>`
      select c.id, c.full_name, c.email, c.phone, c.location, c.source, c.created_at, c.consent_talent_pool,
        c.anonymized_at is not null as anonymized,
        (select count(*)::int from applications a where a.candidate_id = c.id) as application_count,
        last.stage_name as last_stage, last.vacancy_title as last_vacancy, last.status as last_status,
        exists (select 1 from duplicate_suggestions d where d.status = 'open' and (d.candidate_a = c.id or d.candidate_b = c.id)) as has_duplicate
      from candidates c
      left join lateral (
        select s.name as stage_name, coalesce(vv.title, 'Espontânea') as vacancy_title, a.status
        from applications a left join pipeline_stages s on s.id = a.stage_id left join vacancy_versions vv on vv.id = a.vacancy_version_id
        where a.candidate_id = c.id order by a.created_at desc limit 1
      ) last on true
      ${where}
      order by c.created_at desc
      limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
    `
    return { rows, total, pageSize: PAGE_SIZE }
  })
}

export interface CandidateDetail {
  candidate: {
    id: string
    fullName: string
    email: string | null
    phone: string | null
    location: string | null
    source: string
    consentProcessingAt: Date
    consentVersion: string
    consentTalentPool: boolean
    consentWhatsapp: boolean
    retentionUntil: string | null
    anonymizedAt: Date | null
    createdAt: Date
  }
  applications: { id: string; reference: string; vacancyId: string | null; vacancyTitle: string; stageName: string | null; status: string; createdAt: Date; source: string }[]
  files: { id: string; filename: string; mime: string; sizeBytes: number; scanStatus: string; hasText: boolean; createdAt: Date }[]
  duplicates: { id: string; otherId: string; otherName: string; otherEmail: string | null; reasons: string[]; createdAt: Date }[]
}

export async function getCandidate(ctx: RequestContext, candidateId: string): Promise<CandidateDetail> {
  if (!can(ctx.user.role, 'candidate.view')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const [candidate] = await tx<CandidateDetail['candidate'][]>`
      select id, full_name, email, phone, location, source, consent_processing_at, consent_version, consent_talent_pool,
        consent_whatsapp, retention_until::text as retention_until, anonymized_at, created_at
      from candidates where id = ${candidateId}
    `
    if (!candidate) throw notFound('Candidato')
    const applications = await tx<CandidateDetail['applications']>`
      select a.id, a.reference, a.vacancy_id, coalesce(vv.title, 'Candidatura espontânea') as vacancy_title, s.name as stage_name,
        a.status, a.created_at, a.source
      from applications a left join pipeline_stages s on s.id = a.stage_id left join vacancy_versions vv on vv.id = a.vacancy_version_id
      where a.candidate_id = ${candidateId} order by a.created_at desc
    `
    const files = await tx<CandidateDetail['files']>`
      select id, filename, mime, size_bytes, scan_status, text_content is not null as has_text, created_at
      from candidate_files where candidate_id = ${candidateId} order by created_at desc
    `
    const duplicates = await tx<CandidateDetail['duplicates']>`
      select d.id, o.id as other_id, o.full_name as other_name, o.email as other_email, d.reasons, d.created_at
      from duplicate_suggestions d
      join candidates o on o.id = case when d.candidate_a = ${candidateId} then d.candidate_b else d.candidate_a end
      where d.status = 'open' and (d.candidate_a = ${candidateId} or d.candidate_b = ${candidateId})
    `
    await recordAudit(tx, actorOf(ctx), { action: 'candidate.viewed', entityType: 'candidate', entityId: candidateId, summary: 'Perfil de candidato consultado' })
    return { candidate, applications, files, duplicates }
  })
}

/** Download de CV com verificação de acesso e registo de quem acedeu (§8.2 acesso need-to-know). */
export async function readCandidateFile(ctx: RequestContext, fileId: string): Promise<{ filename: string; mime: string; data: Buffer }> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [file] = await tx<{ filename: string; mime: string; storageKey: string; scanStatus: string; candidateId: string; applicationId: string | null }[]>`
      select filename, mime, storage_key, scan_status, candidate_id, application_id from candidate_files where id = ${fileId}
    `
    if (!file) throw notFound('Ficheiro')
    if (!can(ctx.user.role, 'candidate.view')) {
      if (!can(ctx.user.role, 'application.view') && !can(ctx.user.role, 'interview.view_assigned')) throw forbidden()
      const [allowed] = await tx`select 1 from applications a where a.candidate_id = ${file.candidateId} ${applicationScope(tx, ctx)} limit 1`
      if (!allowed) throw forbidden()
    }
    if (file.scanStatus !== 'clean') throw new AppError('FORBIDDEN', 'Ficheiro em quarentena: não pode ser descarregado.')
    const data = await storage().get(file.storageKey)
    await recordAudit(tx, actorOf(ctx), { action: 'file.downloaded', entityType: 'candidate', entityId: file.candidateId, summary: 'CV descarregado', changes: { fileId } })
    return { filename: file.filename, mime: file.mime, data }
  })
}

const manualSchema = candidateFieldsSchema.and(
  z.object({
    vacancyId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
    source: z.enum(APPLICATION_SOURCES).refine((value) => value !== 'careers_page', 'Origem inválida para registo manual'),
    consentConfirmed: z.literal(true, { message: 'Confirme que o candidato autorizou o tratamento dos dados' }),
    consentTalentPool: z.boolean().default(false),
    notifyCandidate: z.boolean().default(false),
    coverNote: z.string().trim().max(2000).nullish().transform((value) => value || null),
  }),
)

/** Registo manual por RH de candidaturas recebidas por email, WhatsApp ou referência. */
export async function createManualApplication(ctx: RequestContext, input: unknown, file: UploadedFile | null): Promise<IntakeResult> {
  if (!can(ctx.user.role, 'candidate.manage')) throw forbidden()
  const data = parseInput(manualSchema, input)
  const target = await withTenant(ctx.tenantId, async (tx) => {
    const [org] = await tx<{ slug: string; name: string }[]>`select slug, name from organizations where id = ${ctx.tenantId}`
    if (!org) throw notFound('Organização')
    if (!data.vacancyId) return { orgSlug: org.slug, orgName: org.name, vacancy: null }
    const [vacancy] = await tx<{ vacancyId: string; versionId: string | null; title: string; requirements: Requirement[]; screeningQuestions: ScreeningQuestion[] }[]>`
      select v.id as vacancy_id, vv.id as version_id, vv.title, vv.requirements, vv.screening_questions
      from vacancies v join vacancy_versions vv on vv.id = v.published_version_id
      where v.id = ${data.vacancyId} and v.status = 'published'
    `
    if (!vacancy?.versionId) throw new AppError('VALIDATION', 'Escolha uma vaga publicada.', { vacancyId: 'Vaga não publicada' })
    return { orgSlug: org.slug, orgName: org.name, vacancy: { ...vacancy, versionId: vacancy.versionId } }
  })
  return intakeApplication(
    actorOf(ctx),
    target,
    {
      candidate: { fullName: data.fullName, email: data.email, phone: data.phone, location: data.location },
      consentTalentPool: data.consentTalentPool,
      consentWhatsapp: false,
      consentRecordedAt: new Date(),
      coverNote: data.coverNote,
      answers: [],
      source: data.source,
      ownerId: ctx.user.id,
      notifyCandidate: data.notifyCandidate,
    },
    file,
  )
}

/**
 * Funde dois registos da mesma pessoa (decisão humana). As candidaturas, ficheiros e mensagens passam para o registo
 * mantido; os consentimentos opcionais seguem o registo mais recente (a declaração mais actual do titular).
 */
export async function mergeCandidates(ctx: RequestContext, keepId: string, mergeId: string): Promise<void> {
  if (!can(ctx.user.role, 'candidate.manage')) throw forbidden()
  if (keepId === mergeId) throw new AppError('VALIDATION', 'Escolha dois registos diferentes.')
  await withTenant(ctx.tenantId, async (tx) => {
    const records = await tx<{ id: string; createdAt: Date; consentTalentPool: boolean; consentWhatsapp: boolean; anonymizedAt: Date | null }[]>`
      select id, created_at, consent_talent_pool, consent_whatsapp, anonymized_at from candidates where id in (${keepId}, ${mergeId}) for update
    `
    if (records.length !== 2) throw notFound('Candidato')
    if (records.some((record) => record.anonymizedAt)) throw new AppError('CONFLICT', 'Registos anonimizados não podem ser fundidos.')
    const [conflict] = await tx`
      select 1 from applications a join applications b on a.vacancy_id = b.vacancy_id
      where a.candidate_id = ${keepId} and b.candidate_id = ${mergeId} and a.vacancy_id is not null
    `
    if (conflict) throw new AppError('CONFLICT', 'Ambos os registos têm candidatura à mesma vaga. Retire ou rejeite uma delas antes de fundir.')
    const newest = [...records].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!
    await tx`update applications set candidate_id = ${keepId} where candidate_id = ${mergeId}`
    await tx`update candidate_files set candidate_id = ${keepId} where candidate_id = ${mergeId}`
    await tx`update messages set candidate_id = ${keepId} where candidate_id = ${mergeId}`
    await tx`update data_subject_requests set candidate_id = ${keepId} where candidate_id = ${mergeId}`
    await tx`
      update candidates set consent_talent_pool = ${newest.consentTalentPool}, consent_whatsapp = ${newest.consentWhatsapp},
        retention_until = greatest(retention_until, (select retention_until from candidates where id = ${mergeId}))
      where id = ${keepId}
    `
    await tx`update duplicate_suggestions set status = 'merged', resolved_by = ${ctx.user.id}, resolved_at = now()
      where (candidate_a = ${keepId} and candidate_b = ${mergeId}) or (candidate_a = ${mergeId} and candidate_b = ${keepId})`
    await tx`delete from candidates where id = ${mergeId}`
    await recordAudit(tx, actorOf(ctx), {
      action: 'candidate.merged',
      entityType: 'candidate',
      entityId: keepId,
      summary: 'Registos duplicados fundidos por decisão humana',
      changes: { mergedCandidateId: mergeId },
    })
  })
}

export async function dismissDuplicate(ctx: RequestContext, suggestionId: string): Promise<void> {
  if (!can(ctx.user.role, 'candidate.manage')) throw forbidden()
  await withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<{ candidateA: string }[]>`
      update duplicate_suggestions set status = 'dismissed', resolved_by = ${ctx.user.id}, resolved_at = now()
      where id = ${suggestionId} and status = 'open' returning candidate_a
    `
    if (!row) throw notFound('Sugestão')
    await recordAudit(tx, actorOf(ctx), { action: 'duplicate.dismissed', entityType: 'candidate', entityId: row.candidateA, summary: 'Sugestão de duplicado descartada' })
  })
}
