import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { withTenant, type Tx } from '@/server/db/client'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can } from '@/server/auth/rbac'
import { parseInput } from '@/server/validation'
import { slugify } from '@/lib/text'
import type { Competency, Requirement } from '@/modules/requisitions/schema'
import { DEFAULT_STAGES, parseScreeningQuestions, publishSchema, type ScreeningQuestion, type StageKind } from './schema'

export interface VacancyListRow {
  id: string
  slug: string
  status: 'draft' | 'published' | 'closed'
  title: string
  location: string
  requisitionCode: string
  ownerName: string
  publishedAt: Date | null
  closesOn: string | null
  activeCount: number
  newCount: number
  hiredCount: number
  headcount: number
}

export interface VacancyVersion {
  id: string
  version: number
  title: string
  summary: string
  description: string
  requirements: Requirement[]
  competencies: Competency[]
  screeningQuestions: ScreeningQuestion[]
  location: string
  contractType: string
  salaryVisible: boolean
  salaryMin: string | null
  salaryMax: string | null
  closesOn: string | null
  publishedAt: Date
}

export interface StageRow {
  id: string
  position: number
  name: string
  kind: StageKind
}

export interface VacancyDetail {
  id: string
  slug: string
  status: 'draft' | 'published' | 'closed'
  ownerId: string
  ownerName: string
  requisitionId: string
  requisitionCode: string
  requisitionTitle: string
  requisitionDepartmentId: string | null
  requestedBy: string
  location: string
  contractType: string
  headcount: number
  salaryMin: string | null
  salaryMax: string | null
  requirements: Requirement[]
  competencies: Competency[]
  publishedAt: Date | null
  closedAt: Date | null
  currentVersion: VacancyVersion | null
  versionCount: number
  stages: StageRow[]
}

/** Gestores requisitantes vêem vagas das suas requisições/departamento; entrevistadores não acedem a vagas. */
export function vacancyScope(tx: Tx, ctx: RequestContext) {
  if (ctx.user.role !== 'hiring_manager') return tx``
  return tx`and (r.requested_by = ${ctx.user.id} or r.department_id = ${ctx.user.departmentId ?? null})`
}

export async function listVacancies(ctx: RequestContext, status?: string): Promise<VacancyListRow[]> {
  if (!can(ctx.user.role, 'vacancy.view')) throw forbidden()
  return withTenant(ctx.tenantId, (tx) => tx<VacancyListRow[]>`
    select v.id, v.slug, v.status, coalesce(vv.title, r.title) as title, coalesce(vv.location, r.location) as location,
      r.code as requisition_code, u.full_name as owner_name, v.published_at, vv.closes_on::text as closes_on, r.headcount,
      (select count(*)::int from applications a where a.vacancy_id = v.id and a.status = 'active') as active_count,
      (select count(*)::int from applications a join pipeline_stages s on s.id = a.stage_id
        where a.vacancy_id = v.id and a.status = 'active' and s.kind = 'new') as new_count,
      (select count(*)::int from applications a where a.vacancy_id = v.id and a.status = 'hired') as hired_count
    from vacancies v
    join requisitions r on r.id = v.requisition_id
    join users u on u.id = v.owner_id
    left join vacancy_versions vv on vv.id = v.published_version_id
    where true ${status ? tx`and v.status = ${status}` : tx``} ${vacancyScope(tx, ctx)}
    order by (v.status = 'published') desc, v.created_at desc
  `)
}

async function loadVersion(tx: Tx, versionId: string | null): Promise<VacancyVersion | null> {
  if (!versionId) return null
  const [row] = await tx<VacancyVersion[]>`
    select id, version, title, summary, description, requirements, competencies, screening_questions, location,
      contract_type, salary_visible, salary_min, salary_max, closes_on::text as closes_on, published_at
    from vacancy_versions where id = ${versionId}
  `
  return row ?? null
}

