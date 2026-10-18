import { z } from 'zod'
import { withTenant, type Tx } from '@/server/db/client'
import { formatCode, nextCounter } from '@/server/db/counters'
import { recordAudit } from '@/server/audit/audit'
import { actorOf, type RequestContext } from '@/server/context'
import { AppError, forbidden, notFound } from '@/server/errors'
import { can, isRole } from '@/server/auth/rbac'
import { parseInput } from '@/server/validation'
import { decisionBlock, firstStep, stepAfter, type ApprovalStep } from './approval'
import { parseCompetencies, parseRequirements, requisitionFormSchema, type Competency, type Requirement } from './schema'

export interface RequisitionRow {
  id: string
  code: string
  title: string
  departmentId: string | null
  departmentName: string | null
  location: string
  contractType: string
  headcount: number
  salaryMin: string | null
  salaryMax: string | null
  reason: string
  justification: string
  requirements: Requirement[]
  competencies: Competency[]
  requestedBy: string
  requesterName: string
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'cancelled'
  currentStep: number | null
  submittedAt: Date | null
  decidedAt: Date | null
  createdAt: Date
  vacancyId: string | null
}

export interface ApprovalRow {
  stepPosition: number
  role: string
  decision: 'approved' | 'rejected'
  comment: string | null
  decidedAt: Date
  deciderName: string
}

export interface RequisitionDetail {
  requisition: RequisitionRow
  steps: ApprovalStep[]
  approvals: ApprovalRow[]
  currentStep: ApprovalStep | null
  canDecide: boolean
  decisionBlockedReason: string | null
}

async function loadSteps(tx: Tx): Promise<ApprovalStep[]> {
  const rows = await tx<{ position: number; role: string; label: string; minSalaryMax: string | null }[]>`
    select position, role, label, min_salary_max from approval_steps order by position
  `
  return rows.flatMap((row) =>
    isRole(row.role)
      ? [{ position: row.position, role: row.role, label: row.label, minSalaryMax: row.minSalaryMax === null ? null : Number(row.minSalaryMax) }]
      : [],
  )
}

/** Gestores requisitantes vêem as suas requisições e as do seu departamento. */
function scopeFilter(tx: Tx, ctx: RequestContext) {
  if (ctx.user.role !== 'hiring_manager') return tx``
  return tx`and (r.requested_by = ${ctx.user.id} or r.department_id = ${ctx.user.departmentId ?? null})`
}

const REQUISITION_COLUMNS = (tx: Tx) => tx`
  r.id, r.code, r.title, r.department_id, d.name as department_name, r.location, r.contract_type, r.headcount,
  r.salary_min, r.salary_max, r.reason, r.justification, r.requirements, r.competencies, r.requested_by,
  u.full_name as requester_name, r.status, r.current_step, r.submitted_at, r.decided_at, r.created_at,
  v.id as vacancy_id
`

export async function listRequisitions(ctx: RequestContext, status?: string): Promise<RequisitionRow[]> {
  if (!can(ctx.user.role, 'requisition.view')) throw forbidden()
  return withTenant(ctx.tenantId, (tx) => tx<RequisitionRow[]>`
    select ${REQUISITION_COLUMNS(tx)}
    from requisitions r
    join users u on u.id = r.requested_by
    left join departments d on d.id = r.department_id
    left join vacancies v on v.requisition_id = r.id
    where true ${status ? tx`and r.status = ${status}` : tx``} ${scopeFilter(tx, ctx)}
    order by r.created_at desc
    limit 200
  `)
}

export async function getRequisition(ctx: RequestContext, id: string): Promise<RequisitionDetail> {
  if (!can(ctx.user.role, 'requisition.view')) throw forbidden()
  return withTenant(ctx.tenantId, async (tx) => {
    const [requisition] = await tx<RequisitionRow[]>`
      select ${REQUISITION_COLUMNS(tx)}
      from requisitions r
      join users u on u.id = r.requested_by
      left join departments d on d.id = r.department_id
      left join vacancies v on v.requisition_id = r.id
      where r.id = ${id} ${scopeFilter(tx, ctx)}
    `
    if (!requisition) throw notFound('Requisição')
    const steps = await loadSteps(tx)
    const approvals = await tx<ApprovalRow[]>`
      select a.step_position, a.role, a.decision, a.comment, a.decided_at, u.full_name as decider_name
      from requisition_approvals a join users u on u.id = a.decided_by
      where a.requisition_id = ${id} order by a.step_position
    `
    const currentStep = steps.find((step) => step.position === requisition.currentStep) ?? null
    const block = decisionBlock({
      status: requisition.status,
      requestedBy: requisition.requestedBy,
      userId: ctx.user.id,
      userRole: ctx.user.role,
      step: currentStep,
    })
    const reasons: Record<NonNullable<typeof block>, string> = {
      not_pending: 'A requisição não está em aprovação.',
      own_requisition: 'Separação de funções: não pode aprovar uma requisição que criou.',
      wrong_role: currentStep ? `Este passo é decidido pelo papel: ${currentStep.label}.` : '',
    }
    return {
      requisition,
      steps,
      approvals,
      currentStep,
      canDecide: block === null && can(ctx.user.role, 'requisition.approve'),
      decisionBlockedReason: block ? reasons[block] : null,
    }
  })
}

