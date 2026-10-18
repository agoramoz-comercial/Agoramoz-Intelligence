import { describe, expect, it, beforeAll } from 'vitest'
import { createRequisition, decideRequisition, getRequisition, submitRequisition } from '@/modules/requisitions/service'
import { createVacancyFromRequisition, publishVacancy } from '@/modules/vacancies/service'
import { createTestOrg, REQUISITION_INPUT, type TestOrg } from './helpers'

let org: TestOrg

beforeAll(async () => {
  org = await createTestOrg('req')
})

describe('requisições e matriz de aprovação', () => {
  it('valida a requisição na fronteira com mensagens por campo', async () => {
    await expect(createRequisition(org.users.manager, { ...REQUISITION_INPUT, requirementsMust: '', salaryMin: '50000', salaryMax: '10000' })).rejects.toMatchObject({
      code: 'VALIDATION',
      fieldErrors: expect.objectContaining({ requirementsMust: expect.any(String), salaryMax: expect.any(String) }),
    })
  })

  it('percorre gestor → RH e aplica o passo da Direcção só acima do limiar salarial', async () => {
    const low = await createRequisition(org.users.manager, { ...REQUISITION_INPUT, departmentId: org.departmentId })
    await submitRequisition(org.users.manager, low)
    await decideRequisition(org.users.manager2, low, { decision: 'approved' })
    await decideRequisition(org.users.hr, low, { decision: 'approved' })
    expect((await getRequisition(org.admin, low)).requisition.status).toBe('approved')

    const high = await createRequisition(org.users.manager, { ...REQUISITION_INPUT, salaryMin: '90000', salaryMax: '150000' })
    await submitRequisition(org.users.manager, high)
    await decideRequisition(org.users.manager2, high, { decision: 'approved' })
    await decideRequisition(org.users.hr, high, { decision: 'approved' })
    const pending = await getRequisition(org.admin, high)
    expect(pending.requisition.status).toBe('pending_approval')
    expect(pending.currentStep?.role).toBe('executive')
    await decideRequisition(org.users.executive, high, { decision: 'approved' })
    expect((await getRequisition(org.admin, high)).requisition.status).toBe('approved')
  })

  it('separação de funções: quem requisita não aprova; papel errado não decide', async () => {
    const id = await createRequisition(org.users.manager, REQUISITION_INPUT)
    await submitRequisition(org.users.manager, id)
    await expect(decideRequisition(org.users.manager, id, { decision: 'approved' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(decideRequisition(org.users.hr, id, { decision: 'approved' })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejeição exige fundamento e fica registada', async () => {
    const id = await createRequisition(org.users.manager, REQUISITION_INPUT)
    await submitRequisition(org.users.manager, id)
    await expect(decideRequisition(org.users.manager2, id, { decision: 'rejected' })).rejects.toMatchObject({ code: 'VALIDATION' })
    await decideRequisition(org.users.manager2, id, { decision: 'rejected', comment: 'Sem orçamento este trimestre.' })
    const detail = await getRequisition(org.admin, id)
    expect(detail.requisition.status).toBe('rejected')
    expect(detail.approvals[0]?.comment).toBe('Sem orçamento este trimestre.')
  })

  it('nenhuma vaga sem aprovação: criar e publicar exigem requisição aprovada', async () => {
    const id = await createRequisition(org.users.manager, REQUISITION_INPUT)
    await expect(createVacancyFromRequisition(org.users.hr, id)).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('gestor requisitante só vê requisições suas ou do seu departamento', async () => {
    const mine = await createRequisition(org.users.manager, { ...REQUISITION_INPUT, departmentId: org.departmentId })
    await expect(getRequisition(org.users.manager2, mine)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('publicar cria versões imutáveis numeradas', async () => {
    const id = await createRequisition(org.users.manager, REQUISITION_INPUT)
    await submitRequisition(org.users.manager, id)
    await decideRequisition(org.users.manager2, id, { decision: 'approved' })
    await decideRequisition(org.users.hr, id, { decision: 'approved' })
    const vacancyId = await createVacancyFromRequisition(org.users.hr, id)
    const content = { summary: 'Resumo público da vaga de teste.', description: 'x'.repeat(90), salaryVisible: '', closesOn: '', screeningQuestions: '' }
    await publishVacancy(org.users.hr, vacancyId, content)
    await publishVacancy(org.users.hr, vacancyId, { ...content, summary: 'Segunda versão do resumo público.' })
    await expect(publishVacancy(org.users.manager, vacancyId, content)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