export async function getVacancy(ctx: RequestContext, id: string): Promise<VacancyDetail> {
  if (!can(ctx.user.role, 'vacancy.view')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx<(Omit<VacancyDetail, 'currentVersion' | 'stages'> & { publishedVersionId: string | null })[]>`
      select v.id, v.slug, v.status, v.owner_id, u.full_name as owner_name, r.id as requisition_id, r.code as requisition_code,
        r.title as requisition_title, r.department_id as requisition_department_id, r.requested_by, r.location, r.contract_type,
        r.headcount, r.salary_min, r.salary_max, r.requirements, r.competencies, v.published_at, v.closed_at,
        v.published_version_id,
        (select count(*)::int from vacancy_versions x where x.vacancy_id = v.id) as version_count
      from vacancies v join requisitions r on r.id = v.requisition_id join users u on u.id = v.owner_id
      where v.id = ${id} ${vacancyScope(tx, ctx)}
    `
    if (!row) throw notFound('Vaga')
    const stages = await tx<StageRow[]>`select id, position, name, kind from pipeline_stages where vacancy_id = ${id} order by position`
    const { publishedVersionId, ...rest } = row
    return { ...rest, currentVersion: await loadVersion(tx, publishedVersionId), stages }
  })
}

async function uniqueSlug(tx: Tx, title: string): Promise<string> {
  const base = slugify(title, 60)
  const [taken] = await tx`select 1 from vacancies where slug = ${base}`
  return taken ? `${base}-${randomBytes(2).toString('hex')}` : base
}

/** Cria a vaga (rascunho) a partir de uma requisição aprovada, com o pipeline padrão. */
export async function createVacancyFromRequisition(ctx: RequestContext, requisitionId: string, ownerId?: string): Promise<string> {
  if (!can(ctx.user.role, 'vacancy.manage')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const [requisition] = await tx<{ status: string; title: string; code: string }[]>`
      select status, title, code from requisitions where id = ${requisitionId} for update
    `
    if (!requisition) throw notFound('Requisição')
    if (requisition.status !== 'approved') throw new AppError('CONFLICT', 'Só requisições aprovadas dão origem a vagas.')
    const [existing] = await tx<{ id: string }[]>`select id from vacancies where requisition_id = ${requisitionId}`
    if (existing) return existing.id
    const owner = ownerId ?? ctx.user.id
    const [vacancy] = await tx<{ id: string }[]>`
      insert into vacancies (tenant_id, requisition_id, slug, owner_id)
      values (${ctx.tenantId}, ${requisitionId}, ${await uniqueSlug(tx, requisition.title)}, ${owner})
      returning id
    `
    if (!vacancy) throw new Error('insert falhou')
    for (const [index, stage] of DEFAULT_STAGES.entries()) {
      await tx`
        insert into pipeline_stages (tenant_id, vacancy_id, position, name, kind)
        values (${ctx.tenantId}, ${vacancy.id}, ${index + 1}, ${stage.name}, ${stage.kind})
      `
    }
    await recordAudit(tx, actorOf(ctx), {
      action: 'vacancy.created',
      entityType: 'vacancy',
      entityId: vacancy.id,
      summary: `Vaga criada a partir de ${requisition.code}`,
      changes: { requisitionId, ownerId: owner },
    })
    return vacancy.id
  })
}

/**
 * Publica uma nova versão imutável. Requisitos e competências vêm da requisição aprovada;
 * o texto público é editável a cada versão. A versão anterior continua ligada às candidaturas que a viram.
 */
export async function publishVacancy(ctx: RequestContext, vacancyId: string, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'vacancy.manage')) throw forbidden()
  const data = parseInput(publishSchema, input)
  const questions = parseScreeningQuestions(data.screeningQuestions)
  await withTenant(ctx.tenantId, async (tx) => {
    const [vacancy] = await tx<{
      status: string
      requisitionStatus: string
      title: string
      location: string
      contractType: string
      requirements: unknown
      competencies: unknown
      salaryMin: string | null
      salaryMax: string | null
      code: string
    }[]>`
      select v.status, r.status as requisition_status, r.title, r.location, r.contract_type, r.requirements, r.competencies,
        r.salary_min, r.salary_max, r.code
      from vacancies v join requisitions r on r.id = v.requisition_id
      where v.id = ${vacancyId} for update of v
    `
    if (!vacancy) throw notFound('Vaga')
    if (vacancy.requisitionStatus !== 'approved') throw new AppError('CONFLICT', 'Nenhuma vaga é publicada sem requisição aprovada.')
    const [{ next } = { next: 1 }] = await tx<{ next: number }[]>`
      select coalesce(max(version), 0)::int + 1 as next from vacancy_versions where vacancy_id = ${vacancyId}
    `
    const [version] = await tx<{ id: string }[]>`
      insert into vacancy_versions (
        tenant_id, vacancy_id, version, title, summary, description, requirements, competencies, screening_questions,
        location, contract_type, salary_visible, salary_min, salary_max, closes_on, published_by
      ) values (
        ${ctx.tenantId}, ${vacancyId}, ${next}, ${vacancy.title}, ${data.summary}, ${data.description},
        ${tx.json(vacancy.requirements as never)}, ${tx.json(vacancy.competencies as never)}, ${tx.json(questions as never)},
        ${vacancy.location}, ${vacancy.contractType}, ${data.salaryVisible}, ${vacancy.salaryMin}, ${vacancy.salaryMax},
        ${data.closesOn}, ${ctx.user.id}
      ) returning id
    `
    if (!version) throw new Error('insert falhou')
    await tx`
      update vacancies set status = 'published', published_version_id = ${version.id},
        published_at = coalesce(published_at, now()), closed_at = null
      where id = ${vacancyId}
    `
    await recordAudit(tx, actorOf(ctx), {
      action: 'vacancy.published',
      entityType: 'vacancy',
      entityId: vacancyId,
      summary: `Versão ${next} publicada (${vacancy.code})`,
      changes: { version: next, status: { from: vacancy.status, to: 'published' }, screeningQuestions: questions.length },
    })
  })
}