function toRecord(data: z.infer<typeof requisitionFormSchema>) {
  return {
    title: data.title,
    departmentId: data.departmentId ?? null,
    location: data.location,
    contractType: data.contractType,
    headcount: data.headcount,
    salaryMin: data.salaryMin,
    salaryMax: data.salaryMax,
    reason: data.reason,
    justification: data.justification,
    requirements: parseRequirements(data.requirementsMust, data.requirementsNice),
    competencies: parseCompetencies(data.competencies),
  }
}

export async function createRequisition(ctx: RequestContext, input: unknown): Promise<string> {
  if (!can(ctx.user.role, 'requisition.create')) throw forbidden()
  const record = toRecord(parseInput(requisitionFormSchema, input))
  return withTenant(ctx.tenantId, async (tx) => {
    const code = formatCode('REQ', await nextCounter(tx, ctx.tenantId, 'requisition'))
    const [row] = await tx<{ id: string }[]>`
      insert into requisitions (
        tenant_id, code, title, department_id, location, contract_type, headcount, salary_min, salary_max,
        reason, justification, requirements, competencies, requested_by
      ) values (
        ${ctx.tenantId}, ${code}, ${record.title}, ${record.departmentId}, ${record.location}, ${record.contractType},
        ${record.headcount}, ${record.salaryMin}, ${record.salaryMax}, ${record.reason}, ${record.justification},
        ${tx.json(record.requirements as never)}, ${tx.json(record.competencies as never)}, ${ctx.user.id}
      ) returning id
    `
    if (!row) throw new Error('insert falhou')
    await recordAudit(tx, actorOf(ctx), {
      action: 'requisition.created',
      entityType: 'requisition',
      entityId: row.id,
      summary: `Requisição ${code} criada: ${record.title}`,
      changes: { status: 'draft', headcount: record.headcount, salaryMax: record.salaryMax },
    })
    return row.id
  })
}

export async function updateRequisition(ctx: RequestContext, id: string, input: unknown): Promise<void> {
  const record = toRecord(parseInput(requisitionFormSchema, input))
  await withTenant(ctx.tenantId, async (tx) => {
    const [current] = await tx<{ status: string; requestedBy: string; code: string }[]>`
      select status, requested_by, code from requisitions where id = ${id} for update
    `
    if (!current) throw notFound('Requisição')
    if (current.requestedBy !== ctx.user.id && !can(ctx.user.role, 'vacancy.manage')) throw forbidden()
    if (current.status !== 'draft' && current.status !== 'rejected') {
      throw new AppError('CONFLICT', 'Só é possível editar requisições em rascunho ou rejeitadas.')
    }
    await tx`
      update requisitions set
        title = ${record.title}, department_id = ${record.departmentId}, location = ${record.location},
        contract_type = ${record.contractType}, headcount = ${record.headcount}, salary_min = ${record.salaryMin},
        salary_max = ${record.salaryMax}, reason = ${record.reason}, justification = ${record.justification},
        requirements = ${tx.json(record.requirements as never)}, competencies = ${tx.json(record.competencies as never)},
        status = 'draft', current_step = null
      where id = ${id}
    `
    await recordAudit(tx, actorOf(ctx), {
      action: 'requisition.updated',
      entityType: 'requisition',
      entityId: id,
      summary: `Requisição ${current.code} editada`,
      changes: { title: record.title, salaryMax: record.salaryMax, headcount: record.headcount },
    })
  })
}

/** Envia para aprovação; sem passos aplicáveis fica aprovada de imediato (registado). */
export async function submitRequisition(ctx: RequestContext, id: string): Promise<void> {
  await withTenant(ctx.tenantId, async (tx) => {
    const [current] = await tx<{ status: string; requestedBy: string; salaryMax: string | null; code: string }[]>`
      select status, requested_by, salary_max, code from requisitions where id = ${id} for update
    `
    if (!current) throw notFound('Requisição')
    if (current.requestedBy !== ctx.user.id && !can(ctx.user.role, 'vacancy.manage')) throw forbidden()
    if (current.status !== 'draft') throw new AppError('CONFLICT', 'A requisição já foi submetida.')
    const steps = await loadSteps(tx)
    const step = firstStep(steps, current.salaryMax === null ? null : Number(current.salaryMax))
    const status = step ? 'pending_approval' : 'approved'
    await tx`
      update requisitions set status = ${status}, current_step = ${step?.position ?? null}, submitted_at = now(),
        decided_at = ${step ? null : new Date()}
      where id = ${id}
    `
    await tx`delete from requisition_approvals where requisition_id = ${id}`
    await recordAudit(tx, actorOf(ctx), {
      action: 'requisition.submitted',
      entityType: 'requisition',
      entityId: id,
      summary: step ? `Requisição ${current.code} enviada para aprovação (${step.label})` : `Requisição ${current.code} aprovada sem passos aplicáveis`,
      changes: { status: { from: 'draft', to: status }, currentStep: step?.position ?? null },
    })
  })
}

