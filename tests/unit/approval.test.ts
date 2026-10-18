import { describe, expect, it } from 'vitest'
import { applicableSteps, decisionBlock, firstStep, stepAfter, type ApprovalStep } from '@/modules/requisitions/approval'

const steps: ApprovalStep[] = [
  { position: 1, role: 'hiring_manager', label: 'Gestor', minSalaryMax: null },
  { position: 2, role: 'hr', label: 'RH', minSalaryMax: null },
  { position: 3, role: 'executive', label: 'Direcção', minSalaryMax: 100_000 },
]

describe('matriz de aprovação', () => {
  it('aplica o passo com limiar só acima do tecto, ou quando o orçamento é desconhecido', () => {
    expect(applicableSteps(steps, 50_000).map((step) => step.position)).toEqual([1, 2])
    expect(applicableSteps(steps, 100_000).map((step) => step.position)).toEqual([1, 2, 3])
    expect(applicableSteps(steps, null).map((step) => step.position)).toEqual([1, 2, 3])
  })

  it('encadeia os passos aplicáveis', () => {
    expect(firstStep(steps, 50_000)?.position).toBe(1)
    expect(stepAfter(steps, 50_000, 2)).toBeNull()
    expect(stepAfter(steps, 150_000, 2)?.position).toBe(3)
  })

  it('bloqueia o requisitante, o papel errado e decisões fora de aprovação', () => {
    const base = { status: 'pending_approval', requestedBy: 'u1', userId: 'u2', userRole: 'hiring_manager' as const, step: steps[0]! }
    expect(decisionBlock(base)).toBeNull()
    expect(decisionBlock({ ...base, userId: 'u1' })).toBe('own_requisition')
    expect(decisionBlock({ ...base, userRole: 'hr' })).toBe('wrong_role')
    expect(decisionBlock({ ...base, userRole: 'org_admin' })).toBeNull()
    expect(decisionBlock({ ...base, status: 'approved' })).toBe('not_pending')
  })
})