export async function closeVacancy(ctx: RequestContext, vacancyId: string, reason: string): Promise<void> {
  if (!can(ctx.user.role, 'vacancy.manage')) throw forbidden()
  const cleanReason = parseInput(z.string().trim().min(3, 'Indique o motivo do fecho'), reason)
  await withTenant(ctx.tenantId, async (tx) => {
    const [vacancy] = await tx<{ status: string }[]>`select status from vacancies where id = ${vacancyId} for update`
    if (!vacancy) throw notFound('Vaga')
    if (vacancy.status !== 'published') throw new AppError('CONFLICT', 'Apenas vagas publicadas podem ser fechadas.')
    await tx`update vacancies set status = 'closed', closed_at = now() where id = ${vacancyId}`
    await recordAudit(tx, actorOf(ctx), {
      action: 'vacancy.closed',
      entityType: 'vacancy',
      entityId: vacancyId,
      summary: 'Vaga fechada a novas candidaturas',
      changes: { status: { from: 'published', to: 'closed' } },
      reason: cleanReason,
    })
  })
}

// ---------------------------------------------------------------------------
// Leitura pública (página de carreiras): só versões publicadas de vagas abertas.
// ---------------------------------------------------------------------------

export interface PublicVacancy {
  vacancyId: string
  slug: string
  versionId: string
  title: string
  summary: string
  description: string
  location: string
  contractType: string
  salaryVisible: boolean
  salaryMin: string | null
  salaryMax: string | null
  closesOn: string | null
  requirements: Requirement[]
  screeningQuestions: ScreeningQuestion[]
  publishedAt: Date
}

const PUBLIC_COLUMNS = (tx: Tx) => tx`
  v.id as vacancy_id, v.slug, vv.id as version_id, vv.title, vv.summary, vv.description, vv.location, vv.contract_type,
  vv.salary_visible, case when vv.salary_visible then vv.salary_min end as salary_min,
  case when vv.salary_visible then vv.salary_max end as salary_max, vv.closes_on::text as closes_on, vv.requirements,
  vv.screening_questions, vv.published_at
`

const OPEN_FILTER = (tx: Tx) => tx`v.status = 'published' and (vv.closes_on is null or vv.closes_on >= (now() at time zone 'Africa/Maputo')::date)`

export async function listPublicVacancies(tenantId: string): Promise<PublicVacancy[]> {
  return withTenant(tenantId, (tx) => tx<PublicVacancy[]>`
    select ${PUBLIC_COLUMNS(tx)}
    from vacancies v join vacancy_versions vv on vv.id = v.published_version_id
    where ${OPEN_FILTER(tx)}
    order by vv.published_at desc
  `)
}

export async function getPublicVacancy(tenantId: string, slug: string): Promise<PublicVacancy | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx<PublicVacancy[]>`
      select ${PUBLIC_COLUMNS(tx)}
      from vacancies v join vacancy_versions vv on vv.id = v.published_version_id
      where v.slug = ${slug} and ${OPEN_FILTER(tx)}
    `
    return row ?? null
  })
}