const decisionSchema = z
  .object({
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.decision === 'approved' || (data.comment && data.comment.length >= 5), {
    message: 'A rejeição exige um fundamento (mín. 5 caracteres)',
    path: ['comment'],
  })

export async function decideRequisition(ctx: RequestContext, id: string, input: unknown): Promise<void> {
  if (!can(ctx.user.role, 'requisition.approve')) throw forbidden()
  const data = parseInput(decisionSchema, input)
  await withTenant(ctx.tenantId, async (tx) => {
    const [current] = await tx<{ status: string; requestedBy: string; salaryMax: string | null; currentStep: number | null; code: string }[]>`
      select status, requested_by, salary_max, current_step, code from requisitions where id = ${id} for update
    `
    if (!current) throw notFound('Requisição')
    const steps = await loadSteps(tx)
    const step = steps.find((candidate) => candidate.position === current.currentStep) ?? null
    const block = decisionBlock({ status: current.status, requestedBy: current.requestedBy, userId: ctx.user.id, userRole: ctx.user.role, step })
    if (block === 'own_requisition') throw new AppError('FORBIDDEN', 'Separação de funções: não pode aprovar uma requisição que criou.')
    if (block || !step) throw new AppError('FORBIDDEN', 'Não pode decidir este passo de aprovação.')

    await tx`
      insert into requisition_approvals (tenant_id, requisition_id, step_position, role, decided_by, decision, comment)
      values (${ctx.tenantId}, ${id}, ${step.position}, ${step.role}, ${ctx.user.id}, ${data.decision}, ${data.comment ?? null})
    `
    const salaryMax = current.salaryMax === null ? null : Number(current.salaryMax)
    const next = data.decision === 'approved' ? stepAfter(steps, salaryMax, step.position) : null
    const status = data.decision === 'rejected' ? 'rejected' : next ? 'pending_approval' : 'approved'
    await tx`
      update requisitions set status = ${status}, current_step = ${next?.position ?? null},
        decided_at = ${status === 'pending_approval' ? null : new Date()}
      where id = ${id}
    `
    await recordAudit(tx, actorOf(ctx), {
      action: data.decision === 'approved' ? 'requisition.step_approved' : 'requisition.rejected',
      entityType: 'requisition',
      entityId: id,
      summary: `${current.code}: passo "${step.label}" ${data.decision === 'approved' ? 'aprovado' : 'rejeitado'}`,
      changes: { step: step.position, status: { from: current.status, to: status } },
      reason: data.comment ?? null,
    })
  })
}

export async function cancelRequisition(ctx: RequestContext, id: string, reason: string): Promise<void> {
  const cleanReason = parseInput(z.string().trim().min(5, 'Indique o motivo'), reason)
  await withTenant(ctx.tenantId, async (tx) => {
    const [current] = await tx<{ status: string; requestedBy: string; code: string }[]>`
      select status, requested_by, code from requisitions where id = ${id} for update
    `
    if (!current) throw notFound('Requisição')
    if (current.requestedBy !== ctx.user.id && !can(ctx.user.role, 'vacancy.manage')) throw forbidden()
    if (current.status === 'cancelled') return
    const [vacancy] = await tx<{ status: string }[]>`select status from vacancies where requisition_id = ${id}`
    if (vacancy?.status === 'published') throw new AppError('CONFLICT', 'Feche primeiro a vaga publicada.')
    await tx`update requisitions set status = 'cancelled', current_step = null where id = ${id}`
    await recordAudit(tx, actorOf(ctx), {
      action: 'requisition.cancelled',
      entityType: 'requisition',
      entityId: id,
      summary: `Requisição ${current.code} cancelada`,
      changes: { status: { from: current.status, to: 'cancelled' } },
      reason: cleanReason,
    })
  })
}

/** Requisições à espera de decisão do utilizador corrente (para o painel). */
export async function pendingApprovalsFor(ctx: RequestContext): Promise<RequisitionRow[]> {
  if (!can(ctx.user.role, 'requisition.approve')) return []
  const all = await listRequisitions(ctx, 'pending_approval')
  return withTenant(ctx.tenantId, async (tx) => {
    const steps = await loadSteps(tx)
    return all.filter((requisition) => {
      const step = steps.find((candidate) => candidate.position === requisition.currentStep) ?? null
      return decisionBlock({ status: requisition.status, requestedBy: requisition.requestedBy, userId: ctx.user.id, userRole: ctx.user.role, step }) === null
    })
  })
}
