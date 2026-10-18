import { randomBytes } from 'node:crypto'
import { adminSql } from '@/server/db/client'
import { provisionOrganization } from '@/modules/organizations/provision'
import { createUser, listDepartments } from '@/modules/users/service'
import { createRequisition, decideRequisition, submitRequisition } from '@/modules/requisitions/service'
import { createVacancyFromRequisition, getPublicVacancy, getVacancy, publishVacancy, type PublicVacancy } from '@/modules/vacancies/service'
import type { ActorContext, RequestContext } from '@/server/context'
import type { Role } from '@/server/auth/rbac'

export const PASSWORD = 'Teste-Seguro#2026'

export interface TestOrg {
  tenantId: string
  slug: string
  name: string
  admin: RequestContext
  users: Record<'hr' | 'manager' | 'manager2' | 'interviewer' | 'executive' | 'privacy', RequestContext>
  departmentId: string
}

function ctx(tenantId: string, id: string, role: Role, fullName: string, departmentId: string | null = null): RequestContext {
  return { tenantId, user: { id, tenantId, email: '', fullName, role, departmentId }, ip: '127.0.0.1', userAgent: 'vitest', correlationId: 'test-correlation-0001' }
}

export function candidateActor(tenantId: string): ActorContext {
  return { tenantId, actorType: 'candidate', actorId: null, ip: '10.1.1.1', userAgent: 'vitest-mobile', correlationId: 'test-candidate-0001' }
}

/** Organização completa com um utilizador por papel; slugs aleatórios evitam colisões entre testes. */
export async function createTestOrg(label = 'org'): Promise<TestOrg> {
  const suffix = randomBytes(4).toString('hex')
  const slug = `${label}-${suffix}`
  const name = `Empresa ${label} ${suffix}`
  const { tenantId, adminId } = await provisionOrganization(adminSql(), {
    slug,
    name,
    admin: { email: `admin-${suffix}@teste.test`, fullName: 'Admin Teste', password: PASSWORD },
    departments: ['Recursos Humanos', 'Operações', 'Obras'],
  })
  const admin = ctx(tenantId, adminId, 'org_admin', 'Admin Teste')
  const departments = await listDepartments(admin)
  const ops = departments.find((department) => department.name === 'Operações')!.id
  const make = async (key: string, role: Role, departmentId: string | null = null) => {
    const id = await createUser(admin, { email: `${key}-${suffix}@teste.test`, fullName: `${key} teste`, role, departmentId: departmentId ?? '', password: PASSWORD })
    return ctx(tenantId, id, role, `${key} teste`, departmentId)
  }
  return {
    tenantId,
    slug,
    name,
    admin,
    departmentId: ops,
    users: {
      hr: await make('hr', 'hr'),
      manager: await make('manager', 'hiring_manager', ops),
      manager2: await make('manager2', 'hiring_manager', departments.find((department) => department.name === 'Obras')!.id),
      interviewer: await make('interviewer', 'interviewer'),
      executive: await make('executive', 'executive'),
      privacy: await make('privacy', 'privacy_officer'),
    },
  }
}

export const REQUISITION_INPUT = {
  title: 'Fiel de Armazém',
  location: 'Matola',
  contractType: 'a_prazo',
  headcount: 1,
  salaryMin: '18000',
  salaryMax: '24000',
  reason: 'expansao',
  justification: 'Abertura de novo armazém exige controlo de stocks.',
  requirementsMust: 'Experiência em armazém ou gestão de stocks\nCarta de condução profissional',
  requirementsNice: 'Conhecimentos de Excel',
  competencies: 'Rigor: regista movimentos sem erros\nSegurança: cumpre normas de HSE',
}

/** Requisição aprovada (gestor 2 aprova a do gestor 1, depois RH) e vaga publicada com perguntas. */
export async function publishedVacancy(org: TestOrg, overrides: Partial<typeof REQUISITION_INPUT> = {}): Promise<{ vacancyId: string; requisitionId: string; publicVacancy: PublicVacancy }> {
  const requisitionId = await createRequisition(org.users.manager, { ...REQUISITION_INPUT, departmentId: org.departmentId, ...overrides })
  await submitRequisition(org.users.manager, requisitionId)
  await decideRequisition(org.users.manager2, requisitionId, { decision: 'approved' })
  await decideRequisition(org.users.hr, requisitionId, { decision: 'approved' })
  const vacancyId = await createVacancyFromRequisition(org.users.hr, requisitionId)
  await publishVacancy(org.users.hr, vacancyId, {
    summary: 'Controlo de entradas e saídas no armazém da Matola.',
    description: 'Sobre a função\nVai garantir que cada material que entra e sai do armazém fica registado e conferido, apoiando as obras.',
    salaryVisible: '',
    closesOn: '',
    screeningQuestions: 'S/N Tem carta de condução profissional?\n? Onde trabalhou?',
  })
  const detail = await getVacancy(org.users.hr, vacancyId)
  const publicVacancy = (await getPublicVacancy(org.tenantId, detail.slug))!
  return { vacancyId, requisitionId, publicVacancy }
}

export function intakeTarget(org: TestOrg, vacancy: PublicVacancy) {
  return {
    orgSlug: org.slug,
    orgName: org.name,
    vacancy: { vacancyId: vacancy.vacancyId, versionId: vacancy.versionId, title: vacancy.title, requirements: vacancy.requirements, screeningQuestions: vacancy.screeningQuestions },
  }
}

/** Candidato válido; com a vaga, responde "sim" às perguntas obrigatórias. */
export function applicant(overrides: Record<string, unknown> = {}, vacancy?: PublicVacancy) {
  const suffix = randomBytes(3).toString('hex')
  const answers = (vacancy?.screeningQuestions ?? []).filter((question) => question.required).map((question) => ({ questionId: question.id, answer: 'yes' }))
  return { fullName: `Candidato ${suffix} Teste`, email: `cand-${suffix}@exemplo.test`, phone: `84${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`, location: 'Maputo', consent: true, answers, ...overrides }
}
